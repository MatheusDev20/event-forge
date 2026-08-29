import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EventEntity } from '../src/modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../src/modules/catalog/infrastructure/entities/organizer.entity';
import { SeatMapEntity } from '../src/modules/catalog/infrastructure/entities/seat-map.entity';
import { SectionEntity } from '../src/modules/catalog/infrastructure/entities/section.entity';
import { VenueEntity } from '../src/modules/catalog/infrastructure/entities/venue.entity';
import { HttpExceptionFilter } from '../src/shared/http/http-exception.filter';

/**
 * The transition. Fixtures build two layouts at one venue: a real one, and one
 * whose only section is a seated block nobody has put seats in — the shape the
 * capacity rule exists to refuse.
 */
const PREFIX = 'e2e-publish';

describe('POST /api/v1/events/:id/publish (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organizerId: string;
  let venueId: string;
  let seatMapId: string;
  let emptySeatMapId: string;
  let sectionIds: string[];
  let emptySectionId: string;

  /** A create body priced across both sections unless told otherwise. */
  const draft = (overrides: Record<string, unknown> = {}) => ({
    slug: `${PREFIX}-noite`,
    title: `${PREFIX} Noite de Estreia`,
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

  const createDraft = async (
    overrides: Record<string, unknown> = {},
  ): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(draft(overrides))
      .expect(201);

    return response.body.id;
  };

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
      { venueId, name: 'Main' },
      { venueId, name: 'Unfinished' },
    ]);
    seatMapId = seatMaps[0].id;
    emptySeatMapId = seatMaps[1].id;

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
      // Seated, and never given a row. Capacity is legally zero.
      {
        seatMapId: emptySeatMapId,
        name: 'Balcão',
        kind: 'seated' as const,
        capacity: null,
        displayOrder: 0,
      },
    ]);
    sectionIds = [sections[0].id, sections[1].id];
    emptySectionId = sections[2].id;
  });

  afterEach(async () => {
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
      .delete([{ id: seatMapId }, { id: emptySeatMapId }]);
    await dataSource.getRepository(VenueEntity).delete({ id: venueId });
    await dataSource.getRepository(OrganizerEntity).delete({ id: organizerId });
    await app.close();
  });

  it('moves a complete draft to published and returns it', async () => {
    const id = await createDraft();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    expect(response.body.id).toBe(id);
    expect(response.body.status).toBe('published');
    // Published, not on sale: holds are a second transition away.
    expect(response.body.priceTiers).toHaveLength(2);
  });

  it('makes the event visible to the public listing', async () => {
    const id = await createDraft();

    await request(app.getHttpServer())
      .get('/api/v1/events')
      .query({ q: `${PREFIX} Noite` })
      .expect(200)
      .expect((response) => expect(response.body.items).toHaveLength(0));

    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/events')
      .query({ q: `${PREFIX} Noite` })
      .expect(200);

    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([
      id,
    ]);
  });

  it('reaches the detail endpoint, which refused the same event as a draft', async () => {
    const id = await createDraft();

    await request(app.getHttpServer())
      .get(`/api/v1/events/${PREFIX}-noite`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/events/${PREFIX}-noite`)
      .expect(200);
  });

  it('refuses a second publish rather than reporting a success it did not do', async () => {
    const id = await createDraft();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(200);

    const conflict = await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(409);

    expect(conflict.body.code).toBe('CONFLICT');
    expect(conflict.body.message).toContain('published');
  });

  it('refuses a draft with a section no tier prices, naming it', async () => {
    // One tier covering one of the layout's two sections. Legal to create —
    // "at most one tier per section" is the create rule — and not publishable.
    const id = await createDraft({
      priceTiers: [
        {
          name: 'Plateia',
          price: { amountMinor: 9000, currency: 'BRL' },
          sectionIds: [sectionIds[0]],
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(409);

    expect(response.body.message).toContain('Frisas');
  });

  it('refuses a layout whose sections hold nobody', async () => {
    const id = await createDraft({
      seatMapId: emptySeatMapId,
      priceTiers: [
        {
          name: 'Único',
          price: { amountMinor: 5000, currency: 'BRL' },
          sectionIds: [emptySectionId],
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/publish`)
      .expect(409);

    expect(response.body.message).toContain('capacity');
  });

  it('404s for an id that is not an event', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events/6f1c3b7e-0000-4000-8000-000000000000/publish')
      .expect(404);
  });

  it('rejects an id that is not a uuid before it reaches the database', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/events/not-a-uuid/publish')
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
  });
});
