import {
  eventDetailSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
  type EventDetail,
  type EventSummary,
  type ListEventsQuery,
  type ListEventsResponse,
} from '@repo/contracts/catalog';
import { MAX_PAGE_SIZE } from '@repo/contracts/shared';
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
      featured: query.featured,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    },
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
}

/**
 * How many events the home page carousel shows.
 *
 * Five, because the carousel is a rotation rather than a listing: at 7s a
 * slide that comes full circle in about 35 seconds, and five dot indicators
 * stay countable at a glance. Twelve would take nearly a minute and a half to
 * come back round, which makes the tail slides decoration nobody sees.
 */
export const FEATURED_EVENT_COUNT = 5;

/**
 * The home page carousel's feed: the events someone chose to highlight.
 *
 * `featured` is now a column an organizer sets, so this asks for it directly
 * rather than approximating an editorial decision with a sort — which is what
 * this function did before the flag existed.
 *
 * The fallback is the part worth reading. A fresh database has nothing
 * featured, by design: the seed sets the flag false on every row and leaves
 * the choosing to whoever is running it. Without a fallback that would mean a
 * home page with no banner at all, and the first impression of the storefront
 * would be a bug report. So an empty highlight list degrades to soonest-first
 * — the old behaviour, kept exactly where it is still the right answer.
 *
 * The second request costs a round trip only while nothing is featured, and
 * both are cached for `CATALOG_REVALIDATE_SECONDS`.
 *
 * Ordered `date_asc` within the highlights, so a banner never leads with an
 * event that has already happened.
 */
export async function listFeaturedEvents(): Promise<EventSummary[]> {
  const highlighted = await listEvents(
    listEventsQuerySchema.parse({
      featured: true,
      sort: 'date_asc',
      pageSize: FEATURED_EVENT_COUNT,
    }),
  );

  if (highlighted.items.length > 0) return highlighted.items;

  const { items } = await listEvents(
    listEventsQuerySchema.parse({
      sort: 'date_asc',
      pageSize: FEATURED_EVENT_COUNT,
    }),
  );

  return items;
}

export function getEvent(slug: string): Promise<EventDetail> {
  return apiGet(`/events/${encodeURIComponent(slug)}`, eventDetailSchema, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
}

/**
 * How many events the home page's city section shows before deferring to the
 * browse listing. Two rows of the four-column grid: enough for the section to
 * read as a selection rather than a teaser, and few enough that "see all"
 * still has a job.
 */
export const CITY_EVENT_COUNT = 8;

/** One city offered by the home page's city switcher. */
export type CityOption = {
  city: string;
  /** Events on sale there, capped by the sample below. */
  eventCount: number;
  /** Start of the soonest one. The tie-break when counts are equal. */
  nextStartsAt: string;
};

/**
 * The cities worth offering, newest-first by how much is happening in each.
 *
 * Derived from a page of events rather than asked for directly, because the
 * API has no "distinct cities" route: `GET /venues` would answer the wrong
 * question, since a venue with nothing published is not a city anyone can buy
 * a ticket in. Grouping the listing instead means a city appears here exactly
 * when it has something to sell.
 *
 * The sample is one full page — `MAX_PAGE_SIZE`, the most the contract will
 * serve — which makes this exact while the catalog is smaller than that and
 * approximate afterwards: past 48 published events, a city whose only dates
 * are far out drops off the switcher, and every `eventCount` understates.
 * That is the point at which this wants a `GET /events/cities` returning the
 * grouping from SQL, and the point at which nothing else here has to change.
 */
export async function listCities(): Promise<CityOption[]> {
  const { items } = await listEvents(
    listEventsQuerySchema.parse({ sort: 'date_asc', pageSize: MAX_PAGE_SIZE }),
  );

  const byCity = new Map<string, CityOption>();

  for (const event of items) {
    const seen = byCity.get(event.venue.city);
    // `date_asc` means the first event seen for a city is its soonest, so
    // `nextStartsAt` is settled on insert and never needs comparing.
    if (seen) seen.eventCount += 1;
    else
      byCity.set(event.venue.city, {
        city: event.venue.city,
        eventCount: 1,
        nextStartsAt: event.startsAt,
      });
  }

  return [...byCity.values()].sort(
    (a, b) =>
      b.eventCount - a.eventCount ||
      a.nextStartsAt.localeCompare(b.nextStartsAt),
  );
}

/**
 * What is on sale in one city. Unlike `listCities`, this asks the API the
 * question directly, so `meta.total` is the true count rather than a count of
 * the sample — which is what the section's "see all" link has to promise.
 */
export function listEventsInCity(city: string): Promise<ListEventsResponse> {
  return listEvents(
    listEventsQuerySchema.parse({
      city,
      sort: 'date_asc',
      pageSize: CITY_EVENT_COUNT,
    }),
  );
}
