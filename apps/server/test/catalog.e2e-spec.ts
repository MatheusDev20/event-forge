import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EventEntity } from '../src/modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../src/modules/catalog/infrastructure/entities/organizer.entity';
import { PriceTierEntity } from '../src/modules/catalog/infrastructure/entities/price-tier.entity';
import { VenueEntity } from '../src/modules/catalog/infrastructure/entities/venue.entity';
import { HttpExceptionFilter } from '../src/shared/http/http-exception.filter';

/**
 * These tests insert their own fixtures under an `e2e-` slug prefix and remove
 * them afterwards, so they pass against a freshly migrated CI database and
 * against a developer's seeded one without either interfering with the other.
 */
const PREFIX = 'e2e-catalog';

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organizerId: string;
  let venueId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());

    const organizer = await dataSource
      .getRepository(OrganizerEntity)
      .save({ name: `${PREFIX} organizer` });
    organizerId = organizer.id;

    const venue = await dataSource.getRepository(VenueEntity).save({
      name: `${PREFIX} venue`,
      city: 'Testville',
      country: 'BR',
    });
    venueId = venue.id;

    const events = await dataSource.getRepository(EventEntity).save([
      {
        slug: `${PREFIX}-on-sale`,
        title: `${PREFIX} on sale`,
        description: 'Visible to the public.',
        category: 'music' as const,
        status: 'on_sale' as const,
        startsAt: new Date('2099-01-01T20:00:00.000Z'),
        endsAt: null,
        doorsOpenAt: null,
        heroImageUrl: null,
        venueId,
        organizerId,
      },
      {
        slug: `${PREFIX}-draft`,
        title: `${PREFIX} draft`,
        description: 'Must never be public.',
        category: 'music' as const,
        status: 'draft' as const,
        startsAt: new Date('2099-01-02T20:00:00.000Z'),
        endsAt: null,
        doorsOpenAt: null,
        heroImageUrl: null,
        venueId,
        organizerId,
      },
    ]);

    await dataSource.getRepository(PriceTierEntity).save([
      {
        eventId: events[0].id,
        name: 'Expensive',
        priceAmountMinor: 50000,
        priceCurrency: 'BRL' as const,
      },
      {
        eventId: events[0].id,
        name: 'Cheap',
        priceAmountMinor: 10000,
        priceCurrency: 'BRL' as const,
      },
    ]);
  });

  afterAll(async () => {
    await dataSource
      .getRepository(EventEntity)
      .createQueryBuilder()
      .delete()
      .where('slug LIKE :prefix', { prefix: `${PREFIX}%` })
      .execute();
    await dataSource.getRepository(VenueEntity).delete({ id: venueId });
    await dataSource.getRepository(OrganizerEntity).delete({ id: organizerId });
    await app.close();
  });

  describe('GET /api/v1/events', () => {
    it('returns only publicly visible events', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/events')
        .query({ q: PREFIX, pageSize: 48 })
        .expect(200);

      const slugs = response.body.items.map(
        (item: { slug: string }) => item.slug,
      );

      expect(slugs).toContain(`${PREFIX}-on-sale`);
      expect(slugs).not.toContain(`${PREFIX}-draft`);
    });

    it('reports the cheapest tier as priceFrom', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/events')
        .query({ q: PREFIX })
        .expect(200);

      expect(response.body.items[0].priceFrom).toEqual({
        amountMinor: 10000,
        currency: 'BRL',
      });
    });

    it('honours pageSize and reports pagination meta', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/events')
        .query({ pageSize: 1 })
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.meta).toMatchObject({ page: 1, pageSize: 1 });
      expect(response.body.meta.pageCount).toBe(
        Math.ceil(response.body.meta.total / 1),
      );
    });

    it('rejects an out-of-range pageSize with the contract error shape', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/events')
        .query({ pageSize: 999 })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
      });
      expect(response.body.details[0].path).toBe('pageSize');
    });
  });

  describe('GET /api/v1/events/:slug', () => {
    it('returns the detail payload with tiers cheapest first', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/events/${PREFIX}-on-sale`)
        .expect(200);

      expect(response.body.slug).toBe(`${PREFIX}-on-sale`);
      expect(response.body.description).toBe('Visible to the public.');
      expect(
        response.body.priceTiers.map((tier: { name: string }) => tier.name),
      ).toEqual(['Cheap', 'Expensive']);
    });

    it('404s for a draft event rather than revealing it exists', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/events/${PREFIX}-draft`)
        .expect(404);

      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('404s for an unknown slug', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/events/no-such-event')
        .expect(404);
    });
  });
});
