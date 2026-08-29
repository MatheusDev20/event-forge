'use client';

import {
  listEventsQuerySchema,
  type ListEventsQuery,
  type ListEventsResponse,
} from '@repo/contracts/catalog';
import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { CATALOG_REVALIDATE_SECONDS, listEvents } from '../lib/api/catalog';
import { ApiRequestError } from '../lib/api/client';

/**
 * Query keys for Catalog reads.
 *
 * A factory rather than inline arrays so invalidation has something to aim at:
 * `queryClient.invalidateQueries({ queryKey: catalogKeys.all })` drops every
 * catalog read at once, which is what publishing an event from the organizer
 * console will need. The event detail key belongs here too when it arrives.
 */
export const catalogKeys = {
  all: ['catalog'] as const,
  events: (query: ListEventsQuery) =>
    [...catalogKeys.all, 'events', query] as const,
};

/**
 * The browse listing, in a client component.
 *
 * Note this is *not* how the `/events` page should read its data — a server
 * component calling `listEvents` directly renders the first paint with the
 * results already in it, and keeps the contract parse on the server. Reach for
 * this hook when the fetch has to follow an interaction the URL does not
 * describe: a filter panel that previews counts, a "load more" that should not
 * scroll-jump, a poll. Both paths go through the same `apiGet`, so the
 * response is parsed against the contract either way.
 *
 * Input is partial and normalised through the contract schema, so
 * `useEvents({ category: 'music' })` picks up page 1, pageSize 12 and
 * `date_asc` from the same defaults the server applies. Invalid input is a
 * programming error here and throws — unlike `parseEventsQuery`, which exists
 * to forgive a hand-edited URL.
 */
export function useEvents(
  input: Partial<ListEventsQuery> = {},
): UseQueryResult<ListEventsResponse, Error> {
  /*
   * Re-parsed each render, which allocates a new object each time. React Query
   * hashes keys structurally rather than comparing references, so an equal
   * query is still a cache hit — memoising here would only move the problem to
   * the caller, whose input object is a fresh literal anyway.
   */
  const query = listEventsQuerySchema.parse(input);

  return useQuery({
    queryKey: catalogKeys.events(query),
    queryFn: () => listEvents(query),

    /* Mirrors the server's revalidate window: catalog data is slow-moving and
     * a minute of staleness is worth the quiet. Inventory will not inherit
     * this — a stale availability count is worse than none. */
    staleTime: CATALOG_REVALIDATE_SECONDS * 1000,

    /* Paging holds the previous page on screen while the next one loads,
     * instead of collapsing to a spinner and throwing the scroll position
     * away. `isPlaceholderData` tells the UI to dim rather than empty. */
    placeholderData: keepPreviousData,

    /* A 4xx is an answer, not an outage: the query was malformed or the filter
     * matched nothing the API would serve, and asking twice more changes
     * neither. Only transport failures and 5xx are worth a retry. */
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && error.statusCode < 500
        ? false
        : failureCount < 2,
  });
}
