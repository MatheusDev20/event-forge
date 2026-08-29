import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Separator } from '@repo/ui/separator';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { EventDetail } from '@repo/contracts/catalog';
import { getEvent } from '../../lib/api/catalog';
import { ApiRequestError } from '../../lib/api/client';
import {
  CATEGORY_ART_TINT,
  STATUS_LABEL,
  heroImageUrl,
  isBuyable,
} from '../../lib/event-display';
import {
  formatEventDate,
  formatEventDateTime,
  formatEventTime,
  formatMoney,
} from '../../lib/format';

type PageProps = { params: Promise<{ slug: string }> };

/**
 * A draft and a typo are deliberately the same 404 — the API refuses to
 * distinguish them so an unpublished event cannot be probed — and both land
 * here as Next's not-found rather than as the unhandled throw a bare
 * `getEvent` would produce.
 *
 * Read in a server component, not through `useEvents`: there is no
 * interaction here for a hook to follow, and this way the page's first paint
 * already contains the content.
 */
async function loadEvent(slug: string): Promise<EventDetail> {
  try {
    return await getEvent(slug);
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);

  return {
    title: `${event.title} · Event-Forge`,
    description: event.description.slice(0, 160),
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await loadEvent(slug);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 lg:px-8">
      <Hero event={event} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-text text-xl font-semibold">
            About this event
          </h2>
          <p className="text-text-muted text-base leading-relaxed text-pretty">
            {event.description}
          </p>

          <Separator className="my-2" />

          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Fact label="Starts">{formatEventDateTime(event.startsAt)}</Fact>
            {event.doorsOpenAt ? (
              <Fact label="Doors open">
                {formatEventTime(event.doorsOpenAt)}
              </Fact>
            ) : null}
            {event.endsAt ? (
              <Fact label="Ends">{formatEventTime(event.endsAt)}</Fact>
            ) : null}
            <Fact label="Venue">
              {event.venue.name}, {event.venue.city}
            </Fact>
            <Fact label="Organizer">{event.organizer.name}</Fact>
          </dl>
        </section>

        <aside className="border-border bg-surface-raised flex h-fit flex-col gap-4 rounded-lg border p-5">
          <h2 className="font-display text-text text-lg font-semibold">
            Tickets
          </h2>

          <ul className="flex flex-col">
            {event.priceTiers.map((tier) => (
              <li
                key={tier.id}
                className="border-border-subtle flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0"
              >
                <span className="text-text-muted text-sm">{tier.name}</span>
                <span className="text-text text-sm font-semibold">
                  {formatMoney(tier.price)}
                </span>
              </li>
            ))}
          </ul>

          {/*
           * Inert, and honestly so. Selecting seats needs Inventory, which
           * owns availability and does not exist yet (Slice 1/2). A button
           * that looked live would be the first lie in a system whose whole
           * point is not lying about what is left.
           */}
          <Button className="font-display w-full" disabled>
            {isBuyable(event.status)
              ? 'Select seats'
              : STATUS_LABEL[event.status]}
          </Button>
          <p className="text-text-subtle text-center text-xs">
            Seat selection arrives with availability.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Hero({ event }: { event: EventDetail }) {
  return (
    <header className="flex flex-col gap-5">
      <div
        className="relative aspect-[21/9] w-full overflow-hidden rounded-lg"
        style={{ backgroundColor: CATEGORY_ART_TINT[event.category] }}
      >
        <HeroImage event={event} />
        <div className="from-media-veil/80 to-media-veil/0 absolute inset-0 bg-linear-to-t" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone="brand" className="uppercase">
            {event.category}
          </Badge>
          <Badge tone={isBuyable(event.status) ? 'success' : 'neutral'}>
            {STATUS_LABEL[event.status]}
          </Badge>
        </div>

        <h1 className="font-display text-text text-4xl font-bold tracking-[-0.035em] text-balance">
          {event.title}
        </h1>

        <p className="text-text-muted text-base">
          {formatEventDate(event.startsAt)} · {event.venue.name},{' '}
          {event.venue.city}
        </p>
      </div>
    </header>
  );
}

function HeroImage({ event }: { event: EventDetail }) {
  return (
    // Stand-in artwork from an external host with no next/image remote pattern
    // configured — see heroImageUrl().
    // eslint-disable-next-line @next/next/no-img-element
    <img src={heroImageUrl(event)} alt="" className="size-full object-cover" />
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-subtle text-xs tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-text text-sm">{children}</dd>
    </div>
  );
}
