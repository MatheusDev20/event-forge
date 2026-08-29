import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../../../../config/env';
import type { AcceptedHeroImage } from '../../../domain/hero-image';
import { HeroImageStorage } from '../../hero-image.storage';

/**
 * Hero image bytes in an S3 bucket. Selected by `S3_UPLOAD=true`.
 *
 * The same port as `LocalHeroImageStorage`, and deliberately the same shape of
 * implementation: a key built from the event id and a UUID, a URL handed back
 * for the column, and a delete that first proves the URL is one of ours. What
 * differs is only where the bytes go — which is the whole point of there being
 * a port at all.
 *
 * Credentials are not read here. The SDK's default provider chain finds them
 * from the environment, the shared config file, or an instance/task role, and
 * a role is the right answer anywhere this runs for real.
 */
@Injectable()
export class S3HeroImageStorage extends HeroImageStorage {
  private readonly logger = new Logger(S3HeroImageStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    super();

    /**
     * `getOrThrow` for what must be there, `get` for what may not.
     *
     * The distinction is not stylistic: `getOrThrow` throws on a key that is
     * merely absent, so reaching for it on an optional setting turns "nothing
     * fronts this bucket" into a boot failure.
     */
    const required = <K extends keyof Env>(key: K): NonNullable<Env[K]> =>
      config.getOrThrow(key, { infer: true });
    const optional = <K extends keyof Env>(key: K): Env[K] =>
      config.get(key, { infer: true });

    // env.ts refuses to boot with S3_UPLOAD on and either of these missing, so
    // by the time this runs they are facts rather than hopes.
    const region = required('S3_REGION');
    this.bucket = required('S3_BUCKET');

    const endpoint = optional('S3_ENDPOINT');

    // Normalised to no leading or trailing slash, so key building is a plain
    // join and never produces the empty path segment that an `s3://bucket//x`
    // key turns into.
    this.keyPrefix = required('S3_KEY_PREFIX').replace(/^\/+|\/+$/g, '');

    this.client = new S3Client({
      region,
      ...(endpoint
        ? // MinIO and LocalStack serve one host for every bucket, so the
          // virtual-hosted `bucket.host` form the SDK prefers does not resolve.
          { endpoint, forcePathStyle: true }
        : {}),
    });

    this.baseUrl = (
      optional('S3_PUBLIC_BASE_URL') ?? this.defaultBaseUrl(region, endpoint)
    ).replace(/\/+$/, '');
  }

  /**
   * Uploads the image and returns the URL it is readable at.
   *
   * `ContentType` is set from the format the *domain* identified in the bytes,
   * never from the header the client sent. S3 serves this value straight back
   * to browsers, so echoing a client's claim would let a caller choose the
   * Content-Type of a file on an origin of ours — which is how a stored upload
   * becomes stored script.
   *
   * `ContentDisposition: inline` pairs with it: these are page backgrounds, and
   * a bucket that hands them over as downloads renders nothing.
   */
  override async put(
    eventId: string,
    image: AcceptedHeroImage,
  ): Promise<string> {
    const key = `${this.keyPrefix}/${eventId}-${randomUUID()}${image.extension}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: image.bytes,
        ContentType: image.format.contentType,
        ContentDisposition: 'inline',
        // Every key contains a UUID and is written once, so a cached copy can
        // never be stale — a replacement always lands at a different key.
        CacheControl: 'public, max-age=2592000, immutable',
      }),
    );

    return `${this.baseUrl}/${key}`;
  }

  /**
   * Deletes an object this storage wrote, if the URL names one.
   *
   * `ownedKey` is what keeps the port's second promise. A local URL from before
   * the switch, or an artwork link someone set by hand, is not ours to delete
   * and is left alone — and because the check is a prefix match against the
   * base URL this instance built, a `hero_image_url` crafted to point at some
   * other object cannot steer this call either.
   */
  override async discard(url: string): Promise<void> {
    const key = this.ownedKey(url);

    if (!key) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // Best-effort by contract: the row already points at the replacement, so
      // an orphaned object is waste and a thrown error would be a false
      // failure. A lifecycle rule on the bucket is the durable cleanup.
      this.logger.warn(`Could not remove replaced hero image ${key}`);
    }
  }

  /**
   * The object key inside our own prefix, or null if the URL is not one `put`
   * produced.
   *
   * Parsed as a URL rather than string-matched so a same-prefix hostname
   * cannot pass, and the decoded remainder is rejected if it climbs: `put`
   * only ever emits `<prefix>/<uuid-name>`, so anything with a further slash
   * or a `..` in it did not come from here.
   */
  private ownedKey(url: string): string | null {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const ours = `${this.baseUrl}/${this.keyPrefix}/`;
    const normalized = `${parsed.origin}${parsed.pathname}`;

    if (!normalized.startsWith(ours)) return null;

    const name = decodeURIComponent(normalized.slice(ours.length));

    if (name.length === 0 || name.includes('/') || name.includes('..')) {
      return null;
    }

    return `${this.keyPrefix}/${name}`;
  }

  /**
   * Where the bucket serves its own objects, when nothing fronts it.
   *
   * Only correct for a bucket whose objects are publicly readable — which is a
   * decision about the bucket, not about this app. Anything else (CloudFront, a
   * custom domain) is what `S3_PUBLIC_BASE_URL` exists to name.
   */
  private defaultBaseUrl(region: string, endpoint: string | undefined): string {
    // Path-style, matching `forcePathStyle` above: with a custom endpoint the
    // bucket is a path segment, not a subdomain.
    if (endpoint) return `${endpoint.replace(/\/+$/, '')}/${this.bucket}`;

    return `https://${this.bucket}.s3.${region}.amazonaws.com`;
  }
}
