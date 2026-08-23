import 'reflect-metadata';
import { EventEntity } from '../../modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../../modules/catalog/infrastructure/entities/organizer.entity';
import { PriceTierEntity } from '../../modules/catalog/infrastructure/entities/price-tier.entity';
import { VenueEntity } from '../../modules/catalog/infrastructure/entities/venue.entity';
import type {
  EventCategory,
  EventStatus,
} from '../../modules/catalog/domain/event';
import dataSource from '../data-source';

/**
 * Deterministic seed data for local development.
 *
 * Idempotent: it truncates the catalog tables and rewrites them, so running it
 * twice leaves the same database rather than a doubled one. Dates are relative
 * to the run, so the "upcoming events" list is never stale.
 *
 * The spread is deliberate — enough events to page through, several cities and
 * categories to filter by, a wide price range to sort by, and a few non-public
 * statuses that must never appear in the public listing.
 */

const VENUES = [
  { name: 'Allianz Parque', city: 'São Paulo', country: 'BR' },
  { name: 'Espaço Unimed', city: 'São Paulo', country: 'BR' },
  { name: 'Theatro Municipal', city: 'São Paulo', country: 'BR' },
  { name: 'Jeunesse Arena', city: 'Rio de Janeiro', country: 'BR' },
  { name: 'Vivo Rio', city: 'Rio de Janeiro', country: 'BR' },
  { name: 'Mineirão', city: 'Belo Horizonte', country: 'BR' },
  { name: 'Pedreira Paulo Leminski', city: 'Curitiba', country: 'BR' },
  { name: 'Concha Acústica', city: 'Salvador', country: 'BR' },
];

const ORGANIZERS = [
  'Forge Live',
  'Northside Presents',
  'Atlas Collective',
  'Meridian Events',
  'Quiet Riot Productions',
];

type EventSeed = {
  title: string;
  category: EventCategory;
  status: EventStatus;
  /** Days from today. */
  inDays: number;
  venue: number;
  organizer: number;
  tiers: [string, number][];
  description: string;
};

const EVENTS: EventSeed[] = [
  {
    title: 'Neon Cathedral — South American Tour',
    category: 'music',
    status: 'on_sale',
    inDays: 12,
    venue: 0,
    organizer: 0,
    tiers: [
      ['Pista', 18000],
      ['Pista Premium', 32000],
      ['Camarote', 58000],
    ],
    description:
      'The synth-rock five-piece bring their sold-out European run to São Paulo for one night, with the full analogue stage rig and a support set from Vale Nova.',
  },
  {
    title: 'Midnight Orchestra plays Ravel',
    category: 'theatre',
    status: 'on_sale',
    inDays: 5,
    venue: 2,
    organizer: 3,
    tiers: [
      ['Balcony', 9000],
      ['Stalls', 16000],
      ['Box', 27000],
    ],
    description:
      'A late-evening programme of Ravel and Debussy, performed by candlelight in the Theatro Municipal main hall.',
  },
  {
    title: 'Clássico: Palmeiras × Corinthians',
    category: 'sports',
    status: 'on_sale',
    inDays: 21,
    venue: 0,
    organizer: 1,
    tiers: [
      ['Arquibancada', 12000],
      ['Cadeira Superior', 22000],
      ['Cadeira Central', 45000],
    ],
    description:
      'The derby, at Allianz Parque. Gates open two hours before kick-off; away supporters are in the north stand.',
  },
  {
    title: 'Forge Summit 2026',
    category: 'conference',
    status: 'on_sale',
    inDays: 47,
    venue: 1,
    organizer: 2,
    tiers: [
      ['Early Bird', 49000],
      ['Standard', 79000],
      ['Workshop Pass', 129000],
    ],
    description:
      'Two days on distributed systems, developer tooling, and the unglamorous work of running software at scale. Thirty talks across three tracks.',
  },
  {
    title: 'Ana Prado — Ao Vivo',
    category: 'music',
    status: 'on_sale',
    inDays: 3,
    venue: 4,
    organizer: 0,
    tiers: [
      ['Plateia', 14000],
      ['Mezanino', 21000],
    ],
    description:
      'An intimate acoustic show at Vivo Rio, recorded for the forthcoming live album.',
  },
  {
    title: 'Stand-Up Sunday: Open Mic Finals',
    category: 'comedy',
    status: 'on_sale',
    inDays: 9,
    venue: 4,
    organizer: 4,
    tiers: [['General', 6000]],
    description:
      'Twelve comics, five minutes each, one trophy that is objectively quite ugly. Doors at 19:00.',
  },
  {
    title: 'Festival Horizonte — Day One',
    category: 'festival',
    status: 'on_sale',
    inDays: 63,
    venue: 6,
    organizer: 2,
    tiers: [
      ['Day Pass', 28000],
      ['Day Pass VIP', 52000],
    ],
    description:
      'The first of three days at Pedreira Paulo Leminski, with four stages running from midday until 2am.',
  },
  {
    title: 'Festival Horizonte — Full Weekend',
    category: 'festival',
    status: 'on_sale',
    inDays: 63,
    venue: 6,
    organizer: 2,
    tiers: [
      ['Weekend Pass', 68000],
      ['Weekend VIP', 145000],
    ],
    description:
      'All three days, all four stages, plus access to the riverside camping field.',
  },
  {
    title: 'A Casa Vazia',
    category: 'theatre',
    status: 'on_sale',
    inDays: 16,
    venue: 2,
    organizer: 3,
    tiers: [
      ['Plateia', 8000],
      ['Frisa', 15000],
    ],
    description:
      'Marina Lobo’s two-hander about a house sale that neither sibling wants, in its final month.',
  },
  {
    title: 'Copa Sudamericana — Quarter Final',
    category: 'sports',
    status: 'on_sale',
    inDays: 34,
    venue: 5,
    organizer: 1,
    tiers: [
      ['Geral', 9000],
      ['Superior', 19000],
      ['Camarote', 62000],
    ],
    description:
      'Second leg at the Mineirão, with the tie level after a goalless first leg.',
  },
  {
    title: 'Vale Nova — Album Release',
    category: 'music',
    status: 'on_sale',
    inDays: 28,
    venue: 3,
    organizer: 0,
    tiers: [
      ['Pista', 11000],
      ['Pista Premium', 19000],
    ],
    description:
      'Playing the new record front to back, then everything else they have got.',
  },
  {
    title: 'Noite de Samba na Concha',
    category: 'music',
    status: 'on_sale',
    inDays: 7,
    venue: 7,
    organizer: 4,
    tiers: [['Único', 7000]],
    description:
      'Six groups rotating through the Concha Acústica from sundown, as they have every first Friday since 1998.',
  },
  {
    title: 'Design Systems Day',
    category: 'conference',
    status: 'on_sale',
    inDays: 40,
    venue: 1,
    organizer: 2,
    tiers: [
      ['Standard', 39000],
      ['Team of 4', 132000],
    ],
    description:
      'One track, eight talks, on tokens, governance, and what happens to a design system after its first year.',
  },
  {
    title: 'Improviso Total',
    category: 'comedy',
    status: 'on_sale',
    inDays: 19,
    venue: 4,
    organizer: 4,
    tiers: [
      ['General', 7500],
      ['Front Rows', 13000],
    ],
    description:
      'Long-form improv built entirely from audience suggestions. No two shows have ever been the same, allegedly.',
  },
  {
    title: 'Orquestra Sinfônica — Temporada de Verão',
    category: 'theatre',
    status: 'on_sale',
    inDays: 55,
    venue: 2,
    organizer: 3,
    tiers: [
      ['Balcony', 10000],
      ['Stalls', 18000],
      ['Box', 31000],
    ],
    description:
      'The summer season opens with Villa-Lobos, Márquez, and a new commission from Helena Braz.',
  },
  {
    title: 'Maratona de São Paulo',
    category: 'sports',
    status: 'on_sale',
    inDays: 71,
    venue: 0,
    organizer: 1,
    tiers: [
      ['5K', 9500],
      ['21K', 17000],
      ['42K', 26000],
    ],
    description:
      'Three distances, one start line at Allianz Parque. Entry includes chip timing and the finisher kit.',
  },
  {
    title: 'Cinema ao Ar Livre: Noite Kurosawa',
    category: 'festival',
    status: 'on_sale',
    inDays: 11,
    venue: 6,
    organizer: 4,
    tiers: [['General', 4000]],
    description:
      'Two Kurosawa restorations projected onto the quarry wall. Bring something to sit on.',
  },
  {
    title: 'Tech Interlúdio — Meetup Anual',
    category: 'conference',
    status: 'published',
    inDays: 84,
    venue: 1,
    organizer: 2,
    tiers: [['Standard', 12000]],
    description:
      'The annual all-day meetup. Published now; tickets go on sale next month.',
  },
  {
    title: 'Corais do Sul — Encontro',
    category: 'music',
    status: 'published',
    inDays: 90,
    venue: 7,
    organizer: 3,
    tiers: [['Único', 5000]],
    description:
      'Fourteen choirs from across the south, closing with a combined 300-voice performance.',
  },
  {
    title: 'Circo Moderno — Estreia',
    category: 'theatre',
    status: 'published',
    inDays: 38,
    venue: 3,
    organizer: 3,
    tiers: [
      ['Plateia', 13000],
      ['VIP', 24000],
    ],
    description:
      'Contemporary circus with a live score. Opening night, with the company in attendance.',
  },
  {
    title: 'Rally Cross Paraná',
    category: 'sports',
    status: 'published',
    inDays: 96,
    venue: 6,
    organizer: 1,
    tiers: [
      ['Geral', 8000],
      ['Paddock', 30000],
    ],
    description:
      'Round four of the national championship, on the gravel circuit.',
  },
  {
    title: 'Festival Horizonte — Day Two',
    category: 'festival',
    status: 'published',
    inDays: 64,
    venue: 6,
    organizer: 2,
    tiers: [
      ['Day Pass', 28000],
      ['Day Pass VIP', 52000],
    ],
    description:
      'Saturday at Pedreira Paulo Leminski. Line-up announced in full next week.',
  },
  {
    title: 'Piano Solo: Nocturnes',
    category: 'theatre',
    status: 'published',
    inDays: 26,
    venue: 2,
    organizer: 3,
    tiers: [['Stalls', 11000]],
    description:
      'Chopin’s complete nocturnes in one sitting, with a single interval.',
  },
  {
    title: 'Comédia em Dobro',
    category: 'comedy',
    status: 'published',
    inDays: 44,
    venue: 4,
    organizer: 4,
    tiers: [['General', 9000]],
    description:
      'Two headline sets in one night, from two comics who insist they are friends.',
  },
  {
    title: 'Aurora Fields — Rehearsal Session',
    category: 'music',
    status: 'draft',
    inDays: 30,
    venue: 3,
    organizer: 0,
    tiers: [['Pista', 15000]],
    description:
      'Still being scheduled — must never appear in the public listing.',
  },
  {
    title: 'Encontro Regional (Adiado)',
    category: 'conference',
    status: 'cancelled',
    inDays: 25,
    venue: 1,
    organizer: 2,
    tiers: [['Standard', 20000]],
    description:
      'Cancelled by the organizer — must never appear in the public listing.',
  },
  {
    title: 'Retrospectiva 2025',
    category: 'festival',
    status: 'closed',
    inDays: -14,
    venue: 7,
    organizer: 4,
    tiers: [['General', 6000]],
    description: 'Already happened — must never appear in the public listing.',
  },
];

function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function daysFromNow(days: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function seed(): Promise<void> {
  await dataSource.initialize();

  try {
    // CASCADE covers price_tiers; RESTART IDENTITY is harmless with uuid keys
    // and keeps the statement correct if a serial column is ever added.
    await dataSource.query(
      `TRUNCATE TABLE "price_tiers", "events", "venues", "organizers" RESTART IDENTITY CASCADE`,
    );

    const organizers = await dataSource
      .getRepository(OrganizerEntity)
      .save(ORGANIZERS.map((name) => ({ name })));

    const venues = await dataSource.getRepository(VenueEntity).save(VENUES);

    const events = await dataSource.getRepository(EventEntity).save(
      EVENTS.map((seed) => ({
        slug: slugify(seed.title),
        title: seed.title,
        description: seed.description,
        category: seed.category,
        status: seed.status,
        startsAt: daysFromNow(seed.inDays, 20),
        endsAt: daysFromNow(seed.inDays, 23),
        doorsOpenAt: daysFromNow(seed.inDays, 19),
        heroImageUrl: null,
        venueId: venues[seed.venue].id,
        organizerId: organizers[seed.organizer].id,
      })),
    );

    await dataSource.getRepository(PriceTierEntity).save(
      EVENTS.flatMap((seed, index) =>
        seed.tiers.map(([name, amount]) => ({
          eventId: events[index].id,
          name,
          priceAmountMinor: amount,
          priceCurrency: 'BRL' as const,
        })),
      ),
    );

    const publicCount = EVENTS.filter((event) =>
      ['published', 'on_sale'].includes(event.status),
    ).length;

    console.log(
      `Seeded ${organizers.length} organizers, ${venues.length} venues, ` +
        `${events.length} events (${publicCount} publicly visible).`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
