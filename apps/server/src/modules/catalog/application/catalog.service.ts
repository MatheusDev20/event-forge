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
import { publishBlocker } from '../domain/publish-event';
import type { PublishBlocker } from '../domain/publish-event';
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

    return this.readBack(id, 'Created');
  }

  /**
   * Publishes a draft.
   *
   * Two phases, and the split is deliberate. The rules run first so an
   * organizer gets a message naming the section they forgot to price; the
   * conditional UPDATE runs second and is what actually decides, because
   * between the two a concurrent request can publish the same draft. Checking
   * for a good error and letting the database settle the race is the same
   * shape `createEvent` uses against the slug's unique index.
   */
  async publishEvent(id: string): Promise<EventEntity> {
    const candidate = await this.events.findPublishCandidate(id);

    if (!candidate) {
      throw new NotFoundException(`No event with id "${id}"`);
    }

    const blocker = publishBlocker(candidate);

    if (blocker) {
      throw new ConflictException(describeBlocker(blocker));
    }

    if (!(await this.events.markPublished(id))) {
      // Every rule passed against a draft, and by the time the UPDATE ran the
      // row was no longer one. Someone else's transition is the one that
      // happened; saying so beats reporting a success that was not ours.
      throw new ConflictException(
        `Event "${id}" was published concurrently by another request`,
      );
    }

    /*
     * Slice 1 hooks in exactly here: ADR-0006 has Inventory copy the seat map
     * into allocation rows on EventPublished, inside this transition. Nothing
     * is emitted yet on purpose — an in-process bus with no subscribers is
     * decorative, and the ADR is explicit that this signal is what makes it
     * load-bearing. When it arrives, the UPDATE and the snapshot become one
     * transaction.
     */

    return this.readBack(id, 'Published');
  }

  /**
   * Re-reads an event with its relations straight after writing it, so the
   * response describes the row that exists rather than the one we sent.
   *
   * A miss is not a request problem — the write committed a moment ago — so it
   * is a 500 about our connection, not a 404 about their id.
   */
  private async readBack(id: string, wrote: string): Promise<EventEntity> {
    const event = await this.events.findById(id);

    if (!event) {
      throw new InternalServerErrorException(
        `${wrote} event could not be read back`,
      );
    }

    return event;
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

/**
 * A blocker, said to whoever tried to publish.
 *
 * The domain decides the rule and this decides the wording — the same split
 * the mapper makes for reads. Every one of these is a 409: the request is
 * well-formed, the event is simply not in a state that permits the transition.
 */
function describeBlocker(blocker: PublishBlocker): string {
  switch (blocker.reason) {
    case 'wrong_status':
      return `Only a draft can be published; this event is "${blocker.status}"`;
    case 'no_seat_map':
      return 'Cannot publish an event with no seat map: publishing is when a layout becomes what is on sale';
    case 'no_price_tiers':
      return 'Cannot publish an event with no price tiers';
    case 'empty_seat_map':
      return 'Cannot publish an event whose seat map has no capacity: every section is empty';
    case 'unpriced_sections':
      return `Every section must be priced before publishing. Unpriced: ${blocker.sectionNames.join(', ')}`;
  }
}

/** Postgres 23505 — a unique index rejected the write. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  );
}
