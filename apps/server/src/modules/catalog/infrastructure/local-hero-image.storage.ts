import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Env } from '../../../config/env';
import { UPLOADS_ROUTE_PREFIX } from '../../../shared/http/static-assets';
import type { AcceptedHeroImage } from '../domain/hero-image';
import { HeroImageStorage } from './hero-image.storage';

/** Sub-directory under UPLOADS_DIR, and the matching URL segment. */
const HERO_IMAGES = 'hero-images';

/**
 * Hero image bytes on local disk, served back by `express.static`.
 *
 * The default, and the one ADR-0005 asks for: this project runs on one machine
 * today, needs no credentials to do it, and a fresh clone can upload an image
 * the minute Postgres is up. `S3HeroImageStorage` is the same port over a
 * bucket, for deployments where a local disk is not somewhere a file survives.
 */
@Injectable()
export class LocalHeroImageStorage extends HeroImageStorage {
  private readonly logger = new Logger(LocalHeroImageStorage.name);
  private readonly directory: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.directory = resolve(
      config.getOrThrow('UPLOADS_DIR', { infer: true }),
      HERO_IMAGES,
    );
    // Trailing slashes make `new URL(path, base)` behave differently; strip one
    // here so callers never have to think about it.
    this.baseUrl = config
      .getOrThrow('PUBLIC_BASE_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  /**
   * Writes the image and returns the URL it is now reachable at.
   *
   * The name is `<eventId>-<random><ext>`: the event id makes a stray file
   * traceable to what it belongs to, and the random half means replacing an
   * image always produces a new URL. That is not decoration — a stable URL
   * would leave every CDN and browser that cached the old artwork serving it
   * after the organizer replaced it.
   *
   * Nothing here reads or trusts the client's filename. It was used to *judge*
   * the upload in the domain layer and is discarded now, which is the only way
   * a filename cannot be a path traversal.
   */
  override async put(
    eventId: string,
    image: AcceptedHeroImage,
  ): Promise<string> {
    await mkdir(this.directory, { recursive: true });

    const filename = `${eventId}-${randomUUID()}${image.extension}`;

    // 'wx' — fail rather than overwrite. A UUID collision is not a real
    // expectation; silently clobbering someone else's image if one ever
    // happened is the part worth refusing.
    await writeFile(resolve(this.directory, filename), image.bytes, {
      flag: 'wx',
    });

    return `${this.baseUrl}${UPLOADS_ROUTE_PREFIX}/${HERO_IMAGES}/${filename}`;
  }

  /**
   * `ownedFilename` is where both of the port's obligations are met: it is what
   * keeps a URL from another origin — a hand-set CDN link, an S3 object from
   * after the switch — out of `unlink`, and with it what stops a crafted
   * `hero_image_url` becoming an arbitrary-delete primitive.
   */
  override async discard(url: string): Promise<void> {
    const filename = this.ownedFilename(url);

    if (!filename) return;

    await unlink(resolve(this.directory, filename)).catch((error: unknown) => {
      const code = (error as NodeJS.ErrnoException).code;

      // Already gone is the outcome we wanted anyway.
      if (code === 'ENOENT') return;

      this.logger.warn(`Could not remove replaced hero image ${filename}`);
    });
  }

  /**
   * The bare filename inside our own directory, or null if the URL does not
   * name a file we put there.
   *
   * Parsed as a URL rather than string-matched, and reduced to a `basename` at
   * the end, so neither `..%2f` nor a same-prefix host smuggles a path through.
   */
  private ownedFilename(url: string): string | null {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    // Exactly what `put` builds, so origin, any base path, and the mount
    // prefix are all checked in one comparison rather than three.
    const ours = `${this.baseUrl}${UPLOADS_ROUTE_PREFIX}/${HERO_IMAGES}/`;
    // `URL` has already resolved away any `..` segments; what survives into
    // `pathname` is still percent-encoded.
    const normalized = `${parsed.origin}${parsed.pathname}`;

    if (!normalized.startsWith(ours)) return null;

    const remainder = decodeURIComponent(normalized.slice(ours.length));

    // A nested path is not something `put` can produce, so it is not ours —
    // and this is the check that makes an encoded `%2f..%2f` land here rather
    // than in `unlink`.
    return remainder.length > 0 && basename(remainder) === remainder
      ? remainder
      : null;
  }
}
