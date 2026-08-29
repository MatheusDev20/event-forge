import {
  ConflictException,
  Injectable,
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
import { AllocationsRepository } from '../infrastructure/allocations.repository';

/**
 * Inventory's public application surface — what is free, and soon, who has
 * claimed it.
 *
 * Today it does one thing: turn a published event's layout into allocation
 * rows. Holds arrive in Slice 2, and they arrive *here*, against the rows this
 * method writes.
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
