import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountEntity } from './account.entity';

/**
 * One login: a row per browser that signed in.
 *
 * A database row rather than a signed token (JWT) so that logging out means
 * something. Deleting this row ends the session everywhere at once; a JWT
 * stays valid until it expires, whatever the user clicked.
 *
 * What is stored is a SHA-256 of the token, never the token. Someone reading
 * this table — a backup, a leaked dump — learns nothing they can put in a
 * cookie. A plain hash is enough here, unlike for passwords: the token is 32
 * random bytes, so there is no dictionary to guess from.
 */
@Entity({ name: 'sessions' })
@Index('uq_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('idx_sessions_account_id', ['accountId'])
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 64, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'uuid', name: 'account_id' })
  accountId: string;

  /** Inside Identity, so the database enforces it. Deleting an account ends its sessions. */
  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'account_id',
    foreignKeyConstraintName: 'fk_sessions_account_id',
  })
  account: AccountEntity;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
