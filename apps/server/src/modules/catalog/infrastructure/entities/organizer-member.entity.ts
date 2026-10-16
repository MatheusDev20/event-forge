import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ORGANIZER_MEMBER_ROLES } from '../../domain/organizer';
import type { OrganizerMemberRole } from '../../domain/organizer';
import { OrganizerEntity } from './organizer.entity';

/** `'a', 'b'` — for embedding a domain union in a CHECK constraint. */
const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * An account's membership in an organizer.
 *
 * The composite primary key is the rule "an account belongs to an organizer
 * at most once", enforced where it cannot be raced.
 *
 * `organizer_id` has a foreign key — it points inside Catalog. `account_id`
 * deliberately does not: it points into Identity, and ADR-0001 keeps foreign
 * keys from crossing a context boundary, the same way `holds.event_id` does.
 * The account-side index serves the console's one question, "which organizers
 * can I act for?".
 */
@Entity({ name: 'organizer_members' })
@Index('idx_organizer_members_account_id', ['accountId'])
@Check(
  'organizer_members_role_check',
  `"role" IN (${sqlList(ORGANIZER_MEMBER_ROLES)})`,
)
export class OrganizerMemberEntity {
  @PrimaryColumn({
    type: 'uuid',
    name: 'organizer_id',
    primaryKeyConstraintName: 'pk_organizer_members',
  })
  organizerId: string;

  /** Identity's account id. No foreign key, by ADR-0001. */
  @PrimaryColumn({
    type: 'uuid',
    name: 'account_id',
    primaryKeyConstraintName: 'pk_organizer_members',
  })
  accountId: string;

  @ManyToOne(() => OrganizerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'organizer_id',
    foreignKeyConstraintName: 'fk_organizer_members_organizer_id',
  })
  organizer: OrganizerEntity;

  @Column({ type: 'varchar', length: 16 })
  role: OrganizerMemberRole;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
