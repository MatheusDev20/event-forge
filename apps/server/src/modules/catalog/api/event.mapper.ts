import type {
  EventDetail,
  EventSummary,
  PriceTier,
} from '@repo/contracts/catalog';
import type { Money } from '@repo/contracts/shared';
import type { EventEntity } from '../infrastructure/entities/event.entity';
import type { PriceTierEntity } from '../infrastructure/entities/price-tier.entity';

/**
 * The one place the domain and the wire meet. Both sides are typed, so a field
 * renamed on either side fails here at compile time — which is the entire
 * reason this file exists rather than returning entities straight from the
 * controller.
 */
export function toEventSummary(event: EventEntity): EventSummary {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    category: event.category,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    venue: {
      id: event.venue.id,
      name: event.venue.name,
      city: event.venue.city,
      country: event.venue.country,
    },
    organizer: {
      id: event.organizer.id,
      name: event.organizer.name,
    },
    priceFrom: cheapestTier(event.priceTiers ?? []),
    heroImageUrl: event.heroImageUrl,
  };
}

export function toEventDetail(event: EventEntity): EventDetail {
  return {
    ...toEventSummary(event),
    description: event.description,
    doorsOpenAt: event.doorsOpenAt?.toISOString() ?? null,
    priceTiers: (event.priceTiers ?? [])
      .map(toPriceTier)
      .sort((a, b) => a.price.amountMinor - b.price.amountMinor),
  };
}

function toPriceTier(tier: PriceTierEntity): PriceTier {
  return {
    id: tier.id,
    name: tier.name,
    price: {
      amountMinor: tier.priceAmountMinor,
      currency: tier.priceCurrency,
    },
  };
}

function cheapestTier(tiers: PriceTierEntity[]): Money | null {
  if (tiers.length === 0) return null;

  const cheapest = tiers.reduce((min, tier) =>
    tier.priceAmountMinor < min.priceAmountMinor ? tier : min,
  );

  return {
    amountMinor: cheapest.priceAmountMinor,
    currency: cheapest.priceCurrency,
  };
}
