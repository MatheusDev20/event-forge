/**
 * The hero image upload — `POST /events/:id/hero-image`.
 *
 * Nothing here is a Zod schema, because nothing here crosses the wire as JSON:
 * the request is `multipart/form-data` and the response is an `EventDetail`
 * the caller already has a schema for. What a contract still owes both sides
 * is the *agreement* — which field carries the file, which formats are
 * accepted, how big a file may be — so a file input's `accept` attribute and
 * the server's validation cannot drift apart.
 *
 * The server treats every value here as a floor, not as the check itself: a
 * filename and a Content-Type are both written by the client, so the bytes get
 * inspected too. See the server's `domain/hero-image.ts`.
 */

/** The multipart field the file must arrive in. */
export const HERO_IMAGE_FIELD = 'file';

/**
 * JPEG and PNG only.
 *
 * Both halves are listed because a browser sends both and they can disagree —
 * `photo.png` announced as `image/jpeg` is a client bug worth a 400, not
 * something to silently pick a winner for.
 */
export const HERO_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;

/** Lowercase, with the dot. `.jpeg` and `.jpg` are the same format. */
export const HERO_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;

/** 5 MiB. Hero art is a wide banner, not a print master. */
export const HERO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Ready for `<input type="file" accept={HERO_IMAGE_ACCEPT} />`. */
export const HERO_IMAGE_ACCEPT = [
  ...HERO_IMAGE_CONTENT_TYPES,
  ...HERO_IMAGE_EXTENSIONS,
].join(',');

export type HeroImageContentType = (typeof HERO_IMAGE_CONTENT_TYPES)[number];
export type HeroImageExtension = (typeof HERO_IMAGE_EXTENSIONS)[number];
