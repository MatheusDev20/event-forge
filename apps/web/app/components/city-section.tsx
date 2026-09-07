import type { EventSummary } from '@repo/contracts/catalog';
import { cn } from '@repo/ui/cn';
import Link from 'next/link';
import type { CityOption } from '../lib/api/catalog';
import { EventCard } from './event-card';

/**
 * "Happening in <city>" — the home page's first question.
 *
 * A ticket is a thing you buy in a place, and until this section the storefront
 * did not acknowledge that at all: the carousel puts Manaus next to São Paulo
 * and leaves the reader to notice. The carousel stays national on purpose —
 * it is the banner — and everything below it is local.
 *
 * The switcher is a row of links rather than a `Select` with an `onChange`.
 * Three things fall out of that and all of them are wanted: the section is a
 * server component with no JavaScript at all, `/?city=Curitiba` is a URL
 * somebody can send to somebody else, and the back button steps between cities
 * the way a reader expects. `events-browser.tsx` already argues for keeping
 * the URL as the state; this is the same argument on a page that never needed
 * a client boundary to begin with.
 */
export function CitySection({
  cities,
  selected,
  events,
  total,
}: {
  cities: CityOption[];
  selected: string;
  events: EventSummary[];
  total: number;
}) {
  return (
    <section
      aria-labelledby="city-section-heading"
      className="mx-auto max-w-[90rem] px-4 lg:px-8"
    >
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2
            id="city-section-heading"
            className="font-display text-text text-[26px] font-bold tracking-[-0.03em] sm:text-3xl"
          >
            Happening in {selected}
          </h2>

          {/* Only once there is more than this section shows: a "see all" that
              leads to the same eight events is a dead end with a promise on
              it. */}
          {total > events.length ? (
            <Link
              href={`/events?city=${encodeURIComponent(selected)}`}
              className="text-text-brand rounded-xs text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:outline-none"
            >
              See all {total} in {selected} →
            </Link>
          ) : null}
        </div>

        <CityPicker cities={cities} selected={selected} />
      </div>

      {events.length === 0 ? (
        /* Reachable by a hand-typed `?city=`, and by the gap between the
         * switcher's sampled counts and this city's real listing. Not an
         * `EmptyState`: that component fills a page, and here the page has a
         * carousel above and other cities one click away. */
        <p className="text-text-muted border-border-subtle rounded-md border border-dashed px-4 py-8 text-center text-sm">
          Nothing on sale in {selected} just yet. Try another city above.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The switcher itself.
 *
 * Horizontally scrollable rather than wrapped, so a narrow screen keeps the
 * section heading and the first cards where it expects them instead of pushing
 * them down a line per row of cities.
 */
function CityPicker({
  cities,
  selected,
}: {
  cities: CityOption[];
  selected: string;
}) {
  return (
    <nav
      aria-label="Choose a city"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
    >
      {cities.map((option) => {
        const isSelected = option.city === selected;

        return (
          <Link
            key={option.city}
            href={`/?city=${encodeURIComponent(option.city)}`}
            /* The section is below the fold of the carousel, and jumping to
               the top of the page to change city loses the reader's place. */
            scroll={false}
            aria-current={isSelected ? 'true' : undefined}
            className={cn(
              'ease-standard shrink-0 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors duration-150',
              'focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:outline-none',
              isSelected
                ? 'border-action-primary bg-action-primary text-action-primary-fg font-semibold'
                : 'border-border-subtle text-text-muted hover:border-border hover:text-text hover:bg-surface-hover',
            )}
          >
            {option.city}
            <span
              className={cn(
                'ml-2 text-xs tabular-nums',
                isSelected ? 'opacity-70' : 'text-text-subtle',
              )}
            >
              {option.eventCount}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
