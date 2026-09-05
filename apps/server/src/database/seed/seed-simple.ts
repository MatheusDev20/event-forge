import 'reflect-metadata';
import { EventEntity } from '../../modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../../modules/catalog/infrastructure/entities/organizer.entity';
import { PriceTierEntity } from '../../modules/catalog/infrastructure/entities/price-tier.entity';
import { PriceTierSectionEntity } from '../../modules/catalog/infrastructure/entities/price-tier-section.entity';
import { SeatEntity } from '../../modules/catalog/infrastructure/entities/seat.entity';
import { SeatMapEntity } from '../../modules/catalog/infrastructure/entities/seat-map.entity';
import { SeatRowEntity } from '../../modules/catalog/infrastructure/entities/seat-row.entity';
import { SectionEntity } from '../../modules/catalog/infrastructure/entities/section.entity';
import { VenueEntity } from '../../modules/catalog/infrastructure/entities/venue.entity';
import dataSource from '../data-source';

/**
 * The smallest database the OneSeatExperiment can be run against, by hand.
 *
 * `seed.ts` is the demo fixture: eight venues, 27 events, 824 seats — enough to
 * page, filter and sort a storefront. That is the wrong shape for learning the
 * hold path, where the only question is *who got the seat*, and every extra row
 * is one more thing to scroll past on the way to the answer.
 *
 * So this is one real-looking on-sale, at a scale you can hold in your head:
 *
 *   Allianz Parque, São Paulo
 *   └─ Modo Show
 *      ├─ Pista Premium     general admission    8 units   R$ 690
 *      ├─ Pista             general admission   20 units   R$ 390
 *      └─ Cadeira Superior  seated  row A 1-6    6 seats   R$ 250
 *
 *   The Strokes World Tour  (draft)
 *
 * The names are real because a fixture you can picture is easier to reason
 * about than `Section A` — but the numbers are not. A real Allianz Parque
 * concert configuration is ~43,000 units across four sections; this is 34,
 * because the experiment is about *contention*, and contention needs scarcity,
 * not scale. Eight Pista Premium units sell out in eight requests, which is the
 * whole point.
 *
 * Both section kinds are here because they contend differently and the
 * experiment is about exactly that difference: six seats are six rows that lock
 * one at a time, while a counter is a single hot row every claim serialises on.
 * Six seats leaves five spare after the race for a multi-seat, all-or-nothing
 * claim.
 *
 * The event is left as a **draft** on purpose. Publishing is what makes
 * Inventory snapshot the layout into allocations (ADR-0006), so an event seeded
 * straight into `on_sale` would have nothing to sell and `availability` would
 * come back empty — the most confusing possible first impression. Walking the
 * transitions yourself is the point; `printNextSteps` below hands you the
 * commands.
 */

/**
 * Fixed ids, so the commands printed at the end stay copy-pasteable across
 * re-seeds and every note you write about a run still resolves tomorrow. Real
 * v4 UUIDs — the API validates the format and would refuse `venue-1`.
 *
 * Seats, rows and price tiers keep generated ids: nothing needs to name them,
 * and `availability` hands you the allocation ids that actually matter.
 */
const ID = {
  organizer: '11111111-1111-4111-8111-111111111111',
  venue: '22222222-2222-4222-8222-222222222222',
  seatMap: '33333333-3333-4333-8333-333333333333',
  pistaPremium: '44444444-4444-4444-8444-444444444444',
  pista: '55555555-5555-4555-8555-555555555555',
  cadeiraSuperior: '66666666-6666-4666-8666-666666666666',
  event: '77777777-7777-4777-8777-777777777777',
} as const;

const PISTA_PREMIUM_CAPACITY = 8;
const PISTA_CAPACITY = 20;
const SEATS_IN_ROW = 6;
const EVENT_SLUG = 'the-strokes-world-tour';

/** Days from the seed run to the show. Far enough out to look like a real on-sale. */
const DAYS_OUT = 60;

/**
 * Every table this script owns, children first.
 *
 * Inventory's three are here even though this file writes none of them, and
 * that is deliberate: `allocations` has no foreign key to `events` (ADR-0001
 * keeps cross-context references as plain ids), so `CASCADE` cannot reach them
 * from the catalog side. Without this list a re-seed would leave the previous
 * run's allocations and holds behind — rows pointing at an event id that no
 * longer exists — and because the event id above is fixed, the next publish
 * would collide with `allocations_seat_unique_per_event` rather than fail
 * quietly. Resetting between attempts is most of what running the experiment
 * consists of, so the reset has to be total.
 */
const TABLES = [
  'hold_lines',
  'holds',
  'allocations',
  'price_tier_sections',
  'price_tiers',
  'seats',
  'seat_rows',
  'sections',
  'seat_maps',
  'events',
  'venues',
  'organizers',
];

async function seedSimple(): Promise<void> {
  await dataSource.initialize();

  try {
    await dataSource.query(
      `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')}
       RESTART IDENTITY CASCADE`,
    );

    await dataSource
      .getRepository(OrganizerEntity)
      .save({ id: ID.organizer, name: 'Meridiano Live Brasil' });

    await dataSource.getRepository(VenueEntity).save({
      id: ID.venue,
      name: 'Allianz Parque',
      city: 'São Paulo',
      country: 'BR',
    });

    await dataSource.getRepository(SeatMapEntity).save({
      id: ID.seatMap,
      venueId: ID.venue,
      name: 'Modo Show',
    });

    await dataSource.getRepository(SectionEntity).save([
      {
        id: ID.pistaPremium,
        seatMapId: ID.seatMap,
        name: 'Pista Premium',
        kind: 'general_admission' as const,
        capacity: PISTA_PREMIUM_CAPACITY,
        // Front to back: the pit is closest to the stage.
        displayOrder: 0,
      },
      {
        id: ID.pista,
        seatMapId: ID.seatMap,
        name: 'Pista',
        kind: 'general_admission' as const,
        capacity: PISTA_CAPACITY,
        displayOrder: 1,
      },
      {
        id: ID.cadeiraSuperior,
        seatMapId: ID.seatMap,
        name: 'Cadeira Superior',
        kind: 'seated' as const,
        // NULL for seated, by constraint: its capacity is its seat count.
        capacity: null,
        displayOrder: 2,
      },
    ]);

    const row = await dataSource.getRepository(SeatRowEntity).save({
      sectionId: ID.cadeiraSuperior,
      label: 'A',
      displayOrder: 0,
    });

    await dataSource.getRepository(SeatEntity).save(
      Array.from({ length: SEATS_IN_ROW }, (_, index) => ({
        rowId: row.id,
        label: String(index + 1),
        displayOrder: index,
      })),
    );

    await dataSource.getRepository(EventEntity).save({
      id: ID.event,
      slug: EVENT_SLUG,
      title: 'The Strokes World Tour',
      description:
        'The Strokes bring the World Tour to São Paulo for one night at the ' +
        'Allianz Parque. Doors at 19:30.',
      category: 'music' as const,
      status: 'draft' as const,
      startsAt: daysFromNow(DAYS_OUT, 21, 0),
      endsAt: daysFromNow(DAYS_OUT, 23, 30),
      doorsOpenAt: daysFromNow(DAYS_OUT, 19, 30),
      heroImageUrl: null,
      venueId: ID.venue,
      organizerId: ID.organizer,
      seatMapId: ID.seatMap,
    });

    /*
     * One tier per section. Publishing refuses while any section is unpriced,
     * so a seed that skipped this would produce a draft that cannot be
     * published — a puzzle rather than a starting point.
     *
     * Money is in minor units, always: R$ 690,00 is 69000 centavos. See
     * @repo/contracts/shared/money.
     */
    const tiers = await dataSource.getRepository(PriceTierEntity).save([
      {
        eventId: ID.event,
        name: 'Pista Premium',
        priceAmountMinor: 69000,
        priceCurrency: 'BRL' as const,
      },
      {
        eventId: ID.event,
        name: 'Pista',
        priceAmountMinor: 39000,
        priceCurrency: 'BRL' as const,
      },
      {
        eventId: ID.event,
        name: 'Cadeira Superior',
        priceAmountMinor: 25000,
        priceCurrency: 'BRL' as const,
      },
    ]);

    await dataSource.getRepository(PriceTierSectionEntity).save([
      { priceTierId: tiers[0].id, sectionId: ID.pistaPremium },
      { priceTierId: tiers[1].id, sectionId: ID.pista },
      { priceTierId: tiers[2].id, sectionId: ID.cadeiraSuperior },
    ]);

    printNextSteps();
  } finally {
    await dataSource.destroy();
  }
}

function daysFromNow(days: number, hour: number, minute: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/**
 * The walk-through, printed where it is needed rather than kept in a README
 * nobody has open at 2am.
 *
 * It stops at `availability` on purpose: allocation ids are minted by the
 * snapshot and cannot be known here, so the last commands are the ones you fill
 * in from what the previous call returns. That is not a gap in the script — it
 * is the API's actual contract, and a seed that pretended otherwise would be
 * teaching the wrong thing.
 */
function printNextSteps(): void {
  const api = 'http://localhost:3001/api/v1';
  const allocations = 2 + SEATS_IN_ROW;

  console.log(`Seeded: The Strokes World Tour @ Allianz Parque, São Paulo (draft)

  Pista Premium     general admission   ${PISTA_PREMIUM_CAPACITY} units   R$ 690
  Pista             general admission   ${PISTA_CAPACITY} units   R$ 390
  Cadeira Superior  seated  row A 1-${SEATS_IN_ROW}    ${SEATS_IN_ROW} seats   R$ 250

  event    ${ID.event}
  slug     ${EVENT_SLUG}
  venue    ${ID.venue}
  seat map ${ID.seatMap}

Walk it:

  # 1. See the layout you are about to sell
  curl -s ${api}/venues/${ID.venue}/seat-maps | jq

  # 2. Publish — Inventory snapshots the layout into ${allocations} allocations
  curl -s -X POST ${api}/events/${ID.event}/publish | jq '.status'

  # 3. Open the doors — only an on_sale event accepts holds
  curl -s -X POST ${api}/events/${ID.event}/on-sale | jq '.status'

  # 4. Learn the allocation ids, and what is still free
  curl -s '${api}/events/${ID.event}/availability?pageSize=48' | jq '.items'

  # 5. Claim one, with an id from step 4
  curl -s -X POST ${api}/events/${ID.event}/holds \\
    -H 'content-type: application/json' \\
    -d '{"lines":[{"allocationId":"<id from step 4>","quantity":1}]}' | jq

  # 6. The OneSeatExperiment: 8 clients, one seat, all at once.
  #    Exactly one 201, seven 409s, every one ALLOCATION_UNAVAILABLE.
  #    (-I@ and not -I_ : xargs would substitute into %{http_code} too.)
  seq 8 | xargs -P8 -I@ curl -s -o /dev/null -w '%{http_code}\\n' \\
    -X POST ${api}/events/${ID.event}/holds \\
    -H 'content-type: application/json' \\
    -d '{"lines":[{"allocationId":"<a Cadeira Superior id>","quantity":1}]}' \\
    | sort | uniq -c

  # 7. Or sell out the pit: ${PISTA_PREMIUM_CAPACITY} units, more claimants than units.
  #    It stops at exactly ${PISTA_PREMIUM_CAPACITY} held, never past.

Start over at any point with: pnpm db:seed:simple`);
}

seedSimple().catch((error: unknown) => {
  console.error('Simple seed failed:', error);
  process.exit(1);
});
