/**
 * Where uploaded files are served from.
 *
 * Lives in shared/ rather than inside Catalog because two places have to agree
 * on it and they are not in the same module: `main.ts` mounts the directory at
 * this prefix, and Catalog's storage builds URLs that assume it did. A
 * constant is the cheapest way to keep a mount point and the URLs pointing at
 * it from drifting.
 *
 * It sits *outside* the `api/v1` prefix on purpose. These are static files, not
 * an API surface — nothing about them changes when the API version does, and a
 * stored URL should outlive the version that happened to be current when the
 * upload happened.
 */
export const UPLOADS_ROUTE_PREFIX = '/uploads';
