import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AccountRole } from '../domain/account';
import { AccountEntity } from './entities/account.entity';

@Injectable()
export class AccountsRepository {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * Inserts and returns the row. Throws the driver's unique violation when the
   * email is taken — the service owns turning that into a 409, because the
   * index, not a prior SELECT, is what actually decides.
   */
  create(row: {
    email: string;
    name: string;
    passwordHash: string;
    role: AccountRole;
  }): Promise<AccountEntity> {
    return this.accounts.save(this.accounts.create(row));
  }

  findByEmail(email: string): Promise<AccountEntity | null> {
    return this.accounts.findOneBy({ email });
  }

  findByIds(ids: string[]): Promise<AccountEntity[]> {
    if (ids.length === 0) return Promise.resolve([]);

    return this.accounts.findBy({ id: In(ids) });
  }
}
