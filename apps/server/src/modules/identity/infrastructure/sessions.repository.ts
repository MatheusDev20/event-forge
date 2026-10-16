import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from './entities/account.entity';
import { SessionEntity } from './entities/session.entity';

@Injectable()
export class SessionsRepository {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
  ) {}

  async create(row: {
    tokenHash: string;
    accountId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.sessions.insert(row);
  }

  /**
   * The account behind a live session, in one query.
   *
   * Expiry is checked in SQL against the database's clock rather than in
   * JavaScript against the server's. With more than one API process, only one
   * of those clocks is shared.
   */
  findAccountByTokenHash(tokenHash: string): Promise<AccountEntity | null> {
    return this.sessions.manager
      .getRepository(AccountEntity)
      .createQueryBuilder('account')
      .innerJoin(SessionEntity, 'session', 'session.account_id = account.id')
      .where('session.token_hash = :tokenHash', { tokenHash })
      .andWhere('session.expires_at > now()')
      .getOne();
  }

  /**
   * Idempotent: deleting a session that is already gone is a successful
   * logout, not an error. A user double-clicking "Log out" should not see one.
   */
  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.sessions.delete({ tokenHash });
  }
}
