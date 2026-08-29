import {
  eventDetailSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
  type EventDetail,
  type ListEventsQuery,
  type ListEventsResponse,
} from '@repo/contracts/catalog';
import { apiGet } from './client';

/**
 * Catalog data is slow-moving, so a short shared cache is worth the staleness.
 * Inventory will not get this treatment — an availability number that is 60
 * seconds old is worse than no number at all.
 */
export const CATALOG_REVALIDATE_SECONDS = 60;

/**
 * Parses raw search params into a valid query, discarding anything that does
 * not fit the contract. A hand-edited URL should show the default listing, not
 * an error page — invalid input here is a typo, not an attack to report on.
 */
export function parseEventsQuery(
  params: Record<string, string | string[] | undefined>,
): ListEventsQuery {
  const flat = Object.fromEntries(
    Object.entries(params)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      .filter(([, value]) => value !== undefined && value !== ''),
  );

  const parsed = listEventsQuerySchema.safeParse(flat);
  return parsed.success ? parsed.data : listEventsQuerySchema.parse({});
}

export function listEvents(
  query: ListEventsQuery,
): Promise<ListEventsResponse> {
  return apiGet('/events', listEventsResponseSchema, {
    query: {
      q: query.q,
      city: query.city,
      category: query.category,
      from: query.from,
      to: query.to,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    },
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
}

export function getEvent(slug: string): Promise<EventDetail> {
  return apiGet(`/events/${encodeURIComponent(slug)}`, eventDetailSchema, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
}
