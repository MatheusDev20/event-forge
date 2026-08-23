import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  eventSlugSchema,
  listEventsQuerySchema,
  type EventDetail,
  type ListEventsQuery,
  type ListEventsResponse,
} from '@repo/contracts/catalog';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
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
