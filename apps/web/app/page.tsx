import type { EventSummary } from '@repo/contracts/catalog';
import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import Link from 'next/link';
import { CitySection } from './components/city-section';
import { EventCarousel } from './components/event-carousel';
import {
  listCities,
  listEventsInCity,
  listFeaturedEvents,
  type CityOption,
} from './lib/api/catalog';

/**
 * The home page. A server component, so the carousel's first paint already
 * contains its slides — a banner that pops in after hydration is the one
 * element on a page where the shift is most obvious.
 *
 * Below the banner the page turns local: the carousel is national, and
 * "Happening in <city>" is where someone actually starts shopping. The chosen
 * city rides in the query string, which is why this page reads `searchParams`
 * at all — see `CitySection` for why a link beats an `onChange` here.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* Independent reads, so they overlap rather than queue. Both are cached for
   * `CATALOG_REVALIDATE_SECONDS`, so the pair costs one round trip a minute
   * however many people land here. */
  const [featured, cities, requested] = await Promise.all([
    loadFeatured(),
    loadCities(),
    searchParams.then(readCity),
  ]);

  const selected = cities ? resolveCity(cities, requested) : null;

  return (
    /* No gap between the two: `EventCarousel` already carries its own bottom
       padding, and a gap here would stack on top of it. */
    <main className="flex flex-col pb-20">
      <EventCarousel events={featured} />
      {selected && cities ? (
        <CityBlock cities={cities} selected={selected} />
      ) : null}
      {/* Both sections above render nothing when they have nothing, so without
          this the page is literally blank — no heading, no message, no way
          out. Reachable whenever the catalog is empty, which `db:fresh` makes
          a routine state rather than an exotic one: the seed publishes
          nothing on purpose. */}
      {featured.length === 0 && (cities?.length ?? 0) === 0 ? (
        <NothingToShow isUnreachable={cities === null} />
      ) : null}
    </main>
  );
}

/**
 * The home page with an empty catalog behind it.
 *
 * The two cases are told apart rather than merged, because they ask different
 * things of the reader: "nothing is on sale" is a fact about the catalog and
 * browsing is still worth offering, while "we could not reach the API" is our
 * failure and the only useful move is to come back. Saying the first when the
 * second is true tells someone the shop is empty when the lights are simply
 * out — which, in a project whose seed publishes nothing until you tell it to,
 * is the misdiagnosis waiting to happen.
 */
function NothingToShow({ isUnreachable }: { isUnreachable: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 pt-16 lg:px-8">
      <EmptyState
        title={
          isUnreachable
            ? 'Events are unavailable right now'
            : 'Nothing on sale yet'
        }
        description={
          isUnreachable
            ? 'We could not reach the catalog. This is on us — try again in a moment.'
            : 'No events have been published. Once something goes on sale it will show up here.'
        }
        action={
          isUnreachable ? null : (
            <Button asChild variant="secondary">
              <Link href="/events">Browse everything</Link>
            </Button>
          )
        }
      />
    </div>
  );
}

/**
 * The second half of the city section's data, deliberately fetched here rather
 * than passed down from `listCities`: that grouping is derived from a capped
 * sample, and a "see all 8" link under eight cards when the city really has
 * thirty would be a lie the sample cannot detect. This asks the API for the
 * city directly, so `meta.total` is the real number.
 */
async function CityBlock({
  cities,
  selected,
}: {
  cities: CityOption[];
  selected: string;
}) {
  const { items, meta } = await listEventsInCity(selected);

  return (
    <CitySection
      cities={cities}
      selected={selected}
      events={items}
      total={meta.total}
    />
  );
}

/**
 * Which city to show: the one asked for when it is one we offer, otherwise the
 * busiest — `listCities` already sorts by that, breaking ties on whichever
 * city has something happening soonest.
 *
 * An unknown `?city=` falls back rather than empties the section. It is a
 * mistyped URL or a city that has sold out of everything since the link was
 * shared, and neither is worth a dead end when the page has something to show.
 */
function resolveCity(
  cities: CityOption[],
  requested: string | null,
): string | null {
  if (cities.length === 0) return null;

  const match = cities.find((option) => option.city === requested);
  return (match ?? cities[0]!).city;
}

function readCity(
  params: Record<string, string | string[] | undefined>,
): string | null {
  const value = Array.isArray(params.city) ? params.city[0] : params.city;
  return value?.trim() || null;
}

/**
 * The carousel is this page's banner, not its content. If the API is
 * unreachable the rest of the home page is still worth serving, and
 * `EventCarousel` already renders nothing for an empty list — so a failure
 * here degrades to a page without a banner rather than to an error screen.
 */
async function loadFeatured(): Promise<EventSummary[]> {
  try {
    return await listFeaturedEvents();
  } catch (error) {
    console.error('Featured events could not be loaded:', error);
    return [];
  }
}

/**
 * Same bargain as `loadFeatured`, one section lower: no cities means no
 * switcher and no section, not a broken page. `CityBlock`'s own fetch is left
 * to throw — by then a city has been named on screen, and quietly rendering it
 * empty would say the city has nothing rather than that the request failed.
 *
 * `null` for a failed request and `[]` for a catalog with nothing published,
 * because `NothingToShow` says something different about each and collapsing
 * them would make it guess.
 */
async function loadCities(): Promise<CityOption[] | null> {
  try {
    return await listCities();
  } catch (error) {
    console.error('Cities could not be loaded:', error);
    return null;
  }
}
