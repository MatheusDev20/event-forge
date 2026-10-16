import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ACCOUNT_ROLES } from '../../domain/account';
import type { AccountRole } from '../../domain/account';

/** `'a', 'b'` — for embedding a domain union in a CHECK constraint. */
const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * A person's login.
 *
 * Nothing outside Identity reads this table (docs/domain-model.md): other
 * contexts hold an account id and nothing else, and none of them carries a
 * foreign key into it, by ADR-0001.
 *
 * The unique index is on `email` as stored, and that is enough only because
 * the contract lower-cases and trims every email before it gets here. The
 * index is the authority on "already registered"; the service turns its
 * violation into a 409.
 */
@Entity({ name: 'accounts' })
@Index('uq_accounts_email', ['email'], { unique: true })
@Check('accounts_role_check', `"role" IN (${sqlList(ACCOUNT_ROLES)})`)
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** `scrypt$N$r$p$salt$hash` — see PasswordHasher. Never leaves this context. */
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 16 })
  role: AccountRole;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
