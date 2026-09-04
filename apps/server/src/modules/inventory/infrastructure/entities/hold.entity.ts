import {
  Check,
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HOLD_STATUSES } from '../../domain/hold';
import type { HoldStatus } from '../../domain/hold';
import { HoldLineEntity } from './hold-line.entity';

/** `'a', 'b'` — for embedding a domain union in a CHECK constraint. */
const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * A claim on capacity: who took what, and until when.
 *
 * This table is the *record* of a race, not the mechanism of one. Nothing here
 * prevents an oversell — that is `allocations_no_oversell_check` plus the
 * locking statement in `holds.repository.ts`. What these rows make possible is
 * the question the experiment actually asks afterwards: *who won?* A test that
 * can only count HTTP statuses is measuring the API; one that can name the
 * single holder of a seat is measuring the system.
 *
 * `event_id` carries no foreign key, by ADR-0001 — it points into Catalog.
 * `hold_lines` does carry them, because it points only at Inventory's own
 * tables and inside a boundary the database should enforce what it can.
 *
 * Every index and constraint is declared with the name the migration gives it;
 * `migration:generate` diffs entity metadata against the live schema, and
 * anything undeclared here reads as drift.
 */
@Entity({ name: 'holds' })
@Index('idx_holds_event_id', ['eventId'])
@Index('idx_holds_holder_id', ['holderId'])
/**
 * Partial on `active`: it is the only status a sweeper or a read-time expiry
 * check would scan, and finished holds will outnumber live ones by orders of
 * magnitude within a day of any real traffic.
 */
@Index('idx_holds_active_expires_at', ['expiresAt'], {
  where: `"status" = 'active'`,
})
@Check('holds_status_check', `"status" IN (${sqlList(HOLD_STATUSES)})`)
@Check('holds_expires_after_creation_check', `"expires_at" > "created_at"`)
export class HoldEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Catalog's event id. No foreign key, by ADR-0001. */
  @Column({ type: 'uuid', name: 'event_id' })
  eventId: string;

  /**
   * Whoever is claiming. Opaque until Identity exists (Slice 4).
   *
   * A uuid rather than a string because it will become a user id, and the race
   * needs it to be stable per claimant so the winner can be named — not
   * because anything authenticates it today. Nothing does.
   */
  @Column({ type: 'uuid', name: 'holder_id' })
  holderId: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: HoldStatus;

  /**
   * When this claim stops being worth anything.
   *
   * **Written, not enforced.** No sweeper reads it and no availability query
   * discounts it, so an expired hold currently keeps its units off sale
   * forever. That is a known, deliberate gap: expiry is its own experiment
   * (docs/roadmap.md) and needs an injectable clock to be testable at all. The
   * column exists now so that experiment is a change of behaviour rather than
   * a migration.
   */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @OneToMany(() => HoldLineEntity, (line) => line.hold, { cascade: ['insert'] })
  lines: HoldLineEntity[];
}
