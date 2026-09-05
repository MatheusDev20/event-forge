import { Badge } from '@repo/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@repo/ui/card';

/**
 * The console's overview.
 *
 * Deliberately a description rather than a dashboard. Numbers here — events
 * published, holds active — would be the first thing to build, and the first
 * thing to be wrong: there is no endpoint that answers them, and inventing one
 * to fill a card is how a metric nobody agreed on becomes load-bearing.
 */
export default function Page() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        {/* self-start: a Badge is inline-flex, and a flex-col parent would
            otherwise stretch it across the full column width. */}
        <Badge tone="brand" className="self-start">
          Slice 5
        </Badge>
        <h1 className="text-text text-3xl font-semibold text-balance">
          Organizer console
        </h1>
        <p className="text-text-muted text-base text-pretty">
          The B2B side of Event-Forge: where an event is drafted, priced against
          a venue&apos;s seat map, published, and opened for sale. The
          storefront reads what is decided here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nothing is wired up yet</CardTitle>
        </CardHeader>
        <CardBody className="text-text-muted flex flex-col gap-3 pb-5 text-sm">
          <p>
            This is the shell — routing, layout, theme and the API client, on
            the same design tokens as the storefront. The sections in the
            sidebar are the ones the roadmap names; each arrives with its own
            screens.
          </p>
          <p>
            The endpoints they will drive already exist on the server, and can
            be exercised today from{' '}
            <code className="text-text-brand font-mono text-xs">
              apps/server/postman
            </code>
            .
          </p>
        </CardBody>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-text text-lg font-semibold">
          The flow it will drive
        </h2>
        <ol className="flex flex-col gap-2.5">
          {FLOW.map((step, index) => (
            <li
              key={step.endpoint}
              className="border-border bg-surface-raised flex gap-3 rounded-lg border px-4 py-3"
            >
              <span
                className="bg-surface-sunken text-text-subtle font-display flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <code className="text-text-brand font-mono text-xs break-all">
                  {step.endpoint}
                </code>
                <span className="text-text-muted text-sm text-pretty">
                  {step.summary}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * The publish path, in the order an organizer walks it. Kept here as copy
 * rather than fetched: it describes the server's endpoints, and a list of
 * endpoints is documentation, not data.
 */
const FLOW = [
  {
    endpoint: 'GET /venues · GET /venues/:id/seat-maps',
    summary:
      'Pick the room and the layout, and see the sections that will need pricing.',
  },
  {
    endpoint: 'POST /events',
    summary:
      'Create the draft, with a price tier covering every section of the layout.',
  },
  {
    endpoint: 'POST /events/:id/hero-image',
    summary: 'Upload the artwork the event page is built around.',
  },
  {
    endpoint: 'POST /events/:id/publish',
    summary:
      'Settle capacity and hand it to Inventory. Refused until every section is priced.',
  },
  {
    endpoint: 'POST /events/:id/on-sale',
    summary: 'Open the doors. Only an on-sale event accepts holds.',
  },
];
