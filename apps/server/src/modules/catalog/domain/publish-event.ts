import type { EventStatus } from './event';
import { seatMapCapacity, type SectionKind } from './seat-map';

/**
 * Publishing an Event — the transition, and the rules that guard it.
 *
 * This file is where three comments left elsewhere in this context finally
 * point. `event.entity.ts` says an event cannot be published without a seat
 * map; `price-tier-section.entity.ts` says the publish rule re-checks that
 * every section is priced before Inventory snapshots anything;
 * `seat-map.ts` says rejecting an empty layout "belongs in the publish rule,
 * not in arithmetic". All three are below.
 *
 * Publishing matters because of what it will become. After ADR-0006 it is the
 * moment Inventory copies the layout into allocation rows and stops looking at
 * Catalog — so it is the last point at which any of this is still editable, and
 * therefore the last point at which these rules can be enforced at all.
 *
 * Pure on purpose: no entities, no repository, no Nest. The rules are the part
 * worth testing exhaustively, and they should not need a database to say so.
 */

/** The only status an event may be published *from*. */
export const PUBLISHABLE_FROM_STATUS: EventStatus = 'draft';

/**
 * And the only one it lands in.
 *
 * Note it is not `on_sale`: per docs/domain-model.md only an `on_sale` event
 * accepts holds. Publishing makes an event *visible*; putting it on sale is a
 * second transition with its own rules, and collapsing the two would mean an
 * organizer could never preview a published page before tickets moved.
 */
export const PUBLISHED_STATUS: EventStatus = 'published';

/**
 * One section as the publish rule needs to see it. A superset of
 * `SectionCapacity`, so it feeds `seatMapCapacity` directly.
 */
export type PublishSection = {
  id: string;
  name: string;
  kind: SectionKind;
  capacity: number | null;
  seatCount: number;
  /** Covered by a price tier *of this event* — not merely by some tier. */
  isPriced: boolean;
};

/** Everything the decision depends on, gathered before any of it is judged. */
export type PublishCandidate = {
  status: EventStatus;
  seatMapId: string | null;
  priceTierCount: number;
  sections: readonly PublishSection[];
};

/**
 * Why an event may not be published. A tagged union rather than a string so
 * the api/ layer decides the wording and this layer decides the rule — the
 * same split the mapper makes for reads.
 */
export type PublishBlocker =
  | { reason: 'wrong_status'; status: EventStatus }
  | { reason: 'no_seat_map' }
  | { reason: 'no_price_tiers' }
  | { reason: 'empty_seat_map' }
  | { reason: 'unpriced_sections'; sectionNames: string[] };

/**
 * The first reason this event cannot be published, or null if it can.
 *
 * First rather than all: these are ordered from most to least fundamental, and
 * an event with no seat map has nothing to say about unpriced sections. The
 * organizer console can ask again after each fix.
 *
 * The order between the last two is load-bearing. A seat map with no sections
 * has zero capacity *and*, vacuously, no unpriced sections — so if the pricing
 * check ran first, an entirely empty layout would sail through.
 */
export function publishBlocker(
  candidate: PublishCandidate,
): PublishBlocker | null {
  if (candidate.status !== PUBLISHABLE_FROM_STATUS) {
    return { reason: 'wrong_status', status: candidate.status };
  }

  if (candidate.seatMapId === null) {
    return { reason: 'no_seat_map' };
  }

  if (candidate.priceTierCount === 0) {
    return { reason: 'no_price_tiers' };
  }

  if (seatMapCapacity(candidate.sections) === 0) {
    return { reason: 'empty_seat_map' };
  }

  const unpriced = candidate.sections.filter((section) => !section.isPriced);

  if (unpriced.length > 0) {
    return {
      reason: 'unpriced_sections',
      sectionNames: unpriced.map((section) => section.name),
    };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Opening the doors
 * ------------------------------------------------------------------ */

/**
 * Putting an event on sale — the second transition, and a much smaller one.
 *
 * It exists as its own step because `docs/domain-model.md` is binding and says
 * only an `on_sale` event accepts holds. Collapsing it into publish would mean
 * an organizer can never have a page live before tickets move, and it would
 * merge two facts that fail differently: publishing is where capacity is
 * snapshotted and can fail on a bad layout, while going on sale is a decision
 * about timing that cannot fail on anything.
 *
 * Which is why there are no rules here beyond the status itself. Everything
 * worth checking was checked at publish, and re-checking it would be asking
 * the same questions of a world that Inventory has already copied.
 */
export const SELLABLE_FROM_STATUS: EventStatus = 'published';
export const ON_SALE_STATUS: EventStatus = 'on_sale';

/** Why an event may not go on sale, or null if it may. */
export type OnSaleBlocker = { reason: 'wrong_status'; status: EventStatus };

export function onSaleBlocker(status: EventStatus): OnSaleBlocker | null {
  return status === SELLABLE_FROM_STATUS
    ? null
    : { reason: 'wrong_status', status };
}
