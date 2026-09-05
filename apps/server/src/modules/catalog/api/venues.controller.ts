import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  listVenuesQuerySchema,
  venueIdSchema,
  type ListSeatMapsResponse,
  type ListVenuesQuery,
  type ListVenuesResponse,
} from '@repo/contracts/catalog';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';
import type { ListVenuesCriteria } from '../domain/list-venues-criteria';
import { toSeatMap, toVenueSummary } from './venue.mapper';

/**
 * The rooms, and the layouts they are sold in. Read-only.
 *
 * A separate controller from `EventsController` rather than a few more routes
 * on it: a venue is not a sub-resource of an event, and nesting it under one
 * would say the opposite of what the schema does — an event points at a venue,
 * a venue outlives every event held in it.
 *
 * Nothing here writes. Venues and seat maps arrive with the seed today and,
 * eventually, through an operator tool; authoring a building over this API is
 * not a gap these endpoints are pretending to fill. What they *are* for is
 * making `POST /events` callable: it demands a `venueId`, a `seatMapId` and
 * `sectionIds`, and before this the only place to find one was a psql prompt.
 *
 * Open to anyone, like the rest of Catalog. Authorization is Slice 4.
 */
@Controller('venues')
export class VenuesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listVenuesQuerySchema))
    query: ListVenuesQuery,
  ): Promise<ListVenuesResponse> {
    const page = await this.catalog.listVenues(toCriteria(query));

    return {
      items: page.items.map(toVenueSummary),
      meta: {
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        pageCount: page.pageCount,
      },
    };
  }

  /**
   * The venue's layouts, with the sections a price tier can name.
   *
   * By id, not by name: a venue has no slug, because nothing links to a
   * building the way it links to an event page.
   *
   * `404` when the venue does not exist — deliberately not an empty list. A
   * mistyped id and a venue nobody has drawn a layout for are different
   * problems, and only one of them is fixed by looking at the seed.
   *
   * No pagination. A venue holds a handful of layouts forever, so there is no
   * page to ask for; see `listSeatMapsResponseSchema` for why the envelope
   * stays anyway.
   */
  @Get(':venueId/seat-maps')
  async seatMaps(
    @Param('venueId', new ZodValidationPipe(venueIdSchema)) venueId: string,
  ): Promise<ListSeatMapsResponse> {
    const seatMaps = await this.catalog.getVenueSeatMaps(venueId);

    return { items: seatMaps.map(toSeatMap) };
  }
}

/** Wire query → domain criteria. The only place the two vocabularies meet. */
function toCriteria(query: ListVenuesQuery): ListVenuesCriteria {
  return {
    search: query.q,
    city: query.city,
    page: query.page,
    pageSize: query.pageSize,
  };
}
