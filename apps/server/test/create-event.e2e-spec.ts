import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EventEntity } from '../src/modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../src/modules/catalog/infrastructure/entities/organizer.entity';
import { PriceTierSectionEntity } from '../src/modules/catalog/infrastructure/entities/price-tier-section.entity';
import { SeatMapEntity } from '../src/modules/catalog/infrastructure/entities/seat-map.entity';
import { SectionEntity } from '../src/modules/catalog/infrastructure/entities/section.entity';
import { VenueEntity } from '../src/modules/catalog/infrastructure/entities/venue.entity';
import { HttpExceptionFilter } from '../src/shared/http/http-exception.filter';

/**
 * The write path. Fixtures build two venues so the interesting failure — a
 * price tier pointing at a section of somebody else's layout — has something
 * real to point at.
 */
const PREFIX = 'e2e-create';

describe('POST /api/v1/events (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organizerId: string;
  let venueId: string;
  let seatMapId: string;
  let sectionIds: string[];
  let otherVenueId: string;
  let otherSeatMapId: string;
  let otherSectionId: string;

  const body = (overrides: Record<string, unknown> = {}) => ({
    slug: `${PREFIX}-noite`,
    title: 'Noite de Estreia',
    description: 'One night only.',
    category: 'theatre',
    startsAt: '2099-06-01T23:00:00.000Z',
    endsAt: '2099-06-02T02:00:00.000Z',
    venueId,
    organizerId,
    seatMapId,
    priceTiers: [
      {
        name: 'Plateia',
        price: { amountMinor: 9000, currency: 'BRL' },
        sectionIds: [sectionIds[0]],
      },
      {
        name: 'Frisa',
        price: { amountMinor: 16000, currency: 'BRL' },
        sectionIds: [sectionIds[1]],
      },
    ],
    ...overrides,
  });

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

    const venues = await dataSource.getRepository(VenueEntity).save([
      { name: `${PREFIX} venue`, city: 'Testville', country: 'BR' },
      { name: `${PREFIX} other venue`, city: 'Testville', country: 'BR' },
    ]);
    venueId = venues[0].id;
    otherVenueId = venues[1].id;

    const seatMaps = await dataSource.getRepository(SeatMapEntity).save([
      { venueId, name: 'Main' },
      { venueId: otherVenueId, name: 'Main' },
    ]);
    seatMapId = seatMaps[0].id;
    otherSeatMapId = seatMaps[1].id;

    const sections = await dataSource.getRepository(SectionEntity).save([
      {
        seatMapId,
        name: 'Plateia',
        kind: 'general_admission' as const,
        capacity: 200,
        displayOrder: 0,
      },
      {
        seatMapId,
        name: 'Frisas',
        kind: 'general_admission' as const,
        capacity: 40,
        displayOrder: 1,
      },
      {
        seatMapId: otherSeatMapId,
        name: 'Elsewhere',
        kind: 'general_admission' as const,
        capacity: 100,
        displayOrder: 0,
      },
    ]);
    sectionIds = [sections[0].id, sections[1].id];
    otherSectionId = sections[2].id;
  });

  afterEach(async () => {
    // Events cascade to their tiers and the tier-to-section mapping.
    await dataSource
      .getRepository(EventEntity)
      .createQueryBuilder()
      .delete()
      .where('slug LIKE :prefix', { prefix: `${PREFIX}%` })
      .execute();
  });

  afterAll(async () => {
    await dataSource
      .getRepository(SeatMapEntity)
      .delete([{ id: seatMapId }, { id: otherSeatMapId }]);
    await dataSource
      .getRepository(VenueEntity)
      .delete([{ id: venueId }, { id: otherVenueId }]);
    await dataSource.getRepository(OrganizerEntity).delete({ id: organizerId });
    await app.close();
  });

  it('creates the event, its tiers and the section mapping in one call', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body())
      .expect(201);

    expect(response.body.slug).toBe(`${PREFIX}-noite`);
    expect(response.body.status).toBe('draft');
    expect(
      response.body.priceTiers.map((tier: { name: string }) => tier.name),
    ).toEqual(['Plateia', 'Frisa']);
    expect(response.body.priceFrom).toEqual({
      amountMinor: 9000,
      currency: 'BRL',
    });

    const links = await dataSource
      .getRepository(PriceTierSectionEntity)
      .findBy(sectionIds.map((id) => ({ sectionId: id })));
    expect(links).toHaveLength(2);
  });

  it('creates a draft, which the public detail endpoint still refuses to show', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body())
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/events/${PREFIX}-noite`)
      .expect(404);
  });

  it('rejects a section belonging to another venue seat map', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(
        body({
          priceTiers: [
            {
              name: 'Plateia',
              price: { amountMinor: 9000, currency: 'BRL' },
              sectionIds: [otherSectionId],
            },
          ],
        }),
      )
      .expect(400);

    expect(response.body.message).toContain(otherSectionId);
  });

  it('rejects a seat map that belongs to a different venue', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body({ seatMapId: otherSeatMapId }))
      .expect(400);

    expect(response.body.message).toContain('does not belong to venue');
  });

  it('rejects one section priced by two tiers — the rule no constraint can hold', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(
        body({
          priceTiers: [
            {
              name: 'Cheap',
              price: { amountMinor: 9000, currency: 'BRL' },
              sectionIds: [sectionIds[0]],
            },
            {
              name: 'Dear',
              price: { amountMinor: 16000, currency: 'BRL' },
              sectionIds: [sectionIds[0]],
            },
          ],
        }),
      )
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details[0].message).toContain('already priced');
  });

  it('rejects an unknown organizer with a 404', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body({ organizerId: '00000000-0000-4000-8000-000000000000' }))
      .expect(404);
  });

  it('409s on a slug that is already taken', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body())
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body({ title: 'A different show' }))
      .expect(409);

    expect(response.body.code).toBe('CONFLICT');
  });

  it('rejects an end before the start', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body({ endsAt: '2099-05-01T00:00:00.000Z' }))
      .expect(400);

    expect(response.body.details[0].path).toBe('endsAt');
  });
});
