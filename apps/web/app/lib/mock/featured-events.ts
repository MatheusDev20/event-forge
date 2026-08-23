import type { EventSummary } from '@repo/contracts/catalog';

/**
 * Stand-in for the "featured events" feed the home page carousel will read.
 *
 * Typed as `EventSummary` on purpose: when the endpoint lands, this module is
 * deleted and the carousel's `events` prop is fed from `listEvents()` instead.
 * Nothing in the component knows the difference.
 *
 * Dates are ISO literals rather than offsets from `Date.now()`. The carousel is
 * a client component, so a value computed at module load would be evaluated
 * once on the server and again in the browser — close enough to look right and
 * far enough apart to produce a hydration mismatch on the formatted date.
 *
 * `heroImageUrl` is null throughout, which is the case the carousel already has
 * to handle for real events whose artwork has not been uploaded yet.
 */
export const FEATURED_EVENTS: EventSummary[] = [
  {
    id: '6f1d3c2a-9b14-4e77-8a05-2c1f4b6d8e30',
    slug: 'neon-cathedral-south-american-tour',
    title: 'Neon Cathedral — South American Tour',
    category: 'music',
    status: 'on_sale',
    startsAt: '2026-09-18T23:00:00.000Z',
    endsAt: null,
    venue: {
      id: 'b2c8e410-5d3f-4a91-9e62-7f0a1c3d5b84',
      name: 'Allianz Parque',
      city: 'São Paulo',
      country: 'BR',
    },
    organizer: {
      id: 'd41a7f60-8c25-4b13-a7e9-3b6c0d92f481',
      name: 'Northlight Live',
    },
    priceFrom: { amountMinor: 18000, currency: 'BRL' },
    heroImageUrl: null,
  },
  {
    id: '17c9b845-2e60-4d3a-b1f7-905e4a2c6d11',
    slug: 'classico-palmeiras-corinthians',
    title: 'Clássico: Palmeiras × Corinthians',
    category: 'sports',
    status: 'on_sale',
    startsAt: '2026-09-26T19:30:00.000Z',
    endsAt: null,
    venue: {
      id: 'b2c8e410-5d3f-4a91-9e62-7f0a1c3d5b84',
      name: 'Allianz Parque',
      city: 'São Paulo',
      country: 'BR',
    },
    organizer: {
      id: '9e05c7b3-4a18-42df-8c60-1d7b3e9a5f26',
      name: 'Copa Sul Sports',
    },
    priceFrom: { amountMinor: 12000, currency: 'BRL' },
    heroImageUrl: null,
  },
  {
    id: '3a5e08d7-6c41-4b29-9f83-e07d2b1a4c65',
    slug: 'midnight-orchestra-plays-ravel',
    title: 'Midnight Orchestra plays Ravel',
    category: 'theatre',
    status: 'on_sale',
    startsAt: '2026-10-07T22:30:00.000Z',
    endsAt: null,
    venue: {
      id: 'c73f1b96-0d84-4e52-a13c-6b9e5f2d8071',
      name: 'Theatro Municipal',
      city: 'São Paulo',
      country: 'BR',
    },
    organizer: {
      id: '2b6d94a1-7f30-4c85-9e12-a5c8d0b36e74',
      name: 'Quiet Riot Productions',
    },
    priceFrom: { amountMinor: 9000, currency: 'BRL' },
    heroImageUrl: null,
  },
  {
    id: 'e84c05fa-1d37-4b60-92e8-6c0f3a7d15b9',
    slug: 'festival-horizonte-day-one',
    title: 'Festival Horizonte — Day One',
    category: 'festival',
    status: 'published',
    startsAt: '2026-10-17T17:00:00.000Z',
    endsAt: '2026-10-18T05:00:00.000Z',
    venue: {
      id: '5d1908fe-3b72-4a6c-8051-9c4e7b2a3f68',
      name: 'Pedreira Paulo Leminski',
      city: 'Curitiba',
      country: 'BR',
    },
    organizer: {
      id: '7c30ab52-9e64-418d-b207-3f5a1d8c6094',
      name: 'Meridian Events',
    },
    priceFrom: { amountMinor: 28000, currency: 'BRL' },
    heroImageUrl: null,
  },
];
