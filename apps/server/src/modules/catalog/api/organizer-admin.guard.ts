import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard, type AuthenticatedAccount } from '../../identity';
import { CatalogService } from '../application/catalog.service';

/**
 * A signed-in account that is an admin *of the organizer in the URL* —
 * `:organizerId` — and of no other by implication.
 *
 * Lives in Catalog, not Identity, because "admin of an organizer" is a fact
 * about a Catalog membership; Identity does not know organizers exist.
 *
 * 401 without a session. 403 both when the account is a plain member and when
 * it does not belong to the organizer at all: answering 404 for the second
 * would tell anyone holding a session which organizer ids exist.
 */
@Injectable()
export class OrganizerAdminGuard implements CanActivate {
  constructor(
    private readonly session: SessionGuard,
    private readonly catalog: CatalogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.session.canActivate(context);

    const request = context
      .switchToHttp()
      .getRequest<Request & { account: AuthenticatedAccount }>();
    const organizerId = request.params.organizerId;

    // A malformed id cannot name a membership; refuse it the same way rather
    // than let the uuid cast fail in Postgres as a 500.
    const role = UUID.test(String(organizerId))
      ? await this.catalog.roleIn(String(organizerId), request.account.id)
      : null;

    if (role !== 'admin') {
      throw new ForbiddenException(
        'Only an admin of this organizer can manage its members',
      );
    }

    return true;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
