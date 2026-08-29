import type { EventSummary } from '@repo/contracts/catalog';
import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@repo/ui/card';
import Link from 'next/link';
import { EventCarousel } from './components/event-carousel';
import { listFeaturedEvents } from './lib/api/catalog';

/**
 * The home page. A server component, so the carousel's first paint already
 * contains its slides — a banner that pops in after hydration is the one
 * element on a page where the shift is most obvious.
 */
export default async function Page() {
  const featured = await loadFeatured();

  return (
    <main>
      <EventCarousel events={featured} />

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 pb-16">
        <div className="flex flex-col gap-3">
          <Badge tone="brand">Slice 0</Badge>
          <h1 className="text-text text-4xl font-semibold text-balance">
            Event-Forge
          </h1>
          <p className="text-text-muted text-base text-pretty">
            Browse what is on sale, filter by category, and open an event to see
            its price tiers. Seat selection arrives with Inventory.
          </p>
          <div>
            <Button asChild className="font-display">
              <Link href="/events">Browse all events</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What works today</CardTitle>
          </CardHeader>
          <CardBody className="text-text-muted flex flex-col gap-2 pb-5 text-sm">
            <p>
              <code className="text-text-brand font-mono text-xs">
                GET /api/v1/events
              </code>{' '}
              — paginated, filterable, sortable.
            </p>
            <p>
              <code className="text-text-brand font-mono text-xs">
                GET /api/v1/events/:slug
              </code>{' '}
              — detail with price tiers.
            </p>
            <p>
              <code className="text-text-brand font-mono text-xs">
                POST /api/v1/events/:id/publish
              </code>{' '}
              — draft to published, once every section is priced.
            </p>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

/**
 * The carousel is this page's banner, not its content. If the API is
 * unreachable the rest of the home page is still worth serving, and
 * `EventCarousel` already renders nothing for an empty list — so a failure
 * here degrades to a page without a banner rather than to an error screen.
 */
async function loadFeatured(): Promise<EventSummary[]> {
  try {
    const { items } = await listFeaturedEvents();
    return items;
  } catch (error) {
    console.error('Featured events could not be loaded:', error);
    return [];
  }
}
