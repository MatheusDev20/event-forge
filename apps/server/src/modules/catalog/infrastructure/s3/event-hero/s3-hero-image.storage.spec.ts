import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../../config/env';
import type { AcceptedHeroImage } from '../../../domain/hero-image';
import { HERO_IMAGE_FORMATS } from '../../../domain/hero-image';
import { S3HeroImageStorage } from './s3-hero-image.storage';

/**
 * The S3 adapter, with the network replaced by a spy.
 *
 * What is worth testing here is not that the SDK works — it is the part this
 * file decides: which key an upload lands under, which URL goes in the column,
 * what Content-Type the object is served with, and above all which URLs
 * `discard` is willing to turn into a DeleteObject. That last one is a
 * security boundary, and it is pure string handling, so it deserves tests that
 * do not need a bucket.
 */

const sent: unknown[] = [];

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');

  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn((command: unknown) => {
        sent.push(command);
        return Promise.resolve({});
      }),
    })),
  };
});

const png = HERO_IMAGE_FORMATS.find(
  (format) => format.contentType === 'image/png',
)!;

const image: AcceptedHeroImage = {
  format: png,
  extension: '.png',
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

const EVENT_ID = '11111111-2222-4333-8444-555555555555';

/**
 * A ConfigService that behaves like the real one, which matters more than it
 * sounds: `getOrThrow` throws for a key that is merely absent, so a double
 * that returns `undefined` instead lets an adapter reach for `getOrThrow` on
 * an optional setting and pass here while failing to boot for real. It did,
 * once. Hence the throw.
 */
const storage = (overrides: Partial<Env> = {}): S3HeroImageStorage => {
  const values: Partial<Env> = {
    S3_BUCKET: 'event-forge-media',
    S3_REGION: 'us-east-1',
    S3_KEY_PREFIX: 'hero-images',
    ...overrides,
  };

  const config = {
    get: (key: keyof Env) => values[key],
    getOrThrow: (key: keyof Env) => {
      if (values[key] === undefined) {
        throw new TypeError(`Configuration key "${key}" does not exist`);
      }

      return values[key];
    },
  } as unknown as ConfigService<Env, true>;

  return new S3HeroImageStorage(config);
};

beforeEach(() => {
  sent.length = 0;
});

describe('put', () => {
  it('uploads under the configured prefix, keyed by event and a UUID', async () => {
    const url = await storage().put(EVENT_ID, image);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);

    const { input } = sent[0] as PutObjectCommand;
    expect(input.Bucket).toBe('event-forge-media');
    expect(input.Key).toMatch(
      new RegExp(`^hero-images/${EVENT_ID}-[0-9a-f-]{36}\\.png$`),
    );
    expect(url).toBe(
      `https://event-forge-media.s3.us-east-1.amazonaws.com/${input.Key}`,
    );
  });

  /**
   * The Content-Type comes from the format the domain found in the bytes, not
   * from the header the client sent. S3 serves this value back verbatim, so
   * the alternative lets a caller pick the Content-Type of a file on an origin
   * of ours.
   */
  it('serves the object as the format the bytes actually are', async () => {
    await storage().put(EVENT_ID, image);

    const { input } = sent[0] as PutObjectCommand;
    expect(input.ContentType).toBe('image/png');
    expect(input.ContentDisposition).toBe('inline');
    expect(input.CacheControl).toMatch(/immutable/);
  });

  it('never reuses a key, so a replacement cannot be served from cache', async () => {
    const s3 = storage();

    expect(await s3.put(EVENT_ID, image)).not.toBe(
      await s3.put(EVENT_ID, image),
    );
  });

  it('builds without the optional settings, which are the common case', () => {
    // The regression this pins: an adapter that reads S3_PUBLIC_BASE_URL or
    // S3_ENDPOINT with `getOrThrow` cannot boot without them, and neither is
    // required.
    expect(() => storage()).not.toThrow();
  });

  it('addresses objects through S3_PUBLIC_BASE_URL when one is set', async () => {
    const url = await storage({
      S3_PUBLIC_BASE_URL: 'https://cdn.event-forge.test/',
    }).put(EVENT_ID, image);

    expect(url).toMatch(/^https:\/\/cdn\.event-forge\.test\/hero-images\//);
  });

  it('uses path-style addressing against a custom endpoint (MinIO, LocalStack)', async () => {
    const url = await storage({
      S3_ENDPOINT: 'http://localhost:9000',
    }).put(EVENT_ID, image);

    expect(url).toMatch(
      /^http:\/\/localhost:9000\/event-forge-media\/hero-images\//,
    );
  });

  it('tolerates a key prefix written with slashes around it', async () => {
    await storage({ S3_KEY_PREFIX: '/media/heroes/' }).put(EVENT_ID, image);

    const { input } = sent[0] as PutObjectCommand;
    expect(input.Key).toMatch(/^media\/heroes\/[0-9a-f-]/);
  });
});

describe('discard', () => {
  it('deletes an object it wrote', async () => {
    const s3 = storage();
    const url = await s3.put(EVENT_ID, image);
    const { input: put } = sent[0] as PutObjectCommand;

    sent.length = 0;
    await s3.discard(url);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((sent[0] as DeleteObjectCommand).input.Key).toBe(put.Key);
  });

  /* ------------------------------------------------------------------ *
   * Everything below is one rule: a stored URL is data, and a delete that
   * trusts it is a delete someone else can aim.
   * ------------------------------------------------------------------ */

  it.each([
    ['another origin', 'https://cdn.example.com/hero-images/whatever.png'],
    [
      'a local URL from before the switch',
      'http://localhost:3001/uploads/hero-images/a.png',
    ],
    [
      'a hostname that merely starts the same',
      'https://event-forge-media.s3.us-east-1.amazonaws.com.evil.test/hero-images/a.png',
    ],
    [
      'a key outside our prefix',
      'https://event-forge-media.s3.us-east-1.amazonaws.com/backups/db.sql',
    ],
    [
      'a traversal out of the prefix',
      'https://event-forge-media.s3.us-east-1.amazonaws.com/hero-images/..%2F..%2Fbackups%2Fdb.sql',
    ],
    [
      'a nested key put never produces',
      'https://event-forge-media.s3.us-east-1.amazonaws.com/hero-images/nested/a.png',
    ],
    [
      'the prefix itself, with no object named',
      'https://event-forge-media.s3.us-east-1.amazonaws.com/hero-images/',
    ],
    ['a string that is not a URL at all', 'not a url'],
    ['an empty string', ''],
  ])('refuses to delete %s', async (_label, url) => {
    await storage().discard(url);

    expect(sent).toHaveLength(0);
  });

  it('never throws when the delete fails', async () => {
    const s3 = storage();
    const url = await s3.put(EVENT_ID, image);

    // The upload succeeded and the row already points at it; a cleanup that
    // failed is waste, not a failed request.
    const client = (s3 as unknown as { client: { send: jest.Mock } }).client;
    client.send.mockRejectedValueOnce(new Error('AccessDenied'));

    await expect(s3.discard(url)).resolves.toBeUndefined();
  });
});
