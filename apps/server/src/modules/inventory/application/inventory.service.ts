import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CatalogService } from '../../catalog';
import {
  planSnapshot,
  snapshotCapacity,
  snapshotRefusal,
} from '../domain/allocation';
import type { SnapshotRefusal } from '../domain/allocation';
import {
  holdExpiry,
  HoldRefusedError,
  lockOrder,
  refuseHold,
} from '../domain/hold';
import type { HoldRequest } from '../domain/hold';
import { AllocationsRepository } from '../infrastructure/allocations.repository';
import type { AllocationEntity } from '../infrastructure/entities/allocation.entity';
import type { HoldEntity } from '../infrastructure/entities/hold.entity';
import { HoldsRepository } from '../infrastructure/holds.repository';

/**
 * Inventory's public application surface — what is free, and soon, who has
 * claimed it.
 *
 * Two things happen here. `snapshotPublishedEvent` turns a published event's
 * layout into allocation rows — the act that creates something scarce — and
 * `placeHold` is what two requests then fight over. Everything else in this
 * project is scaffolding around those two methods.
 *
 * Note the direction of the only import that crosses a boundary:
 * `CatalogService`, through Catalog's index.ts. Inventory reads Catalog and
 * Catalog knows nothing of Inventory — the arrow the context map draws.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly allocations: AllocationsRepository,
    private readonly holds: HoldsRepository,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * Materialises one event's capacity from the seat map it was published with.
   *
   * Runs inside Catalog's publish transaction (see DomainEventBus), so every
   * throw below rolls the publish back. That is the intended behaviour, not a
   * side effect: ADR-0006 requires the status change and the snapshot to be
   * one atomic fact, and an event that reached `published` with no allocations
   * would be on sale with nothing to sell and no way to notice.
   *
   * The idempotency check is not decoration. `EventPublished` fires inside a
   * transaction that can be retried, and a second snapshot would double every
   * seat — the unique indexes would catch it, but a clear refusal beats a
   * constraint name in a log.
   */
  async snapshotPublishedEvent(
    eventId: string,
    seatMapId: string,
    manager: EntityManager,
  ): Promise<number> {
    if (await this.allocations.hasSnapshot(eventId, manager)) {
      throw new ConflictException(
        `Event "${eventId}" already has allocations; refusing to snapshot twice`,
      );
    }

    const layout = await this.catalog.getSeatMapLayout(seatMapId);

    if (!layout) {
      // Catalog said this event has a seat map and now cannot produce it. That
      // is not a request problem — it is our two contexts disagreeing inside
      // one transaction, and it should take the publish down.
      throw new NotFoundException(
        `Seat map "${seatMapId}" vanished between publish and snapshot`,
      );
    }

    const refusal = snapshotRefusal(layout);

    if (refusal) {
      throw new ConflictException(describeRefusal(refusal, seatMapId));
    }

    const rows = planSnapshot(eventId, layout);
    await this.allocations.insertAll(rows, manager);

    this.logger.log(
      `Snapshotted event ${eventId}: ${rows.length} allocations, ` +
        `${snapshotCapacity(layout)} units on sale`,
    );

    return rows.length;
  }

  /** How many allocation rows an event has. For tests and, later, availability. */
  countAllocations(eventId: string): Promise<number> {
    return this.allocations.countForEvent(eventId);
  }

  /**
   * What this event still has to sell, a page at a time.
   *
   * Every number here is stale the instant it is read, and deliberately so.
   * The alternative — a read that locks what it reports — would make browsing
   * a seat map serialise against selling it, which is the wrong trade for a
   * page nobody is committed by. `placeHold` re-decides under a lock, so a
   * client acting on a stale number loses a race rather than oversells.
   */
  listAvailability(
    eventId: string,
    options: { page: number; pageSize: number; onlyAvailable: boolean },
  ): Promise<{ items: AllocationEntity[]; total: number }> {
    return this.holds.listAvailability(eventId, options);
  }

  /**
   * **Claims capacity. This is the experiment.**
   *
   * Four steps, and the order of every one of them is load-bearing:
   *
   * 1. **The event must be selling.** `docs/domain-model.md` is binding: only
   *    an `on_sale` event accepts holds. Asked before the transaction opens,
   *    because it is a cheap single-column read and there is no reason to hold
   *    a row lock while doing it. The cost is a window — an event closed
   *    between this read and the UPDATE still accepts one last hold. That is
   *    accepted, and it is not the race this project is about; closing an
   *    event is not something thousands of requests do per second.
   * 2. **Lock the rows, in id order.** `lockOrder` sorts, `lockAllocations`
   *    takes `FOR UPDATE`. From here until commit, no other transaction can
   *    read-for-update or modify these rows — so every subsequent line reasons
   *    about numbers that cannot move underneath it.
   * 3. **Judge what was locked.** `refuseHold` is pure and knows nothing about
   *    locks; what makes its answer trustworthy is exclusively that it was
   *    handed rows already locked in step 2. Run against an unlocked read it
   *    would be a race condition wearing a domain function's clothes.
   * 4. **Write, then record.** Units move first and the hold is recorded
   *    second, inside the same transaction, so there is no instant at which a
   *    hold exists against units nobody took.
   *
   * And underneath all four, `allocations_no_oversell_check`. If every line of
   * reasoning above is wrong, the CHECK still refuses the write — which is the
   * difference between an experiment and a hope. A broken strategy cannot
   * oversell here; it can only fail loudly.
   */
  async placeHold(request: HoldRequest): Promise<HoldEntity> {
    const status = await this.catalog.getEventStatus(request.eventId);

    if (status === null) {
      throw new HoldRefusedError({ reason: 'event_not_found' });
    }

    if (status !== 'on_sale') {
      throw new HoldRefusedError({ reason: 'event_not_on_sale', status });
    }

    const holdId = await this.holds.transaction(async (manager) => {
      const locked = await this.holds.lockAllocations(
        lockOrder(request),
        manager,
      );

      const refusal = refuseHold(request, locked);

      // Throwing rather than returning is what rolls the transaction back,
      // and the rollback is the point: a refusal must leave no trace of the
      // rows it looked at, locked or otherwise.
      if (refusal) throw new HoldRefusedError(refusal);

      for (const line of request.lines) {
        if (
          !(await this.holds.claimUnits(
            line.allocationId,
            line.quantity,
            manager,
          ))
        ) {
          /*
           * Unreachable, and checked anyway. The row is locked and the domain
           * approved the arithmetic a moment ago, so a zero-row UPDATE means
           * the lock did not do what this method believes it does. Rolling
           * back and shouting beats committing a hold for units nobody took —
           * and in a project whose whole point is proving a locking strategy,
           * a silently wrong lock is the one failure that must not be quiet.
           */
          throw new InternalServerErrorException(
            `Allocation "${line.allocationId}" did not accept ${line.quantity} unit(s) while locked`,
          );
        }
      }

      return this.holds.record(request, holdExpiry(new Date()), manager);
    });

    const hold = await this.holds.findById(holdId);

    if (!hold) {
      throw new InternalServerErrorException(
        'Placed hold could not be read back',
      );
    }

    return hold;
  }
}

/** A holder id for an anonymous claim. Identity is Slice 4. */
export function anonymousHolderId(): string {
  return randomUUID();
}

/**
 * A refusal, said to whoever tried to publish.
 *
 * Same split as Catalog's `describeBlocker`: the domain decides the rule, the
 * application decides the wording. These surface as the publish request's
 * error, because that is the request that is about to be rolled back.
 */
function describeRefusal(refusal: SnapshotRefusal, seatMapId: string): string {
  switch (refusal.reason) {
    case 'no_sections':
      return `Seat map "${seatMapId}" has no sections, so there is nothing to put on sale`;
    case 'empty_sections':
      return `Cannot put an empty section on sale: ${refusal.sectionNames.join(', ')}`;
  }
}
