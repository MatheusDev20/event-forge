import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  addOrganizerMemberRequestSchema,
  organizerIdSchema,
  type AddOrganizerMemberBody,
  type ListMyOrganizersResponse,
  type ListOrganizerMembersResponse,
  type OrganizerMember,
} from '@repo/contracts/catalog';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import {
  CurrentAccount,
  SessionGuard,
  type AuthenticatedAccount,
} from '../../identity';
import { CatalogService } from '../application/catalog.service';
import { OrganizerAdminGuard } from './organizer-admin.guard';

/**
 * The signed-in account's organizers, and — for the admins of one — its
 * people.
 *
 * There is no route that creates an organizer: those come from
 * `pnpm org:create`, with their first admin. Everything an admin can do here
 * is scoped by `:organizerId` and checked against their own membership in it
 * (OrganizerAdminGuard), so being an admin of one organizer grants nothing in
 * any other.
 */
@Controller('organizers')
export class OrganizersController {
  constructor(private readonly catalog: CatalogService) {}

  /** Mine, not all. Empty means "not assigned yet" — the console says so. */
  @Get()
  @UseGuards(SessionGuard)
  async listMine(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<ListMyOrganizersResponse> {
    return { items: await this.catalog.listOrganizersFor(account.id) };
  }

  @Get(':organizerId/members')
  @UseGuards(OrganizerAdminGuard)
  async members(
    @Param('organizerId', new ZodValidationPipe(organizerIdSchema))
    organizerId: string,
  ): Promise<ListOrganizerMembersResponse> {
    return { items: await this.catalog.listOrganizerMembers(organizerId) };
  }

  /**
   * Creates the person's account and adds them. 201 with the member; 409 if
   * the email already has an account.
   */
  @Post(':organizerId/members')
  @UseGuards(OrganizerAdminGuard)
  addMember(
    @Param('organizerId', new ZodValidationPipe(organizerIdSchema))
    organizerId: string,
    @Body(new ZodValidationPipe(addOrganizerMemberRequestSchema))
    body: AddOrganizerMemberBody,
  ): Promise<OrganizerMember> {
    return this.catalog.addOrganizerMember(organizerId, body);
  }
}
