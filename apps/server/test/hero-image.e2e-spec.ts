import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EventEntity } from '../src/modules/catalog/infrastructure/entities/event.entity';
import { OrganizerEntity } from '../src/modules/catalog/infrastructure/entities/organizer.entity';
import { VenueEntity } from '../src/modules/catalog/infrastructure/entities/venue.entity';
import { HttpExceptionFilter } from '../src/shared/http/http-exception.filter';
import { UPLOADS_ROUTE_PREFIX } from '../src/shared/http/static-assets';

/**
 * The upload endpoint, end to end — including the part unit tests cannot
 * reach: that an accepted image is actually written, actually served back at
 * the URL the column now holds, and actually removed when replaced.
 *
 * The format rules themselves are exhausted in `domain/hero-image.spec.ts`
 * without a server. What is retested here is only that they are wired in: one
 * honest mistake (a `.gif`) and one dishonest one (a renamed executable), to
 * prove both the extension check and the byte check sit on the request path.
 */
const PREFIX = 'e2e-hero-image';

/**
 * The two upload settings, read from where `test/setup-env.ts` put them rather
 * than restated here. A copy would silently stop describing the app the moment
 * either file changed — and these assertions are only meaningful if they are
 * about the directory the server actually writes to.
 */
const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR!);
const BASE_URL = process.env.PUBLIC_BASE_URL!;

/** Minimal but genuine leading bytes; nothing here decodes them as pixels. */
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('JFIF payload'),
]);

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR payload'),
]);

/** A DOS/PE header — `MZ` and the two bytes that follow it in a real binary. */
const EXECUTABLE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

describe('POST /api/v1/events/:id/hero-image (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organizerId: string;
  let venueId: string;

  const createEvent = async (heroImageUrl: string | null = null) =>
    (
      await dataSource.getRepository(EventEntity).save({
        slug: `${PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: `${PREFIX} show`,
        description: 'Artwork pending.',
        category: 'music' as const,
        status: 'published' as const,
        startsAt: new Date('2099-03-01T21:00:00.000Z'),
        endsAt: null,
        doorsOpenAt: null,
        heroImageUrl,
        venueId,
        organizerId,
        seatMapId: null,
      })
    ).id;

  const upload = (id: string) =>
    request(app.getHttpServer()).post(`/api/v1/events/${id}/hero-image`);

  /** The on-disk path a returned URL points at. */
  const storedPath = (url: string): string =>
    resolve(
      UPLOADS_DIR,
      new URL(url).pathname.slice(`${UPLOADS_ROUTE_PREFIX}/`.length),
    );

  beforeAll(async () => {
    // `express.static` wants the directory to exist at mount time; the storage
    // itself creates it lazily on first write.
    await mkdir(UPLOADS_DIR, { recursive: true });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const nestApp =
      moduleFixture.createNestApplication<NestExpressApplication>();
    nestApp.setGlobalPrefix('api/v1', { exclude: ['health'] });
    nestApp.useGlobalFilters(new HttpExceptionFilter());
    // Mirrors main.ts. Without it the stored URL would be untestable here — and
    // that assertion is the one proving an upload is reachable, not merely
    // recorded.
    nestApp.useStaticAssets(UPLOADS_DIR, {
      prefix: `${UPLOADS_ROUTE_PREFIX}/`,
      fallthrough: false,
      index: false,
    });
    await nestApp.init();
    app = nestApp;

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
    await dataSource.getRepository(VenueEntity).delete({ id: venueId });
    await dataSource.getRepository(OrganizerEntity).delete({ id: organizerId });
    await app.close();
    await rm(UPLOADS_DIR, { recursive: true, force: true });
  });

  /* ------------------------------------------------------------------ *
   * Accepted
   * ------------------------------------------------------------------ */

  it.each([
    ['JPEG', 'hero.jpg', 'image/jpeg', JPEG, '.jpg'],
    ['PNG', 'hero.png', 'image/png', PNG, '.png'],
    // Same format, other spelling. The stored name normalises to .jpg.
    ['JPEG named .jpeg', 'hero.jpeg', 'image/jpeg', JPEG, '.jpg'],
  ])(
    'stores a %s and points the event at it',
    async (_label, filename, contentType, bytes, extension) => {
      const id = await createEvent();

      const response = await upload(id)
        .attach('file', bytes, { filename, contentType })
        .expect(200);

      expect(response.body.id).toBe(id);
      expect(response.body.heroImageUrl).toMatch(
        new RegExp(
          `^${BASE_URL}${UPLOADS_ROUTE_PREFIX}/hero-images/${id}-[0-9a-f-]{36}\\${extension}$`,
        ),
      );

      // The column is what the next read serves, so assert on the row and not
      // only on the response body.
      const stored = await dataSource
        .getRepository(EventEntity)
        .findOneByOrFail({ id });
      expect(stored.heroImageUrl).toBe(response.body.heroImageUrl);
    },
  );

  it('serves the stored image back at the URL it returned', async () => {
    const id = await createEvent();

    const { body } = await upload(id)
      .attach('file', PNG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(200);

    const served = await request(app.getHttpServer())
      .get(new URL(body.heroImageUrl).pathname)
      // Without this superagent decides what to do with image/png by guessing,
      // and the assertion ends up comparing an empty object to a Buffer.
      .responseType('blob')
      .expect(200)
      .expect('Content-Type', /image\/png/);

    expect(served.body).toEqual(PNG);
  });

  it('never reuses a URL, so a replacement cannot be served from cache', async () => {
    const id = await createEvent();

    const first = await upload(id)
      .attach('file', PNG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(200);

    const second = await upload(id)
      .attach('file', JPEG, { filename: 'hero.jpg', contentType: 'image/jpeg' })
      .expect(200);

    expect(second.body.heroImageUrl).not.toBe(first.body.heroImageUrl);
  });

  it('deletes the file it replaced rather than leaving it on disk', async () => {
    const id = await createEvent();

    const first = await upload(id)
      .attach('file', PNG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(200);
    const replaced = storedPath(first.body.heroImageUrl);
    expect(existsSync(replaced)).toBe(true);

    const second = await upload(id)
      .attach('file', JPEG, { filename: 'hero.jpg', contentType: 'image/jpeg' })
      .expect(200);

    expect(existsSync(replaced)).toBe(false);
    expect(existsSync(storedPath(second.body.heroImageUrl))).toBe(true);
  });

  it('leaves a hero image it did not write alone when replacing it', async () => {
    const foreign = 'https://cdn.example.com/artwork/poster.png';
    const id = await createEvent(foreign);

    // What this pins down is that a URL from another origin is recognised as
    // not ours: the alternative implementation treats its path as local and
    // either fails the request or, worse, finds something to delete.
    const response = await upload(id)
      .attach('file', PNG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(200);

    expect(response.body.heroImageUrl).not.toBe(foreign);
  });

  it('shows the new artwork on the public detail endpoint', async () => {
    const id = await createEvent();

    const uploaded = await upload(id)
      .attach('file', JPEG, { filename: 'hero.jpg', contentType: 'image/jpeg' })
      .expect(200);

    const { slug } = await dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/events/${slug}`)
      .expect(200);

    expect(detail.body.heroImageUrl).toBe(uploaded.body.heroImageUrl);
  });

  /* ------------------------------------------------------------------ *
   * Refused — jpg and png only
   * ------------------------------------------------------------------ */

  it.each([
    ['hero.gif', 'image/gif'],
    ['hero.webp', 'image/webp'],
    ['hero.svg', 'image/svg+xml'],
    ['hero.pdf', 'application/pdf'],
    ['hero.exe', 'application/octet-stream'],
  ])('refuses %s outright', async (filename, contentType) => {
    const id = await createEvent();

    const response = await upload(id)
      .attach('file', PNG, { filename, contentType })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a file with no extension', async () => {
    const id = await createEvent();

    await upload(id)
      .attach('file', PNG, { filename: 'hero', contentType: 'image/png' })
      .expect(400);
  });

  /**
   * The whole reason the bytes are read. Both client-written claims say PNG and
   * both are wrong; an endpoint trusting the filename or the Content-Type would
   * have stored an executable at a URL it then serves.
   */
  it('refuses an executable renamed .png and announced as image/png', async () => {
    const id = await createEvent();

    const response = await upload(id)
      .attach('file', EXECUTABLE, {
        filename: 'payload.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(response.body.message).toMatch(/not a JPEG or a PNG/i);
  });

  it('refuses an SVG renamed .png, script and all', async () => {
    const id = await createEvent();

    await upload(id)
      .attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'hero.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('refuses JPEG bytes sent as a .png', async () => {
    const id = await createEvent();

    const response = await upload(id)
      .attach('file', JPEG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(400);

    expect(response.body.message).toMatch(/renaming a file/i);
  });

  it('writes nothing for a refused upload', async () => {
    const id = await createEvent();

    await upload(id)
      .attach('file', PNG, { filename: 'hero.gif', contentType: 'image/gif' })
      .expect(400);

    const stored = await dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id });
    expect(stored.heroImageUrl).toBeNull();
  });

  it('refuses an empty file', async () => {
    const id = await createEvent();

    await upload(id)
      .attach('file', Buffer.alloc(0), {
        filename: 'hero.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('refuses a file over the size limit with 413, not a truncated success', async () => {
    const id = await createEvent();
    const oversized = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);

    const response = await upload(id)
      .attach('file', oversized, {
        filename: 'hero.png',
        contentType: 'image/png',
      })
      .expect(413);

    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  /* ------------------------------------------------------------------ *
   * Malformed requests
   * ------------------------------------------------------------------ */

  it('refuses a multipart request carrying no file', async () => {
    const id = await createEvent();

    const response = await upload(id).field('title', 'not a file').expect(400);

    expect(response.body.message).toMatch(/"file" field/);
  });

  it('refuses a file sent under the wrong field name', async () => {
    const id = await createEvent();

    await upload(id)
      .attach('image', PNG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(400);
  });

  it('404s for an event that does not exist', async () => {
    await upload('00000000-0000-4000-8000-000000000000')
      .attach('file', PNG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(404);
  });

  it('400s for an id that is not a uuid', async () => {
    await upload('not-a-uuid')
      .attach('file', PNG, { filename: 'hero.png', contentType: 'image/png' })
      .expect(400);
  });
});
