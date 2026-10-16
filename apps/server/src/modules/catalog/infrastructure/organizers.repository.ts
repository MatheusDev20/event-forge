import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MemberOrganizer, OrganizerMemberRole } from '../domain/organizer';
import { OrganizerMemberEntity } from './entities/organizer-member.entity';
import { OrganizerEntity } from './entities/organizer.entity';

/** One membership, as Catalog stores it: an opaque account id and a role. */
export type Membership = { accountId: string; role: OrganizerMemberRole };

@Injectable()
export class OrganizersRepository {
  constructor(
    @InjectRepository(OrganizerEntity)
    private readonly organizers: Repository<OrganizerEntity>,
    @InjectRepository(OrganizerMemberEntity)
    private readonly members: Repository<OrganizerMemberEntity>,
  ) {}

  /**
   * The organizer and its first admin, in one transaction. An organizer with
   * no admin is one nobody could ever add people to.
   */
  createWithAdmin(name: string, accountId: string): Promise<MemberOrganizer> {
    return this.organizers.manager.transaction(async (manager) => {
      const organizer = await manager.save(
        manager.create(OrganizerEntity, { name }),
      );

      const role: OrganizerMemberRole = 'admin';
      await manager.insert(OrganizerMemberEntity, {
        organizerId: organizer.id,
        accountId,
        role,
      });

      return { id: organizer.id, name: organizer.name, role };
    });
  }

  exists(organizerId: string): Promise<boolean> {
    return this.organizers.existsBy({ id: organizerId });
  }

  /** The account's role in the organizer, or null when it is not a member. */
  async roleOf(
    organizerId: string,
    accountId: string,
  ): Promise<OrganizerMemberRole | null> {
    const membership = await this.members.findOne({
      select: { role: true },
      where: { organizerId, accountId },
    });

    return membership?.role ?? null;
  }

  /** Oldest first, so an organizer's first admin leads its list. */
  async listMemberships(organizerId: string): Promise<Membership[]> {
    const rows = await this.members.find({
      where: { organizerId },
      order: { createdAt: 'ASC', accountId: 'ASC' },
    });

    return rows.map(({ accountId, role }) => ({ accountId, role }));
  }

  /**
   * Throws the driver's unique violation if the account is already a member —
   * the composite primary key decides, not a prior SELECT.
   */
  async addMember(
    organizerId: string,
    accountId: string,
    role: OrganizerMemberRole,
  ): Promise<void> {
    await this.members.insert({ organizerId, accountId, role });
  }

  /**
   * Every organizer the account belongs to, oldest membership first — so the
   * console's default choice is the organizer someone was added to first, not
   * whichever came last.
   */
  listForAccount(accountId: string): Promise<MemberOrganizer[]> {
    return this.organizers
      .createQueryBuilder('organizer')
      .innerJoin(
        OrganizerMemberEntity,
        'member',
        'member.organizer_id = organizer.id',
      )
      .select('organizer.id', 'id')
      .addSelect('organizer.name', 'name')
      .addSelect('member.role', 'role')
      .where('member.account_id = :accountId', { accountId })
      .orderBy('member.created_at', 'ASC')
      .addOrderBy('organizer.id', 'ASC')
      .getRawMany<MemberOrganizer>();
  }
}
