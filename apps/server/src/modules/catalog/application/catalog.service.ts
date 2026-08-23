import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import type { NewEvent } from '../domain/new-event';
import type { EventEntity } from '../infrastructure/entities/event.entity';
import { EventsRepository } from '../infrastructure/events.repository';

export type EventPage = {
  items: EventEntity[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * Catalog's public application surface. Other modules — and the HTTP edge —
 * call this; nothing reaches for EventsRepository directly.
 *
 * Note what is absent: no contract types. This layer speaks the domain's
 * language, and mapping to the wire shape happens in api/.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly events: EventsRepository) {}

  async listPublicEvents(criteria: ListEventsCriteria): Promise<EventPage> {
    const { items, total } = await this.events.listPublic(criteria);

    return {
      items,
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
      pageCount: Math.ceil(total / criteria.pageSize),
    };
  }

  /**
   * Creates a draft event with its price tiers and their section mapping.
   *
   * Order matters: everything the request points at is checked first, so the
   * common mistakes come back as a clear 404 or 400 rather than as a foreign
   * key violation translated after the fact. What survives that is still racy —
   * another request can take the slug in between — so the unique index remains
   * the actual authority, and its violation becomes a 409.
   */
  async createEvent(draft: NewEvent): Promise<EventEntity> {
    const refs = await this.events.checkReferences(draft);

    if (!refs.venueExists) {
      throw new NotFoundException(`No venue with id "${draft.venueId}"`);
    }

    if (!refs.organizerExists) {
      throw new NotFoundException(
        `No organizer with id "${draft.organizerId}"`,
      );
    }

    if (!refs.seatMapBelongsToVenue) {
      // Not a 404: the seat map may well exist, just not at this venue. The
      // database would refuse this too — see the composite foreign key on
      // events — but saying so plainly beats a constraint name in a log.
      throw new BadRequestException(
        `Seat map "${draft.seatMapId}" does not belong to venue "${draft.venueId}"`,
      );
    }

    if (refs.foreignSectionIds.length > 0) {
      throw new BadRequestException(
        `Sections are not part of seat map "${draft.seatMapId}": ` +
          refs.foreignSectionIds.join(', '),
      );
    }

    const id = await this.events.create(draft).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `An event with slug "${draft.slug}" already exists`,
        );
      }

      throw error;
    });

    const created = await this.events.findById(id);

    if (!created) {
      // The row was committed a moment ago; not finding it means something is
      // wrong with the connection or the transaction, not with the request.
      throw new InternalServerErrorException(
        'Created event could not be read back',
      );
    }

    return created;
  }

  async getPublicEventBySlug(slug: string): Promise<EventEntity> {
    const event = await this.events.findPublicBySlug(slug);

    if (!event) {
      // Deliberately the same response for "never existed" and "exists but is
      // still a draft": the public API must not leak an organizer's unpublished
      // event through a 403.
      throw new NotFoundException(`No published event with slug "${slug}"`);
    }

    return event;
  }
}

/** Postgres 23505 — a unique index rejected the write. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  );
}
