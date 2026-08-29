import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { ALLOCATION_KINDS } from '../../domain/allocation';
import type { AllocationKind } from '../../domain/allocation';

/** `'a', 'b'` — for embedding a domain union in a CHECK constraint. */
const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * A unit of capacity on sale for one Event. The contended row.
 *
 * **`allocations_no_oversell_check` is the most important line in this
 * project.** `docs/domain-model.md` names `held + reserved ≤ capacity` as the
 * invariant this whole context exists to keep, "always, under any
 * interleaving" — and no amount of application-level locking can promise that
 * on its own, because the promise has to survive code that is wrong. As a
 * CHECK, Postgres refuses the write instead. When the roadmap's race test
 * fires N requests at one seat, a broken locking strategy cannot oversell; it
 * can only fail loudly, which is the difference between an experiment and a
 * hope.
 *
 * No foreign key to `events`. Per ADR-0001 cross-context references are plain
 * ids, and per ADR-0006 this table is a *snapshot* — it must keep describing
 * what was sold even after Catalog re-letters the venue it came from. The
 * denormalised labels below are that snapshot; `catalog_*_id` is for tracing,
 * not for joining.
 *
 * Every index and constraint is declared with the name the migration gives it.
 * `migration:generate` diffs entities against the live schema, so anything
 * undeclared here reads as drift and the next generated migration would offer
 * to drop it.
 */
@Entity({ name: 'allocations' })
@Index('idx_allocations_event_id', ['eventId'])
@Index('idx_allocations_event_id_section', ['eventId', 'catalogSectionId'])
/**
 * One allocation per seat per event. NULLs do not collide in a Postgres unique
 * index, so general-admission rows — whose `catalog_seat_id` is NULL — are
 * simply not constrained by this one, which is the behaviour we want.
 */
@Index('allocations_seat_unique_per_event', ['eventId', 'catalogSeatId'], {
  unique: true,
})
/**
 * And the GA half of the same guarantee, which needs a partial index precisely
 * because a seated section legitimately has thousands of rows sharing its
 * section id. Together the two make a second snapshot of the same event
 * impossible rather than merely unlikely.
 */
@Index('allocations_ga_unique_per_event', ['eventId', 'catalogSectionId'], {
  unique: true,
  where: `"kind" = 'general_admission'`,
})
@Check('allocations_kind_check', `"kind" IN (${sqlList(ALLOCATION_KINDS)})`)
@Check('allocations_capacity_positive_check', `"capacity" > 0`)
@Check('allocations_non_negative_check', `"held" >= 0 AND "reserved" >= 0`)
@Check('allocations_no_oversell_check', `"held" + "reserved" <= "capacity"`)
@Check(
  'allocations_seat_identity_matches_kind_check',
  `("kind" = 'seated'
      AND "catalog_seat_id" IS NOT NULL
      AND "row_label" IS NOT NULL
      AND "seat_label" IS NOT NULL
      AND "capacity" = 1)
   OR ("kind" = 'general_admission'
      AND "catalog_seat_id" IS NULL
      AND "row_label" IS NULL
      AND "seat_label" IS NULL)`,
)
export class AllocationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Catalog's event id. No foreign key, by ADR-0001. */
  @Column({ type: 'uuid', name: 'event_id' })
  eventId: string;

  @Column({ type: 'varchar', length: 24 })
  kind: AllocationKind;

  @Column({ type: 'uuid', name: 'catalog_section_id' })
  catalogSectionId: string;

  /** The seat this unit is. NULL for a counter, by constraint. */
  @Column({ type: 'uuid', name: 'catalog_seat_id', nullable: true })
  catalogSeatId: string | null;

  /* The snapshot: what a ticket prints, frozen at publish time. */

  @Column({ type: 'varchar', name: 'section_name', length: 120 })
  sectionName: string;

  @Column({ type: 'varchar', name: 'row_label', length: 16, nullable: true })
  rowLabel: string | null;

  @Column({ type: 'varchar', name: 'seat_label', length: 16, nullable: true })
  seatLabel: string | null;

  /** 1 for a seat, the section's capacity for a counter. */
  @Column({ type: 'int' })
  capacity: number;

  /** Claimed but not yet paid for. Released by expiry, cancellation or failure. */
  @Column({ type: 'int', default: 0 })
  held: number;

  /** Paid for. Terminal. */
  @Column({ type: 'int', default: 0 })
  reserved: number;

  /**
   * For the optimistic strategy the roadmap wants compared against pessimistic
   * locking. Present from the first migration so switching strategies is a
   * change of query rather than a change of schema — otherwise the comparison
   * would need a migration between runs and stop being a fair one.
   */
  @VersionColumn({ type: 'int' })
  version: number;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
