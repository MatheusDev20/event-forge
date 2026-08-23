import { Badge } from '@repo/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@repo/ui/card';
import { EventCarousel } from './components/event-carousel';
import { FEATURED_EVENTS } from './lib/mock/featured-events';

/**
 * Placeholder. The browse and detail pages are the rest of Slice 0; this page
 * exists so the app boots and so the token layer is visible in a browser.
 */
export default function Page() {
  return (
    <main>
      {/* TODO: swap for the featured-events endpoint once it exists. */}
      <EventCarousel events={FEATURED_EVENTS} />

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 pb-16">
        <div className="flex flex-col gap-3">
          <Badge tone="brand">Slice 0 · in progress</Badge>
          <h1 className="text-text text-4xl font-semibold text-balance">
            Event-Forge
          </h1>
          <p className="text-text-muted text-base text-pretty">
            The API is live and the design system is in place. The browse and
            event detail pages are next.
          </p>
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
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
