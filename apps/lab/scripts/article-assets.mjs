/*
 * Mirrors the non-markdown files in `articles/` into `public/media/`, so an
 * image can live next to the write-up that uses it.
 *
 * Next serves static files from `public/` and nowhere else, so a co-located
 * image is invisible to the browser however the markdown spells the path. This
 * copies `articles/<path>` to `public/media/<path>`, which makes the URL a
 * mechanical translation of the file's location:
 *
 *   articles/assets/data-model.png                 -> /media/assets/data-model.png
 *   articles/event-forge/one-seat/diagram.png      -> /media/event-forge/one-seat/diagram.png
 *
 * Always reference that URL, absolute, from the markdown. A relative path
 * resolves against the *page* rather than the file, so the same image reference
 * breaks on a sub-page one segment deeper.
 *
 * Run once by `prebuild`, and on every tick by `watch-articles.mjs` in dev.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const articles = path.resolve(root, process.env.ARTICLES_DIR ?? './articles');
const media = path.resolve(root, 'public/media');

/** Every non-markdown file under `articles/`, as paths relative to it. */
export function listAssets() {
  const found = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!entry.name.endsWith('.md')) found.push(path.relative(articles, full));
    }
  };

  if (existsSync(articles)) walk(articles);
  return found.sort();
}

/**
 * Copies what changed and deletes what no longer exists, so a renamed image
 * does not leave its old URL working — which would hide a broken link until
 * the site was deployed somewhere clean.
 */
export function syncAssets() {
  const wanted = new Set(listAssets());

  for (const relative of wanted) {
    const from = path.join(articles, relative);
    const to = path.join(media, relative);

    const source = statSync(from);
    const target = existsSync(to) ? statSync(to) : null;
    if (target && target.size === source.size && target.mtimeMs >= source.mtimeMs) {
      continue;
    }

    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }

  const stale = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stale(full);
      else if (!wanted.has(path.relative(media, full))) rmSync(full);
    }
  };
  stale(media);

  return wanted.size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = syncAssets();
  console.log(`[articles] ${count} asset${count === 1 ? '' : 's'} in public/media`);
}
