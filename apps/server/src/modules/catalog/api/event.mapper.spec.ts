import type { EventEntity } from '../infrastructure/entities/event.entity';
import type { PriceTierEntity } from '../infrastructure/entities/price-tier.entity';
import { toEventDetail, toEventSummary } from './event.mapper';

const tier = (name: string, amount: number): PriceTierEntity =>
  ({
    id: `tier-${name}`,
    eventId: 'event-1',
    name,
    priceAmountMinor: amount,
    priceCurrency: 'BRL',
  }) as PriceTierEntity;

const anEvent = (overrides: Partial<EventEntity> = {}): EventEntity =>
  ({
    id: 'event-1',
    slug: 'neon-cathedral',
    title: 'Neon Cathedral',
    description: 'A show.',
    category: 'music',
    status: 'on_sale',
    startsAt: new Date('2026-09-01T23:00:00.000Z'),
    endsAt: new Date('2026-09-02T02:00:00.000Z'),
    doorsOpenAt: new Date('2026-09-01T22:00:00.000Z'),
    heroImageUrl: null,
    venueId: 'venue-1',
    organizerId: 'organizer-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    venue: {
      id: 'venue-1',
      name: 'Allianz Parque',
      city: 'São Paulo',
      country: 'BR',
    },
    organizer: { id: 'organizer-1', name: 'Forge Live' },
    priceTiers: [tier('Camarote', 58000), tier('Pista', 18000)],
    ...overrides,
  }) as EventEntity;

describe('toEventSummary', () => {
  it('reports the cheapest tier as priceFrom regardless of tier order', () => {
    expect(toEventSummary(anEvent()).priceFrom).toEqual({
      amountMinor: 18000,
      currency: 'BRL',
    });
  });

  it('reports no price when the event has no tiers', () => {
    expect(toEventSummary(anEvent({ priceTiers: [] })).priceFrom).toBeNull();
  });

  it('survives an event loaded without its tiers relation', () => {
    const withoutRelation = anEvent({
      priceTiers: undefined as unknown as PriceTierEntity[],
    });

    expect(toEventSummary(withoutRelation).priceFrom).toBeNull();
  });

  it('serialises dates as ISO strings, keeping null as null', () => {
    const summary = toEventSummary(anEvent({ endsAt: null }));

    expect(summary.startsAt).toBe('2026-09-01T23:00:00.000Z');
    expect(summary.endsAt).toBeNull();
  });
});

describe('toEventDetail', () => {
  it('orders price tiers from cheapest to most expensive', () => {
    const detail = toEventDetail(
      anEvent({
        priceTiers: [
          tier('Camarote', 58000),
          tier('Pista', 18000),
          tier('Pista Premium', 32000),
        ],
      }),
    );

    expect(detail.priceTiers.map((t) => t.name)).toEqual([
      'Pista',
      'Pista Premium',
      'Camarote',
    ]);
  });

  it('carries the summary fields through unchanged', () => {
    const event = anEvent();

    expect(toEventDetail(event)).toMatchObject(toEventSummary(event));
  });
});
