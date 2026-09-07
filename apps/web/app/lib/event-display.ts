import type { EventCategory, EventStatus } from '@repo/contracts/catalog';
import type { Money } from '@repo/contracts/shared';
import { formatMoney } from './format';

/**
 * How an Event is *said* in the UI, in one place.
 *
 * The carousel and the browse card both need this vocabulary, and two copies
 * of it would drift the first time a status is reworded. Nothing here is a
 * design token — these are editorial decisions about wording and stand-in
 * artwork, which is exactly why they do not live in @repo/ui.
 */

/** Sale state, said the way a buyer reads it rather than the way we store it. */
export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Not yet announced',
  published: 'Coming soon',
  on_sale: 'On sale now',
  closed: 'Sales closed',
  cancelled: 'Cancelled',
};

/**
 * What a highlighted event is called on screen.
 *
 * One word, in one place, for the same reason `STATUS_LABEL` is here: the card
 * and the carousel both say it, and two copies drift the first time someone
 * prefers "Spotlight". The column is `featured` and so is the wording — a
 * marker whose label does not match the flag an organizer just set is a
 * support question waiting to happen.
 */
export const FEATURED_LABEL = 'Featured';

/**
 * Zero is a price, and "R$ 0,00" is not how anyone says it.
 *
 * The wording lives here rather than in `formatMoney` because it is a wording
 * decision and not a formatting one: a refund line or an organizer's revenue
 * total showing "Free" instead of "R$ 0,00" would be wrong, so the money
 * formatter stays literal and the storefront chooses this word for itself.
 */
export const FREE_LABEL = 'Free';

export function isFree(money: Money): boolean {
  return money.amountMinor === 0;
}

/**
 * One tier's price, as a buyer reads it. For the cheapest-of-many "from" line
 * the callers branch themselves — see `EventCard` — because "From Free" is not
 * a sentence and the prefix has to disappear along with the number.
 */
export function formatPrice(money: Money): string {
  return isFree(money) ? FREE_LABEL : formatMoney(money);
}

/**
 * Only `on_sale` accepts holds (docs/domain-model.md), so every other status
 * renders its call to action inert. Slice 0 has nothing to sell either way —
 * this is the rule the buy button will obey once Inventory exists.
 */
export function isBuyable(status: EventStatus): boolean {
  return status === 'on_sale';
}

/**
 * Fallback artwork tints, keyed by category so a given event always draws the
 * same one. Used where a full photograph would overwhelm the layout, and as
 * the backstop when the network has nothing to give.
 */
export const CATEGORY_ART_TINT: Record<EventCategory, string> = {
  music: '#1b3a8f',
  sports: '#0f4a5a',
  theatre: '#4a2a6b',
  conference: '#1f4a3c',
  comedy: '#6b3a1f',
  festival: '#5a2a4a',
};

/**
 * Stand-in photography for an event that has no `heroImageUrl` — which today
 * is every event, since nothing populates the column and no CDN origin has
 * been chosen (ADR-0005 defers the runtime decision, and artwork hosting rides
 * along with it).
 *
 * Seeded by slug rather than random so an event keeps the same picture across
 * reloads, between the card and the detail page, and between two people
 * looking at the same link. A listing that reshuffles its own artwork on every
 * render looks broken in a way that is hard to attribute.
 *
 * This is scaffolding with an expiry date: when real artwork exists, this
 * function is the single thing to delete, and `heroImageUrl` flows through
 * untouched.
 */
export function heroImageUrl(event: {
  slug: string;
  heroImageUrl: string | null;
}): string {
  return (
    event.heroImageUrl ??
    `https://picsum.photos/seed/${encodeURIComponent(event.slug)}/800/450`
  );
}
