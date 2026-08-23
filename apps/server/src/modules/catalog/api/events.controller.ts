import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  createEventSchema,
  eventSlugSchema,
  listEventsQuerySchema,
  type CreateEventInput,
  type EventDetail,
  type ListEventsQuery,
  type ListEventsResponse,
} from '@repo/contracts/catalog';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import type { NewEvent } from '../domain/new-event';
import { toEventDetail, toEventSummary } from './event.mapper';

@Controller('events')
export class EventsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listEventsQuerySchema))
    query: ListEventsQuery,
  ): Promise<ListEventsResponse> {
    const page = await this.catalog.listPublicEvents(toCriteria(query));

    return {
      items: page.items.map(toEventSummary),
      meta: {
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        pageCount: page.pageCount,
      },
    };
  }

  /**
   * Anyone can call this today. Authorization is Slice 4 — until Identity
   * exists there is no one to check, and stubbing a fake organizer id into the
   * request would be a worse lie than an open endpoint.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createEventSchema))
    body: CreateEventInput,
  ): Promise<EventDetail> {
    return toEventDetail(await this.catalog.createEvent(toNewEvent(body)));
  }

  @Get(':slug')
  async detail(
    @Param('slug', new ZodValidationPipe(eventSlugSchema)) slug: string,
  ): Promise<EventDetail> {
    return toEventDetail(await this.catalog.getPublicEventBySlug(slug));
  }
}

/** Wire query → domain criteria. The only place the two vocabularies meet. */
function toCriteria(query: ListEventsQuery): ListEventsCriteria {
  return {
    search: query.q,
    city: query.city,
    category: query.category,
    startsFrom: query.from ? new Date(query.from) : undefined,
    startsUntil: query.to ? new Date(query.to) : undefined,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Wire body → domain draft. Dates become Dates, money stays in minor units. */
function toNewEvent(body: CreateEventInput): NewEvent {
  return {
    slug: body.slug,
    title: body.title,
    description: body.description,
    category: body.category,
    startsAt: new Date(body.startsAt),
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    doorsOpenAt: body.doorsOpenAt ? new Date(body.doorsOpenAt) : null,
    heroImageUrl: body.heroImageUrl,
    venueId: body.venueId,
    organizerId: body.organizerId,
    seatMapId: body.seatMapId,
    priceTiers: body.priceTiers.map((tier) => ({
      name: tier.name,
      amountMinor: tier.price.amountMinor,
      currency: tier.price.currency,
      sectionIds: tier.sectionIds,
    })),
  };
}
