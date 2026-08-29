'use client';

import {
  eventCategorySchema,
  eventSortSchema,
  type ListEventsQuery,
} from '@repo/contracts/catalog';
import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import { Pagination } from '@repo/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/select';
import { Skeleton } from '@repo/ui/skeleton';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EventCard } from '../components/event-card';
import { useEvents } from '../hooks/use-events';
import { parseEventsQuery } from '../lib/api/catalog';

const SORT_LABEL: Record<ListEventsQuery['sort'], string> = {
  date_asc: 'Soonest first',
  date_desc: 'Latest first',
  price_asc: 'Cheapest first',
  title_asc: 'A–Z',
};

const CATEGORY_LABEL: Record<
  ReturnType<typeof eventCategorySchema.parse>,
  string
> = {
  music: 'Music',
  sports: 'Sports',
  theatre: 'Theatre',
  conference: 'Conference',
  comedy: 'Comedy',
  festival: 'Festival',
};

/** The Select primitive has no empty value, so "no filter" needs a token. */
const ANY_CATEGORY = 'all';

/**
 * The browse listing.
 *
 * The URL stays the state, even though the fetching is client-side: filters
 * are written back as search params and read out again through the same
 * `parseEventsQuery` the server component path uses. That keeps a filtered
 * listing shareable and the back button meaningful, which a `useState` filter
 * bar would quietly cost. React Query then makes the return trip free — going
 * back to a page you have already seen resolves from cache.
 */
export function EventsBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = parseEventsQuery(Object.fromEntries(searchParams.entries()));

  const { data, isPending, isError, error, isPlaceholderData } =
    useEvents(query);

  /**
   * Rewrites the URL, which re-renders this component with a new query.
   *
   * Any change other than paging returns to page 1: staying on page 4 while
   * narrowing to a category with two results shows an empty grid and no
   * explanation.
   */
  function update(changes: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }

    if (!('page' in changes)) next.delete('page');

    router.push(next.size > 0 ? `${pathname}?${next}` : pathname, {
      scroll: false,
    });
  }

  const hasFilters = Boolean(query.q || query.category);

  return (
    <div className="mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-8 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-text text-3xl font-bold tracking-[-0.03em]">
          {query.q ? `Results for "${query.q}"` : 'Browse events'}
        </h1>
        <p className="text-text-muted text-sm" aria-live="polite">
          {isPending
            ? 'Loading events…'
            : `${data?.meta.total ?? 0} event${data?.meta.total === 1 ? '' : 's'}`}
        </p>
      </header>

      <div className="border-border-subtle flex flex-wrap items-center gap-3 border-y py-3">
        <Select
          value={query.category ?? ANY_CATEGORY}
          onValueChange={(value) =>
            update({ category: value === ANY_CATEGORY ? undefined : value })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by category">
            {/* Given explicitly rather than left to Radix, which resolves a
                bare <SelectValue /> from its items only after hydration — and
                so paints an empty trigger on the server. */}
            <SelectValue>
              {query.category
                ? CATEGORY_LABEL[query.category]
                : 'All categories'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_CATEGORY}>All categories</SelectItem>
            {eventCategorySchema.options.map((category) => (
              <SelectItem key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.sort}
          onValueChange={(value) => update({ sort: value })}
        >
          <SelectTrigger className="w-44" aria-label="Sort events">
            <SelectValue>{SORT_LABEL[query.sort]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {eventSortSchema.options.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(pathname, { scroll: false })}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {isError ? (
        <EmptyState
          title="Could not load events"
          description={error.message}
          action={
            <Button variant="secondary" onClick={() => router.refresh()}>
              Try again
            </Button>
          }
        />
      ) : isPending ? (
        <Grid>
          {Array.from({ length: query.pageSize }, (_, index) => (
            <Skeleton key={index} className="h-72 w-full" />
          ))}
        </Grid>
      ) : data.items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No events match those filters' : 'No events yet'}
          description={
            hasFilters
              ? 'Try a broader search, or clear the filters to see everything on sale.'
              : 'Nothing has been published yet. Check back soon.'
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => router.push(pathname, { scroll: false })}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Dimmed rather than replaced while the next page loads: the layout
              holds still and the scroll position survives. */}
          <Grid className={isPlaceholderData ? 'opacity-60' : undefined}>
            {data.items.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </Grid>

          <Pagination
            page={data.meta.page}
            pageCount={data.meta.pageCount}
            onPageChange={(page) => update({ page })}
            disabled={isPlaceholderData}
            summary={`Page ${data.meta.page} of ${data.meta.pageCount} · ${data.meta.total} events`}
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}

/**
 * What `/events` paints before its JavaScript arrives.
 *
 * `useSearchParams` opts this subtree out of prerendering, so the Suspense
 * fallback *is* the first paint — an empty one would mean a blank page on a
 * cold load. Mirroring the real layout keeps the shell stable instead of
 * shifting everything down when the content lands.
 */
export function EventsBrowserSkeleton() {
  return (
    <div className="mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-8 lg:px-8">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-24" />
      </header>

      <div className="border-border-subtle flex flex-wrap items-center gap-3 border-y py-3">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-10 w-44" />
      </div>

      <Grid>
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-72 w-full" />
        ))}
      </Grid>
    </div>
  );
}

function Grid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-5 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
