/*
 * Live reload for the write-ups, in development only.
 *
 * `lib/articles.ts` reads `articles/` with `fs` at render time, so the markdown
 * is not part of the module graph: saving a file triggers no HMR update and the
 * page only picks the edit up on a manual refresh.
 *
 * Touching the loader does not help — Turbopack invalidates on content hash,
 * not on mtime — so instead this writes a revision into `public/`, which the
 * DevReload component polls and reloads on. Crude next to a real HMR patch, but
 * a prose edit wants the whole page repainted anyway.
 *
 * It polls rather than using `fs.watch`: editors save by writing a temporary
 * file and renaming it over the original, which drops an inotify watch and
 * leaves the watcher silently deaf from then on. Hashing a handful of small
 * markdown files a few times a second costs nothing and cannot miss an edit.
 *
 * It also mirrors co-located images into `public/media` on the way through —
 * see `article-assets.mjs` for why that copy has to exist at all.
 *
 * Started alongside `next dev` by the `dev` script. The published site is a
 * static build and never runs any of this.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { listAssets, syncAssets } from './article-assets.mjs';

const POLL_MS = 400;

const root = process.cwd();
const articles = path.resolve(root, process.env.ARTICLES_DIR ?? './articles');
const revision = path.resolve(root, 'public/dev-revision.txt');

/**
 * A hash of every write-up, so any edit — or a new file — moves the revision.
 * Prose is hashed by content; images by size and mtime, which says just as much
 * about whether they changed without reading megabytes several times a second.
 */
function fingerprint() {
  const hash = createHash('sha1');

  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) hash.update(full).update(readFileSync(full));
    }
  };

  if (existsSync(articles)) walk(articles);

  for (const relative of listAssets()) {
    const { size, mtimeMs } = statSync(path.join(articles, relative));
    hash.update(`${relative}:${size}:${mtimeMs}`);
  }

  return hash.digest('hex');
}

let current;

function check() {
  let next;
  try {
    syncAssets();
    next = fingerprint();
  } catch {
    // Mid-save the tree can be inconsistent; the next tick will catch it.
    return;
  }
  if (next === current) return;

  current = next;
  try {
    mkdirSync(path.dirname(revision), { recursive: true });
    writeFileSync(revision, `${next}\n`);
  } catch (error) {
    console.warn('[articles] could not write the revision:', error);
  }
}

check();
setInterval(check, POLL_MS);
console.log(`[articles] watching ${path.relative(root, articles)} for edits`);
