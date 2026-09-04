import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ERROR_CODES } from '@repo/contracts/shared';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EventEntity } from '../src/modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../src/modules/catalog/infrastructure/entities/organizer.entity';
import { SeatMapEntity } from '../src/modules/catalog/infrastructure/entities/seat-map.entity';
import { SeatRowEntity } from '../src/modules/catalog/infrastructure/entities/seat-row.entity';
import { SeatEntity } from '../src/modules/catalog/infrastructure/entities/seat.entity';
import { SectionEntity } from '../src/modules/catalog/infrastructure/entities/section.entity';
import { VenueEntity } from '../src/modules/catalog/infrastructure/entities/venue.entity';
import { AllocationEntity } from '../src/modules/inventory/infrastructure/entities/allocation.entity';
import { HoldLineEntity } from '../src/modules/inventory/infrastructure/entities/hold-line.entity';
import { HttpExceptionFilter } from '../src/shared/http/http-exception.filter';

/**
 * **Slice 2. The experiment this project exists to run.**
 *
 * > Two attendees request the same seat, for the same event, at the same
 * > instant, moments after it went on sale. Exactly one gets it.
 *
 * Everything here is arranged around making that sentence falsifiable, so the
 * three ways a race test lies to you are addressed explicitly:
 *
 * 1. **The pool must exceed the concurrency.** With TypeORM's default of 10,
 *    firing 16 requests means 6 queue in the driver and never contend at all —
 *    the test would pass while proving nothing about locks. `DB_POOL_SIZE` is
 *    set (default 50) and asserted below, so a future edit that lowers it
 *    fails here rather than quietly changing what is being measured.
 * 2. **Once is not evidence.** Interleavings are sampled, not enumerated, so
 *    the race runs ROUNDS times against a different seat each round.
 * 3. **A loss must be the right loss.** Every non-winner is asserted to be a
 *    409 carrying ALLOCATION_UNAVAILABLE. A dropped connection, a deadlock or
 *    a 500 is also "not a 201", and counting statuses alone would let a broken
 *    lock pass as a well-behaved queue.
 *
 * What no test can prove on its own is that the *mechanism* is the lock. That
 * is why `allocations_no_oversell_check` exists underneath all of this: with
 * the constraint in place, a broken strategy cannot oversell — it can only
 * fail loudly, and the assertions below are what turn "loudly" into a red run.
 */
const PREFIX = 'e2e-race';

/** Concurrent claimants per race. Above TypeORM's default pool of 10, on purpose. */
const RACERS = 16;

/** Independent races. One is an anecdote; fifty is a sample. */
const ROUNDS = 50;

/** Seats in the fixture. One per round, plus a few for the multi-seat cases. */
const SEAT_COUNT = ROUNDS + 8;

/** Deliberately small, so a race for the counter can exhaust it. */
const GA_CAPACITY = 5;

type Outcome = { status: number; code?: string; body: any };

describe('Hold race (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organizerId: string;
  let venueId: string;
  let seatMapId: string;
  let seatedSectionId: string;
  let gaSectionId: string;

  const server = () => app.getHttpServer();

  const draft = () => ({
    slug: `${PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: `${PREFIX} show`,
    description: 'One seat, many claimants.',
    category: 'music',
    startsAt: '2099-06-01T23:00:00.000Z',
    venueId,
    organizerId,
    seatMapId,
    priceTiers: [
      {
        name: 'Plateia',
        price: { amountMinor: 9000, currency: 'BRL' },
        sectionIds: [seatedSectionId],
      },
      {
        name: 'Pista',
        price: { amountMinor: 5000, currency: 'BRL' },
        sectionIds: [gaSectionId],
      },
    ],
  });

  /** A draft, published and opened for sale — an event that accepts holds. */
  const onSaleEvent = async (): Promise<string> => {
    const id = (
      await request(server()).post('/api/v1/events').send(draft()).expect(201)
    ).body.id;

    await request(server()).post(`/api/v1/events/${id}/publish`).expect(200);
    await request(server()).post(`/api/v1/events/${id}/on-sale`).expect(200);

    return id;
  };

  /**
   * One claim, reduced to what the experiment counts.
   *
   * `.ok(() => true)` stops supertest throwing on a 4xx: a refusal is a
   * *result* here, not a failure, and a thrown error inside Promise.all would
   * lose every other racer's outcome along with it.
   */
  const claim = (
    eventId: string,
    lines: { allocationId: string; quantity?: number }[],
    holderId: string,
  ): Promise<Outcome> =>
    request(server())
      .post(`/api/v1/events/${eventId}/holds`)
      .send({ holderId, lines })
      .ok(() => true)
      .then((response) => ({
        status: response.status,
        code: response.body?.code,
        body: response.body,
      }));

  /** The seat allocations of an event, ordered so rounds pick distinct seats. */
  const seatsOf = (eventId: string) =>
    dataSource.getRepository(AllocationEntity).find({
      where: { eventId, kind: 'seated' },
      order: { seatLabel: 'ASC' },
    });

  const allocation = (id: string) =>
    dataSource.getRepository(AllocationEntity).findOneByOrFail({ id });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalFilters(new HttpExceptionFilter());

    /*
     * `listen`, not `init` — and this suite is the only one in the project
     * that needs the difference.
     *
     * Supertest binds an ephemeral port itself when handed a server that is
     * not listening. Sequentially that is invisible; sixteen calls fired at
     * once each find `address()` still null and each call `listen(0)` on the
     * same server, which is a race in the test harness rather than in the
     * system under test — and it surfaces as ECONNRESET, indistinguishable
     * from a request the API dropped. Binding once up front removes the
     * harness from the experiment.
     */
    await app.listen(0);

    dataSource = app.get<DataSource>(getDataSourceToken());

    organizerId = (
      await dataSource
        .getRepository(OrganizerEntity)
        .save({ name: `${PREFIX} organizer` })
    ).id;

    venueId = (
      await dataSource
        .getRepository(VenueEntity)
        .save({ name: `${PREFIX} venue`, city: 'Testville', country: 'BR' })
    ).id;

    seatMapId = (
      await dataSource
        .getRepository(SeatMapEntity)
        .save({ venueId, name: `${PREFIX} main` })
    ).id;

    const sections = await dataSource.getRepository(SectionEntity).save([
      {
        seatMapId,
        name: 'Plateia',
        kind: 'seated' as const,
        capacity: null,
        displayOrder: 0,
      },
      {
        seatMapId,
        name: 'Pista',
        kind: 'general_admission' as const,
        capacity: GA_CAPACITY,
        displayOrder: 1,
      },
    ]);
    seatedSectionId = sections[0].id;
    gaSectionId = sections[1].id;

    const row = await dataSource
      .getRepository(SeatRowEntity)
      .save({ sectionId: seatedSectionId, label: 'A', displayOrder: 0 });

    await dataSource.getRepository(SeatEntity).save(
      Array.from({ length: SEAT_COUNT }, (_, index) => ({
        rowId: row.id,
        // Padded so lexical order matches numeric order; the round-to-seat
        // mapping only has to be stable, but a surprising one wastes an hour.
        label: String(index + 1).padStart(4, '0'),
        displayOrder: index,
      })),
    );
  });

  afterEach(async () => {
    // Holds first: hold_lines reference allocations with a real foreign key
    // (they are all Inventory's tables), so allocations cannot go while claims
    // against them exist.
    await dataSource.query(
      `DELETE FROM holds
        WHERE event_id IN (SELECT id FROM events WHERE slug LIKE $1)`,
      [`${PREFIX}%`],
    );
    await dataSource.query(
      `DELETE FROM allocations
        WHERE event_id IN (SELECT id FROM events WHERE slug LIKE $1)`,
      [`${PREFIX}%`],
    );
    await dataSource
      .getRepository(EventEntity)
      .createQueryBuilder()
      .delete()
      .where('slug LIKE :prefix', { prefix: `${PREFIX}%` })
      .execute();
  });

  afterAll(async () => {
    await dataSource.getRepository(SeatMapEntity).delete({ id: seatMapId });
    await dataSource.getRepository(VenueEntity).delete({ id: venueId });
    await dataSource.getRepository(OrganizerEntity).delete({ id: organizerId });
    await app.close();
  });

  /* ------------------------------------------------------------------ *
   * The setup that makes the measurement honest
   * ------------------------------------------------------------------ */

  /**
   * Guard #1 from the roadmap, as an assertion rather than a comment. If
   * someone lowers the pool below RACERS, the requests below start queueing in
   * the driver instead of contending in Postgres — and every other test in
   * this file would keep passing while measuring the wrong thing.
   */
  it('has a connection pool larger than the concurrency it fires', () => {
    const poolSize = (dataSource.options as { poolSize?: number }).poolSize;

    expect(poolSize).toBeDefined();
    expect(poolSize!).toBeGreaterThan(RACERS);
  });

  /* ------------------------------------------------------------------ *
   * The happy path, so a refusal below means something
   * ------------------------------------------------------------------ */

  it('grants a hold on a free seat and moves the units', async () => {
    const eventId = await onSaleEvent();
    const [seat] = await seatsOf(eventId);
    const holderId = randomUUID();

    const outcome = await claim(eventId, [{ allocationId: seat.id }], holderId);

    expect(outcome.status).toBe(201);
    expect(outcome.body).toMatchObject({
      eventId,
      holderId,
      status: 'active',
      lines: [
        {
          allocationId: seat.id,
          quantity: 1,
          kind: 'seated',
          sectionName: 'Plateia',
          rowLabel: 'A',
        },
      ],
    });
    expect(new Date(outcome.body.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect((await allocation(seat.id)).held).toBe(1);
  });

  it('refuses a hold on an event that is published but not on sale', async () => {
    const id = (
      await request(server()).post('/api/v1/events').send(draft()).expect(201)
    ).body.id;
    await request(server()).post(`/api/v1/events/${id}/publish`).expect(200);

    const [seat] = await seatsOf(id);
    const outcome = await claim(id, [{ allocationId: seat.id }], randomUUID());

    expect(outcome.status).toBe(409);
    // Distinct from a lost seat: nothing was wrong with the request, and it
    // will work unchanged once the doors open.
    expect(outcome.code).toBe(ERROR_CODES.EVENT_NOT_ON_SALE);
    expect((await allocation(seat.id)).held).toBe(0);
  });

  it('refuses an allocation belonging to another event', async () => {
    const [mine, theirs] = [await onSaleEvent(), await onSaleEvent()];
    const [seat] = await seatsOf(theirs);

    const outcome = await claim(
      mine,
      [{ allocationId: seat.id }],
      randomUUID(),
    );

    expect(outcome.status).toBe(404);
    expect((await allocation(seat.id)).held).toBe(0);
  });

  /* ------------------------------------------------------------------ *
   * The race ★
   * ------------------------------------------------------------------ */

  /**
   * N claimants, one seat, ROUNDS times. The headline.
   *
   * Each round uses a different seat of the same event, which keeps the setup
   * to one publish while leaving the races genuinely independent — nothing a
   * round does can influence the next round's row.
   */
  it(`gives one seat to exactly one of ${RACERS} simultaneous claimants, ${ROUNDS} times`, async () => {
    const eventId = await onSaleEvent();
    const seats = await seatsOf(eventId);

    for (let round = 0; round < ROUNDS; round++) {
      const seat = seats[round];
      const holders = Array.from({ length: RACERS }, () => randomUUID());

      const outcomes = await Promise.all(
        holders.map((holderId) =>
          claim(eventId, [{ allocationId: seat.id }], holderId),
        ),
      );

      const winners = outcomes.filter((outcome) => outcome.status === 201);
      const losers = outcomes.filter((outcome) => outcome.status === 409);

      // Asserted on the counts, never on the happy path: "someone got it" is
      // true of an oversell too.
      expect({ round, winners: winners.length }).toEqual({
        round,
        winners: 1,
      });
      expect({ round, losers: losers.length }).toEqual({
        round,
        losers: RACERS - 1,
      });

      // Guard #3: every loser lost *because the seat was taken*. Without
      // this, a deadlock or a pool timeout would count as good behaviour.
      expect(losers.map((loser) => loser.code)).toEqual(
        Array.from(
          { length: RACERS - 1 },
          () => ERROR_CODES.ALLOCATION_UNAVAILABLE,
        ),
      );

      // And the database agrees with the API — one unit taken, by the one
      // holder the API said won.
      const row = await allocation(seat.id);
      expect({ round, held: row.held, reserved: row.reserved }).toEqual({
        round,
        held: 1,
        reserved: 0,
      });

      const lines = await dataSource.getRepository(HoldLineEntity).find({
        where: { allocationId: seat.id },
        relations: { hold: true },
      });

      expect(lines).toHaveLength(1);
      expect(lines[0].hold.holderId).toBe(winners[0].body.holderId);
    }
  }, 120_000); // Fifty rounds of sixteen requests, against a real database.

  /**
   * The other contention shape, and the one Slice 3 is really about: a single
   * counter row that every request in a section touches.
   *
   * The seated race proves exclusivity; this proves the *invariant*. Twenty
   * claimants against five units must produce exactly five winners — not "no
   * more than five", which a lock that simply serialised everything into
   * failure would also satisfy.
   */
  it('sells a general-admission counter down to exactly its capacity, never past', async () => {
    const eventId = await onSaleEvent();
    const counter = await dataSource
      .getRepository(AllocationEntity)
      .findOneByOrFail({ eventId, kind: 'general_admission' });

    const claimants = GA_CAPACITY * 4;
    const outcomes = await Promise.all(
      Array.from({ length: claimants }, () =>
        claim(eventId, [{ allocationId: counter.id }], randomUUID()),
      ),
    );

    expect(outcomes.filter((o) => o.status === 201)).toHaveLength(GA_CAPACITY);
    expect(
      outcomes.filter((o) => o.code === ERROR_CODES.ALLOCATION_UNAVAILABLE),
    ).toHaveLength(claimants - GA_CAPACITY);

    const row = await allocation(counter.id);
    expect(row.held).toBe(GA_CAPACITY);
    expect(row.held + row.reserved).toBeLessThanOrEqual(row.capacity);
  });

  it('lets one claimant take several units of the counter at once', async () => {
    const eventId = await onSaleEvent();
    const counter = await dataSource
      .getRepository(AllocationEntity)
      .findOneByOrFail({ eventId, kind: 'general_admission' });

    const outcome = await claim(
      eventId,
      [{ allocationId: counter.id, quantity: 3 }],
      randomUUID(),
    );

    expect(outcome.status).toBe(201);
    expect((await allocation(counter.id)).held).toBe(3);
  });

  /* ------------------------------------------------------------------ *
   * Multi-seat claims, and the deadlock they would cause unordered
   * ------------------------------------------------------------------ */

  /**
   * Two seats, two claimants, naming them in opposite orders — the textbook
   * deadlock. Without `lockOrder`'s sort each transaction would hold what the
   * other wants, Postgres would kill one with a 40P01, and the victim would
   * surface as a 500 that looks exactly like a lost seat from the outside.
   *
   * Repeated, because a deadlock is an interleaving and a single pass can miss
   * it. The assertion is on the *absence of 5xx* as much as on the winner
   * count.
   */
  it('does not deadlock when two claims name the same seats in opposite orders', async () => {
    const eventId = await onSaleEvent();
    const seats = await seatsOf(eventId);

    for (let attempt = 0; attempt < 20; attempt++) {
      const [a, b] = [
        seats[ROUNDS + (attempt % 4)],
        seats[ROUNDS + 4 + (attempt % 4)],
      ];

      const outcomes = await Promise.all([
        claim(
          eventId,
          [{ allocationId: a.id }, { allocationId: b.id }],
          randomUUID(),
        ),
        claim(
          eventId,
          [{ allocationId: b.id }, { allocationId: a.id }],
          randomUUID(),
        ),
      ]);

      expect(outcomes.filter((o) => o.status >= 500)).toEqual([]);
      expect(outcomes.filter((o) => o.status === 201)).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 409)).toHaveLength(1);

      // Cleared between attempts so the next pair starts from free seats.
      await dataSource.query(`DELETE FROM holds WHERE event_id = $1`, [
        eventId,
      ]);
      await dataSource.query(
        `UPDATE allocations SET held = 0 WHERE event_id = $1`,
        [eventId],
      );
    }
  }, 60_000);

  /**
   * All or nothing. A three-seat claim where one seat is gone must take none
   * of them — granting the other two would hand back a hold nobody asked for
   * and quietly remove two seats from sale.
   */
  it('takes no units at all when one seat of a multi-seat claim is gone', async () => {
    const eventId = await onSaleEvent();
    const seats = await seatsOf(eventId);
    const [first, second, third] = seats;

    await claim(eventId, [{ allocationId: second.id }], randomUUID());

    const outcome = await claim(
      eventId,
      [
        { allocationId: first.id },
        { allocationId: second.id },
        { allocationId: third.id },
      ],
      randomUUID(),
    );

    expect(outcome.status).toBe(409);
    expect(outcome.code).toBe(ERROR_CODES.ALLOCATION_UNAVAILABLE);
    expect((await allocation(first.id)).held).toBe(0);
    expect((await allocation(third.id)).held).toBe(0);
  });

  it('refuses a claim naming the same allocation twice', async () => {
    const eventId = await onSaleEvent();
    const [seat] = await seatsOf(eventId);

    const outcome = await claim(
      eventId,
      [{ allocationId: seat.id }, { allocationId: seat.id }],
      randomUUID(),
    );

    // A 400, not a 409: repeating a line is the caller's mistake, and no
    // amount of retrying the same body will make it work.
    expect(outcome.status).toBe(400);
    expect((await allocation(seat.id)).held).toBe(0);
  });

  /* ------------------------------------------------------------------ *
   * The invariant, asked of the whole table
   * ------------------------------------------------------------------ */

  it('never leaves held + reserved above capacity, whatever happened', async () => {
    const eventId = await onSaleEvent();
    const seats = await seatsOf(eventId);
    const counter = await dataSource
      .getRepository(AllocationEntity)
      .findOneByOrFail({ eventId, kind: 'general_admission' });

    // A deliberately messy interleaving: seats and the hot counter, contended
    // and uncontended, all at once.
    await Promise.all([
      ...Array.from({ length: RACERS }, () =>
        claim(eventId, [{ allocationId: seats[0].id }], randomUUID()),
      ),
      ...Array.from({ length: RACERS }, () =>
        claim(eventId, [{ allocationId: counter.id }], randomUUID()),
      ),
      ...Array.from({ length: RACERS }, (_, index) =>
        claim(
          eventId,
          [{ allocationId: seats[1 + (index % 4)].id }],
          randomUUID(),
        ),
      ),
    ]);

    const violations = await dataSource.query(
      `SELECT id, held, reserved, capacity
         FROM allocations
        WHERE event_id = $1 AND held + reserved > capacity`,
      [eventId],
    );

    expect(violations).toEqual([]);

    // And the holds recorded match the units taken, row for row — an oversell
    // is not the only way to be wrong.
    const [{ held_total, line_total }] = await dataSource.query(
      `SELECT
         (SELECT COALESCE(SUM(held), 0) FROM allocations WHERE event_id = $1)
           AS held_total,
         (SELECT COALESCE(SUM(line.quantity), 0)
            FROM hold_lines line
            JOIN holds hold ON hold.id = line.hold_id
           WHERE hold.event_id = $1) AS line_total`,
      [eventId],
    );

    expect(Number(held_total)).toBe(Number(line_total));
  }, 60_000);

  /* ------------------------------------------------------------------ *
   * Availability — how a client learns an allocation id at all
   * ------------------------------------------------------------------ */

  it('lists availability and stops listing a seat once it is held', async () => {
    const eventId = await onSaleEvent();
    const [seat] = await seatsOf(eventId);

    const before = await request(server())
      .get(`/api/v1/events/${eventId}/availability`)
      .query({ onlyAvailable: 'true', pageSize: 48 })
      .expect(200);

    expect(before.body.items.some((item: any) => item.id === seat.id)).toBe(
      true,
    );
    expect(before.body.meta.total).toBe(SEAT_COUNT + 1);

    await claim(eventId, [{ allocationId: seat.id }], randomUUID());

    const after = await request(server())
      .get(`/api/v1/events/${eventId}/availability`)
      .query({ onlyAvailable: 'true', pageSize: 48 })
      .expect(200);

    expect(after.body.meta.total).toBe(SEAT_COUNT);
    expect(after.body.items.some((item: any) => item.id === seat.id)).toBe(
      false,
    );
  });

  it('still lists a held seat when not filtering, with zero available', async () => {
    const eventId = await onSaleEvent();
    const [seat] = await seatsOf(eventId);

    await claim(eventId, [{ allocationId: seat.id }], randomUUID());

    const response = await request(server())
      .get(`/api/v1/events/${eventId}/availability`)
      .query({ pageSize: 48 })
      .expect(200);

    const listed = response.body.items.find((item: any) => item.id === seat.id);

    expect(listed).toMatchObject({ capacity: 1, available: 0 });
  });
});
