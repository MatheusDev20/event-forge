import type { AcceptedHeroImage } from '../domain/hero-image';

/**
 * Where hero image bytes live — the port, with two adapters behind it:
 * `LocalHeroImageStorage` and `S3HeroImageStorage`, selected at boot by
 * `S3_UPLOAD` (see catalog.module.ts).
 *
 * The interface is two methods wide, and deliberately says nothing about
 * files, buckets, keys or paths. Everything above it — the service, the
 * controller, the column — deals only in absolute URLs, which is what makes
 * the two adapters interchangeable and what lets a deployment flip the switch
 * without a migration: rows written by either backend already hold the one
 * kind of value anything downstream knows how to use.
 *
 * An abstract class rather than a TypeScript interface because Nest needs a
 * runtime value to use as an injection token, and an interface leaves nothing
 * behind after compilation.
 */
export abstract class HeroImageStorage {
  /**
   * Stores the image and returns the absolute URL it is now readable at.
   *
   * Implementations must never reuse a URL: replacing an event's artwork has
   * to produce a new one, or caches keep serving the picture that was replaced.
   */
  abstract put(eventId: string, image: AcceptedHeroImage): Promise<string>;

  /**
   * Deletes an image *this* storage wrote, if the URL names one.
   *
   * Two obligations, and both are load-bearing. It must not throw: it runs
   * after the database already points at the replacement, so the upload has
   * succeeded by any definition the caller cares about, and a leftover object
   * is waste where a failed response would be a lie. And it must ignore any
   * URL it did not write — another origin, a hand-set CDN link, the other
   * backend's output from before the switch — because a delete that trusts a
   * stored string is a delete an attacker can aim.
   */
  abstract discard(url: string): Promise<void>;
}
