import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
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
import { HttpExceptionFilter } from '../src/shared/http/http-exception.filter';

/**
 * Slice 1: publishing an event materialises its capacity, atomically.
 *
 * The snapshot rules themselves are exhausted in `domain/allocation.spec.ts`
 * without a database. What only a real Postgres can prove is the part ADR-0006
 * actually turns on — that the status change and thousands of allocation rows
 * are **one transaction**, so a layout that cannot be sold leaves the event a
 * draft rather than published-with-nothing-to-sell.
 *
 * Fixtures build one venue with two layouts: a sellable one (a seated section
 * of 6 seats plus a 500-capacity GA section), and a broken one whose only
 * section is a seated block nobody has put seats in.
 */
const PREFIX = 'e2e-snapshot';

describe('Publish → snapshot (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organizerId: string;
  let venueId: string;
  let seatMapId: string;
  let emptySeatMapId: string;
  let seatedSectionId: string;
  let gaSectionId: string;
  let emptySectionId: string;

  const SEAT_COUNT = 6;
  const GA_CAPACITY = 500;

  const draft = (overrides: Record<string, unknown> = {}) => ({
    slug: `${PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: `${PREFIX} show`,
    description: 'Capacity pending.',
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
    ...overrides,
  });

  const createDraft = async (
    overrides: Record<string, unknown> = {},
  ): Promise<string> =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .send(draft(overrides))
        .expect(201)
    ).body.id;

  const allocationsFor = (eventId: string) =>
    dataSource.getRepository(AllocationEntity).find({ where: { eventId } });

  const statusOf = async (eventId: string): Promise<string> =>
    (
      await dataSource
        .getRepository(EventEntity)
        .findOneByOrFail({ id: eventId })
    ).status;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

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

    const seatMaps = await dataSource.getRepository(SeatMapEntity).save([
      { venueId, name: `${PREFIX} main` },
      { venueId, name: `${PREFIX} unfinished` },
    ]);
    seatMapId = seatMaps[0].id;
    emptySeatMapId = seatMaps[1].id;

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
      // Seated and seatless: capacity is legally zero, and the snapshot must
      // refuse it rather than write an event with an unsellable section.
      {
        seatMapId: emptySeatMapId,
        name: 'Balcão',
        kind: 'seated' as const,
        capacity: null,
        displayOrder: 0,
      },
    ]);
    seatedSectionId = sections[0].id;
    gaSectionId = sections[1].id;
    emptySectionId = sections[2].id;

    const row = await dataSource
      .getRepository(SeatRowEntity)
      .save({ sectionId: seatedSectionId, label: 'A', displayOrder: 0 });

    await dataSource.getRepository(SeatEntity).save(
      Array.from({ length: SEAT_COUNT }, (_, index) => ({
        rowId: row.id,
        label: String(index + 1),
        displayOrder: index,
      })),
    );
  });

  afterEach(async () => {
    // Allocations first: no foreign key protects them (ADR-0001), so nothing
    // cascades and orphans would leak into the next test's counts.
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
    // Sections, rows and seats all hang off the seat map with ON DELETE
    // CASCADE, so dropping the two layouts takes the whole fixture with it.
    // Deleting seats directly would need an empty criteria — which TypeORM
    // refuses, and rightly: it would take the seeded venues' seats too.
    await dataSource
      .getRepository(SeatMapEntity)
      .delete([{ id: seatMapId }, { id: emptySeatMapId }]);
    await dataSource.getRepository(VenueEntity).delete({ id: venueId });
    await dataSource.getRepository(OrganizerEntity).delete({ id: organizerId });
    await app.close();
  });

  /* ------------------------------------------------------------------ *
   * The snapshot
   * ------------------------------------------------------------------ */

  it('materialises one row per seat and one counter per GA section', async () => {
    const id = await createDraft();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const allocations = await allocationsFor(id);
    const seated = allocations.filter((a) => a.kind === 'seated');
    const ga = allocations.filter((a) => a.kind === 'general_admission');

    expect(seated).toHaveLength(SEAT_COUNT);
    // One row, not 500. The single hot row the roadmap wants to contend on.
    expect(ga).toHaveLength(1);
    expect(ga[0].capacity).toBe(GA_CAPACITY);
  });

  it('starts every unit free', async () => {
    const id = await createDraft();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const allocations = await allocationsFor(id);

    expect(allocations.every((a) => a.held === 0 && a.reserved === 0)).toBe(
      true,
    );
    expect(allocations.every((a) => a.version === 1)).toBe(true);
  });

  it('denormalises seat identity so a ticket survives the venue changing', async () => {
    const id = await createDraft();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const seat = (await allocationsFor(id)).find((a) => a.kind === 'seated')!;

    expect(seat.sectionName).toBe('Plateia');
    expect(seat.rowLabel).toBe('A');
    expect(seat.seatLabel).toMatch(/^[1-6]$/);
    expect(seat.capacity).toBe(1);
    expect(seat.catalogSeatId).not.toBeNull();
  });

  /* ------------------------------------------------------------------ *
   * Atomicity — the reason ADR-0006 exists
   * ------------------------------------------------------------------ */

  /**
   * The load-bearing test. The layout has a seatless section, so the snapshot
   * refuses — and because it runs inside the publish transaction, the status
   * change must roll back with it.
   *
   * An implementation that emitted the event *after* committing would leave a
   * published event with zero allocations here, and nothing downstream could
   * tell that from a sold-out one.
   */
  it('leaves the event a draft when its layout cannot be sold', async () => {
    const id = await createDraft({
      seatMapId: emptySeatMapId,
      priceTiers: [
        {
          name: 'Balcão',
          price: { amountMinor: 1000, currency: 'BRL' },
          sectionIds: [emptySectionId],
        },
      ],
    });

    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(409);

    expect(await statusOf(id)).toBe('draft');
    expect(await allocationsFor(id)).toHaveLength(0);
  });

  it('refuses to snapshot the same event twice', async () => {
    const id = await createDraft();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    // The second publish is refused by the status guard before Inventory is
    // ever consulted — but the count is what proves capacity did not double.
    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(409);

    expect(await allocationsFor(id)).toHaveLength(SEAT_COUNT + 1);
  });

  /**
   * Publishing concurrently: exactly one request may do the transition, and
   * exactly one snapshot may exist afterwards. A dry run of Slice 2's shape,
   * on a row that is not yet contended.
   */
  it('snapshots once when two requests publish the same event at once', async () => {
    const id = await createDraft();

    const results = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/events/${id}/publish`),
      request(app.getHttpServer()).post(`/api/v1/events/${id}/publish`),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(await allocationsFor(id)).toHaveLength(SEAT_COUNT + 1);
  });

  /* ------------------------------------------------------------------ *
   * The invariant, enforced by Postgres
   * ------------------------------------------------------------------ */

  /**
   * `held + reserved <= capacity` is a CHECK, not a convention. This asserts
   * the database refuses an oversell directly — which is what makes Slice 2's
   * race test trustworthy: a broken locking strategy cannot quietly oversell,
   * it can only fail.
   */
  it('refuses an oversell at the database level', async () => {
    const id = await createDraft();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const seat = (await allocationsFor(id)).find((a) => a.kind === 'seated')!;

    await expect(
      dataSource
        .getRepository(AllocationEntity)
        .update({ id: seat.id }, { held: 2 }),
    ).rejects.toThrow(/allocations_no_oversell_check/);
  });

  /* ------------------------------------------------------------------ *
   * Opening the doors
   * ------------------------------------------------------------------ */

  it('moves a published event to on_sale', async () => {
    const id = await createDraft();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/on-sale`)
      .expect(200);

    expect(response.body.status).toBe('on_sale');
  });

  it('refuses to open sales on a draft', async () => {
    const id = await createDraft();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/on-sale`)
      .expect(409);

    expect(await statusOf(id)).toBe('draft');
  });

  it('opens sales exactly once under two simultaneous requests', async () => {
    const id = await createDraft();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const results = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/events/${id}/on-sale`),
      request(app.getHttpServer()).post(`/api/v1/events/${id}/on-sale`),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await statusOf(id)).toBe('on_sale');
  });
});
