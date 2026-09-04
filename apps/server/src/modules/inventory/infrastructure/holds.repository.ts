import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import type { HoldableAllocation, HoldRequest } from '../domain/hold';
import { INITIAL_HOLD_STATUS } from '../domain/hold';
import { AllocationEntity } from './entities/allocation.entity';
import { HoldEntity } from './entities/hold.entity';
import { HoldLineEntity } from './entities/hold-line.entity';

/**
 * The locking statement, and the only place in this project where the choice
 * of concurrency control is visible.
 *
 * `FOR UPDATE` takes a row-level exclusive lock: a second transaction naming
 * the same allocation blocks here until the first commits or rolls back, and
 * then re-reads the row it was waiting for. That last clause is the whole
 * mechanism — the loser does not evaluate a stale `held`, it evaluates the
 * winner's.
 *
 * **`ORDER BY id` is not cosmetic.** Locks are taken in the order rows are
 * produced, and two claims naming seats A and B in opposite orders would each
 * hold what the other wants. Postgres detects that and kills one transaction
 * with a deadlock error, which would arrive at a race test looking exactly
 * like a lost seat. A total order over the ids, shared by every request in the
 * system, makes it impossible instead of rare — see `lockOrder`, where the
 * same sort is applied to the parameter list.
 *
 * The strategy is pessimistic on purpose and it is the *baseline*, not the
 * answer: optimistic and serializable are Slice 3, and comparing against a
 * baseline that was never built is how benchmarks become fiction. See
 * docs/adr/0007-pessimistic-locking-baseline.md.
 */
const LOCK_ALLOCATIONS = `
  SELECT "id", "event_id", "capacity", "held", "reserved"
  FROM "allocations"
  WHERE "id" = ANY($1::uuid[])
  ORDER BY "id"
  FOR UPDATE
`;

/**
 * Applying the claim, once the rules have approved it.
 *
 * The `WHERE` clause repeats a condition the locked read already checked, and
 * that redundancy is deliberate: this statement is the last thing between a
 * request and the table, and it should be correct read on its own. If it ever
 * matches zero rows, some assumption above it is wrong — which the service
 * turns into a loud failure rather than a silent partial hold.
 *
 * `version` is bumped by hand because this is raw SQL rather than a TypeORM
 * `save`, and a @VersionColumn that stops moving is worse than no column at
 * all: Slice 3's optimistic strategy would compare against a constant.
 */
const CLAIM_UNITS = `
  UPDATE "allocations"
  SET "held" = "held" + $2, "version" = "version" + 1
  WHERE "id" = $1
    AND "held" + "reserved" + $2 <= "capacity"
`;

type LockedRow = {
  id: string;
  event_id: string;
  capacity: number;
  held: number;
  reserved: number;
};

@Injectable()
export class HoldsRepository {
  constructor(
    @InjectRepository(HoldEntity)
    private readonly holds: Repository<HoldEntity>,
  ) {}

  /** Runs work in one transaction. The boundary a hold has to live inside. */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.holds.manager.transaction(work);
  }

  /**
   * Locks the named allocations and returns them as the domain reads them.
   *
   * Raw SQL rather than TypeORM's `setLock('pessimistic_write')` for one
   * reason: the query builder emits `FOR UPDATE` but gives no control over
   * whether `ORDER BY` survives into the locking plan, and the ordering is the
   * part that must not be optional here. A statement this important should be
   * legible in full at the point it matters.
   *
   * `ids` must already be sorted — `lockOrder` is what sorts them. Passing an
   * unsorted list still locks in id order thanks to the `ORDER BY`, but the
   * parameter list is what a reader compares against, and the two disagreeing
   * would be a trap.
   *
   * Counts as *seen*, not as approved: judging what came back is `refuseHold`'s
   * job, and rows missing from the result are simply absent from the map.
   */
  async lockAllocations(
    ids: readonly string[],
    manager: EntityManager,
  ): Promise<Map<string, HoldableAllocation>> {
    const rows: LockedRow[] = await manager.query(LOCK_ALLOCATIONS, [ids]);

    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          eventId: row.event_id,
          // node-postgres returns bigint-safe types as strings; these columns
          // are plain `integer`, but Number() costs nothing and makes the
          // arithmetic in the domain unambiguous.
          capacity: Number(row.capacity),
          held: Number(row.held),
          reserved: Number(row.reserved),
        },
      ]),
    );
  }

  /**
   * Moves units into `held` for one allocation, inside the caller's
   * transaction.
   *
   * Returns whether the row moved. It always should — the caller holds the
   * lock and the domain already approved the numbers — so `false` means a
   * contradiction rather than a lost race, and the service treats it as one.
   */
  async claimUnits(
    allocationId: string,
    quantity: number,
    manager: EntityManager,
  ): Promise<boolean> {
    const result: [unknown[], number] = await manager.query(CLAIM_UNITS, [
      allocationId,
      quantity,
    ]);

    // node-postgres reports affected rows as the second element for UPDATEs.
    return result[1] > 0;
  }

  /**
   * Writes the hold and its lines. Same transaction, after the units moved.
   *
   * `save` with a cascade rather than two inserts: the lines are worthless
   * without their parent and this is one round trip fewer while a lock is
   * held, which is the only time in this codebase that argument carries weight.
   */
  async record(
    request: HoldRequest,
    expiresAt: Date,
    manager: EntityManager,
  ): Promise<string> {
    const hold = await manager.getRepository(HoldEntity).save({
      eventId: request.eventId,
      holderId: request.holderId,
      status: INITIAL_HOLD_STATUS,
      expiresAt,
      lines: request.lines.map((line) => ({
        allocationId: line.allocationId,
        quantity: line.quantity,
      })) as HoldLineEntity[],
    });

    return hold.id;
  }

  /**
   * A hold with its lines and the allocation each line points at, for the
   * response.
   *
   * Read after the transaction commits, deliberately: what comes back should
   * describe the row that exists, not the object we sent — the same read-back
   * shape Catalog's service uses after every write.
   */
  findById(id: string): Promise<HoldEntity | null> {
    return this.holds.findOne({
      where: { id },
      relations: { lines: { allocation: true } },
      order: { lines: { allocationId: 'ASC' } },
    });
  }

  /**
   * Availability for one event, a page at a time.
   *
   * `capacity - held - reserved` is computed in SQL rather than in JavaScript
   * so `onlyAvailable` can filter on it, and the ordering is by the labels a
   * human reads rather than by id — a seat list sorted by uuid is noise.
   */
  async listAvailability(
    eventId: string,
    options: { page: number; pageSize: number; onlyAvailable: boolean },
  ): Promise<{ items: AllocationEntity[]; total: number }> {
    const query = this.holds.manager
      .createQueryBuilder(AllocationEntity, 'allocation')
      .where('allocation.eventId = :eventId', { eventId });

    if (options.onlyAvailable) {
      query.andWhere(
        'allocation.capacity - allocation.held - allocation.reserved > 0',
      );
    }

    const [items, total] = await query
      .orderBy('allocation.sectionName', 'ASC')
      .addOrderBy('allocation.rowLabel', 'ASC')
      // Seat "10" sorts before "2" as text. Casting only the digits keeps a
      // row reading the way it is printed on a ticket.
      .addOrderBy(
        `NULLIF(regexp_replace(allocation.seat_label, '\\D', '', 'g'), '')::int`,
        'ASC',
      )
      .addOrderBy('allocation.seatLabel', 'ASC')
      .skip((options.page - 1) * options.pageSize)
      .take(options.pageSize)
      .getManyAndCount();

    return { items, total };
  }
}
