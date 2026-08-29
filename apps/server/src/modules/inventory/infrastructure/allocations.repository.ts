import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import type { NewAllocation } from '../domain/allocation';
import { AllocationEntity } from './entities/allocation.entity';

/**
 * How many rows go in one INSERT.
 *
 * Postgres caps a statement at 65535 bind parameters, and each allocation row
 * binds ten columns — so ~6500 rows is the hard ceiling and 1000 leaves room
 * for the column list to grow without anyone rediscovering that limit through
 * a production error. A 50k-seat stadium is 50 statements, which is fine for
 * an operation ADR-0006 deliberately made the expensive one.
 */
const INSERT_CHUNK = 1000;

@Injectable()
export class AllocationsRepository {
  constructor(
    @InjectRepository(AllocationEntity)
    private readonly allocations: Repository<AllocationEntity>,
  ) {}

  /**
   * Writes a whole snapshot, in the caller's transaction.
   *
   * `manager` is not optional here, unlike Catalog's `markPublished`. There is
   * no correct way to write a snapshot outside the transaction that published
   * the event — a partial snapshot is an event on sale with some of its seats
   * missing, and no later request could tell that from a sold-out section. The
   * type is what stops that being a matter of remembering.
   *
   * `insert` rather than `save`: `save` would issue a SELECT per row to decide
   * insert-or-update, which for 50k seats is 50k pointless round trips.
   */
  async insertAll(
    allocations: readonly NewAllocation[],
    manager: EntityManager,
  ): Promise<number> {
    const repository = manager.getRepository(AllocationEntity);

    for (let from = 0; from < allocations.length; from += INSERT_CHUNK) {
      await repository.insert(allocations.slice(from, from + INSERT_CHUNK));
    }

    return allocations.length;
  }

  /** Whether this event has already been snapshotted. */
  hasSnapshot(eventId: string, manager?: EntityManager): Promise<boolean> {
    const repository = manager
      ? manager.getRepository(AllocationEntity)
      : this.allocations;

    return repository.existsBy({ eventId });
  }

  countForEvent(eventId: string): Promise<number> {
    return this.allocations.countBy({ eventId });
  }
}
