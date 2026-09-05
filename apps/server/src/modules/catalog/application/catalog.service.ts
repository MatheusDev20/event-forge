import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DomainEventBus } from '../../../shared/events';
import type { EventStatus } from '../domain/event';
import { acceptHeroImage } from '../domain/hero-image';
import type { HeroImageRejection, HeroImageUpload } from '../domain/hero-image';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import type { ListVenuesCriteria } from '../domain/list-venues-criteria';
import type { NewEvent } from '../domain/new-event';
import { onSaleBlocker, publishBlocker } from '../domain/publish-event';
import type { OnSaleBlocker, PublishBlocker } from '../domain/publish-event';
import type { SeatMapLayout, VenueSeatMap } from '../domain/seat-map';
import type { EventEntity } from '../infrastructure/entities/event.entity';
import type { VenueEntity } from '../infrastructure/entities/venue.entity';
import { EventsRepository } from '../infrastructure/events.repository';
import { HeroImageStorage } from '../infrastructure/hero-image.storage';
import { VenuesRepository } from '../infrastructure/venues.repository';

export type EventPage = {
  items: EventEntity[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type VenuePage = {
  items: VenueEntity[];
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
  constructor(
    private readonly events: EventsRepository,
    private readonly heroImages: HeroImageStorage,
    private readonly bus: DomainEventBus,
    private readonly venues: VenuesRepository,
  ) {}

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

    /*
     * ADR-0006: the status change and Inventory's snapshot are one atomic
     * fact. Both happen inside this transaction, so a layout that cannot be
     * put on sale takes the publish down with it and the event stays a draft —
     * rather than reaching `published` with nothing to sell, which no later
     * request could detect, let alone repair.
     *
     * The bus call is synchronous and its handlers write through `manager`.
     * See DomainEventBus for why that coupling is deliberate here and would be
     * wrong on the hold path.
     */
    const published = await this.events.transaction(async (manager) => {
      if (!(await this.events.markPublished(id, manager))) return false;

      await this.bus.publish(
        {
          name: 'EventPublished',
          eventId: id,
          // Not null: `publishBlocker` refuses an event without a seat map, so
          // reaching here means the check above already proved this.
          seatMapId: candidate.seatMapId!,
          occurredAt: new Date(),
        },
        manager,
      );

      return true;
    });

    if (!published) {
      // Every rule passed against a draft, and by the time the UPDATE ran the
      // row was no longer one. Someone else's transition is the one that
      // happened; saying so beats reporting a success that was not ours.
      throw new ConflictException(
        `Event "${id}" was published concurrently by another request`,
      );
    }

    return this.readBack(id, 'Published');
  }

  /**
   * Replaces an event's hero image with an uploaded one.
   *
   * The order is the interesting part. The event is looked up first so an
   * upload against a mistyped id costs a query rather than a written file; the
   * bytes are judged next, because the domain's answer decides whether there is
   * anything to store at all; and only then is anything written. Storing before
   * validating would mean every rejected `.exe` still landed on disk.
   *
   * Two things can still go wrong after the write, and they are not the same:
   *
   * - The event was deleted between the lookup and the UPDATE. Nothing points
   *   at the new file, so it is removed and the caller gets the 404 they would
   *   have got a moment earlier.
   * - The event had an image already. That file is now unreferenced, so it goes
   *   too — best-effort and after the pointer moved, because a stale file is
   *   waste while a missing one is a broken page.
   *
   * The previous URL is read from the pre-update row rather than from the
   * UPDATE itself, which leaves a window: two uploads racing on one event can
   * both see the same predecessor, and the file written by the loser is then
   * orphaned. That is a few unreferenced kilobytes in a scenario — one
   * organizer replacing the same artwork twice at once — that costs more to
   * close than it costs to leak. It is deliberate, not overlooked.
   */
  async replaceHeroImage(
    id: string,
    upload: HeroImageUpload,
  ): Promise<EventEntity> {
    const existing = await this.events.findById(id);

    if (!existing) {
      throw new NotFoundException(`No event with id "${id}"`);
    }

    const judged = acceptHeroImage(upload);

    if (!judged.ok) {
      // A plain message, like `describeBlocker`'s: the filter turns a 400 into
      // VALIDATION_FAILED on its own, and `ERROR_CODES` is a contract — which
      // ADR-0003 keeps at the HTTP edge, not in here.
      throw new BadRequestException(describeRejection(judged.rejection));
    }

    const url = await this.heroImages.put(id, judged.image);

    if (!(await this.events.setHeroImageUrl(id, url))) {
      await this.heroImages.discard(url);
      throw new NotFoundException(`No event with id "${id}"`);
    }

    if (existing.heroImageUrl) {
      await this.heroImages.discard(existing.heroImageUrl);
    }

    return this.readBack(id, 'Updated');
  }

  /**
   * Opens sales. `published → on_sale`, and nothing else.
   *
   * Separate from publish because the domain model is binding: only an
   * `on_sale` event accepts holds, and an organizer needs the page live before
   * the tickets move. No snapshot happens here — Inventory already has its
   * rows — so this needs no transaction beyond the single conditional UPDATE,
   * which is once again the thing that actually decides under concurrency.
   */
  async putEventOnSale(id: string): Promise<EventEntity> {
    const event = await this.events.findById(id);

    if (!event) {
      throw new NotFoundException(`No event with id "${id}"`);
    }

    const blocker = onSaleBlocker(event.status);

    if (blocker) {
      throw new ConflictException(describeOnSaleBlocker(blocker));
    }

    if (!(await this.events.markOnSale(id))) {
      throw new ConflictException(
        `Event "${id}" changed status concurrently; it is no longer publishable for sale`,
      );
    }

    return this.readBack(id, 'Opened for sale');
  }

  /**
   * An event's status, for another bounded context.
   *
   * Inventory asks this before granting a hold, because docs/domain-model.md
   * is binding: only an `on_sale` event accepts holds. Catalog answers with a
   * status and nothing else — Inventory has no business reading an event, and
   * this method is what keeps that true while still letting the rule be
   * enforced.
   *
   * Null means no such event. The caller decides whether that is a 404.
   */
  getEventStatus(id: string): Promise<EventStatus | null> {
    return this.events.findStatus(id);
  }

  /**
   * A seat map, for another bounded context.
   *
   * Catalog's sanctioned export of the layout (ADR-0001): Inventory calls this
   * during publish to snapshot what it is selling. It hands over a copy and
   * keeps no interest in what happens to it — ADR-0006's whole point.
   */
  getSeatMapLayout(seatMapId: string): Promise<SeatMapLayout | null> {
    return this.events.findSeatMapLayout(seatMapId);
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

  /**
   * The rooms, paginated.
   *
   * Read-only and unfiltered by any notion of visibility, unlike
   * `listPublicEvents`: a venue has no status to hide behind and nothing about
   * a building is an organizer's secret. What makes this endpoint worth having
   * is that `createEvent` demands a `venueId` and, until now, refused to say
   * where one comes from.
   */
  async listVenues(criteria: ListVenuesCriteria): Promise<VenuePage> {
    const { items, total } = await this.venues.list(criteria);

    return {
      items,
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
      pageCount: Math.ceil(total / criteria.pageSize),
    };
  }

  /**
   * One venue's layouts, with the sections a price tier can name.
   *
   * The existence check is not redundant with an empty result. A venue that is
   * not there and a venue that has no layouts are different answers to
   * different questions, and collapsing them into `[]` would send whoever
   * mistyped an id hunting for a seeding problem. Nothing is racing here — a
   * venue deleted between the two queries yields an empty list, which is what
   * it would have yielded a moment later anyway.
   */
  async getVenueSeatMaps(venueId: string): Promise<VenueSeatMap[]> {
    if (!(await this.venues.exists(venueId))) {
      throw new NotFoundException(`No venue with id "${venueId}"`);
    }

    return this.venues.findSeatMaps(venueId);
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

/** Why an event could not be put on sale. */
function describeOnSaleBlocker(blocker: OnSaleBlocker): string {
  return `Only a published event can go on sale; this event is "${blocker.status}"`;
}

/**
 * A rejected upload, said to whoever sent it.
 *
 * Same split as `describeBlocker` above: the domain decides what is wrong and
 * this decides how to say it. Each message names the thing the caller can
 * change — the extension they picked, the header their client sent — because
 * "invalid image" tells an organizer nothing about which of the two to fix.
 */
function describeRejection(rejection: HeroImageRejection): string {
  const accepted = 'Only JPEG (.jpg, .jpeg) and PNG (.png) images are accepted';

  switch (rejection.reason) {
    case 'empty':
      return 'The uploaded file is empty';
    case 'too_large':
      return `The image is ${Math.ceil(rejection.size / 1024)} KiB; the limit is ${Math.floor(rejection.limit / 1024)} KiB`;
    case 'unsupported_extension':
      return rejection.extension === null
        ? `The filename has no extension. ${accepted}`
        : `Files with a "${rejection.extension}" extension are not accepted. ${accepted}`;
    case 'unsupported_content_type':
      return `Content-Type "${rejection.contentType}" is not accepted. ${accepted}`;
    case 'unrecognized_bytes':
      return `The file is not a JPEG or a PNG, whatever it is named. ${accepted}`;
    case 'mismatched_claims':
      return `The file is ${rejection.actual} but was sent as ${rejection.claimed}; renaming a file does not change its format`;
  }
}

/** Postgres 23505 — a unique index rejected the write. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  );
}
