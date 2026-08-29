import type { EventSummary } from '@repo/contracts/catalog';
import { Badge } from '@repo/ui/badge';
import { Card } from '@repo/ui/card';
import Link from 'next/link';
import { formatEventDateTime, formatMoney } from '../lib/format';
import {
  CATEGORY_ART_TINT,
  STATUS_LABEL,
  heroImageUrl,
} from '../lib/event-display';

/**
 * One event in the browse grid.
 *
 * The whole card is the link rather than a "view" button: the target is the
 * event, and giving a card two tab stops for one destination is noise for
 * anyone moving by keyboard.
 */
export function EventCard({ event }: { event: EventSummary }) {
  return (
    <Card
      interactive
      elevation="flat"
      className="group overflow-hidden focus-within:ring-focus-ring focus-within:ring-2"
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
            {event.priceFrom ? (
              <>
                <span className="text-text-subtle font-normal">From </span>
                {formatMoney(event.priceFrom)}
              </>
            ) : (
              /* Null means no tier is priced yet — not that it is free. */
              <span className="text-text-subtle font-normal">
                Prices to be announced
              </span>
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
