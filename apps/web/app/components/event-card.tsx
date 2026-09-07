import type { EventSummary } from '@repo/contracts/catalog';
import { Badge } from '@repo/ui/badge';
import { Card } from '@repo/ui/card';
import { cn } from '@repo/ui/cn';
import Link from 'next/link';
import { formatEventDateTime, formatMoney } from '../lib/format';
import {
  CATEGORY_ART_TINT,
  FREE_LABEL,
  isFree,
  FEATURED_LABEL,
  STATUS_LABEL,
  heroImageUrl,
} from '../lib/event-display';

/**
 * One event in the browse grid.
 *
 * The whole card is the link rather than a "view" button: the target is the
 * event, and giving a card two tab stops for one destination is noise for
 * anyone moving by keyboard.
 *
 * A featured event is the same card with two changes — a brand ring, and a
 * marker on the artwork. Not a differently-shaped card: the grid is scanned
 * column by column, and one item breaking the rhythm reads as a rendering
 * fault before it reads as emphasis. Colour and a label carry it instead.
 */
export function EventCard({ event }: { event: EventSummary }) {
  return (
    <Card
      interactive
      elevation="flat"
      className={cn(
        'group overflow-hidden focus-within:ring-focus-ring focus-within:ring-2',
        /* Inset, so the ring is drawn inside the card's own bounds and the
           grid's column widths stay identical between a featured card and its
           neighbours. An outer ring would nudge the row by two pixels. */
        event.featured && 'ring-brand-border ring-2 ring-inset',
      )}
    >
      <Link
        href={`/events/${event.slug}`}
        className="flex h-full flex-col outline-none"
      >
        <Artwork event={event} />

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="neutral" size="sm" className="uppercase">
              {event.category}
            </Badge>
            {event.status !== 'on_sale' ? (
              <span className="text-text-subtle text-xs">
                {STATUS_LABEL[event.status]}
              </span>
            ) : null}
          </div>

          <h3 className="font-display text-text line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.02em] text-balance">
            {event.title}
          </h3>

          <p className="text-text-muted text-sm">
            {formatEventDateTime(event.startsAt)}
          </p>

          <p className="text-text-subtle text-sm">
            {event.venue.name} · {event.venue.city}
          </p>

          {/* Pinned to the bottom so price sits on one line across the grid
              however tall the titles above it turn out to be. */}
          <p className="text-text mt-auto pt-1.5 text-sm font-semibold">
            {event.priceFrom === null ? (
              /* Null means no tier is priced yet — not that it is free, which
                 is now a state of its own directly below. */
              <span className="text-text-subtle font-normal">
                Prices to be announced
              </span>
            ) : isFree(event.priceFrom) ? (
              /* No "From": the prefix belongs to a number, and the cheapest
                 tier costing nothing is said as one word. */
              FREE_LABEL
            ) : (
              <>
                <span className="text-text-subtle font-normal">From </span>
                {formatMoney(event.priceFrom)}
              </>
            )}
          </p>
        </div>
      </Link>
    </Card>
  );
}

/**
 * Photograph on top of the category tint. The tint is not decoration: it is
 * what remains if the stand-in image host is unreachable, so the card still
 * reads as a card offline rather than as a white gap.
 */
function Artwork({ event }: { event: EventSummary }) {
  return (
    <div
      className="relative aspect-[16/9] w-full overflow-hidden"
      style={{ backgroundColor: CATEGORY_ART_TINT[event.category] }}
    >
      <ArtworkImage event={event} />
      {/* On the artwork rather than in the text block below it: the ring says
          "this one" at a glance and this says why, and the row under the image
          is already carrying the category and the status. */}
      {event.featured ? (
        <Badge
          tone="brand"
          size="sm"
          className="absolute top-2.5 left-2.5 uppercase tracking-wide shadow-sm"
        >
          {FEATURED_LABEL}
        </Badge>
      ) : null}
    </div>
  );
}

function ArtworkImage({ event }: { event: EventSummary }) {
  return (
    // Stand-in artwork comes from an external host, and no next/image remote
    // pattern is configured for it — see heroImageUrl(). Swap to <Image> in
    // the same change that settles the CDN origin.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={heroImageUrl(event)}
      alt=""
      loading="lazy"
      className="size-full object-cover transition-transform duration-500 ease-standard group-hover:scale-[1.03]"
    />
  );
}
