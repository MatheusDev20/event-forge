/*
 * Live reload for the write-ups.
 *
 * `lib/articles.ts` reads `articles/` with `fs` at render time, so the markdown
 * is not part of the module graph: saving a file triggers no HMR update and the
 * page only picks the edit up on a manual refresh. Touching the loader closes
 * that gap — it *is* in the graph, so Turbopack invalidates it, re-renders, and
 * the loader reads the changed markdown on the way through.
 *
 * Development only. The published site is a static build, which reads every
 * file once and never runs this.
 */
export async function register() {
  if (process.env.NODE_ENV !== 'development') return;
  // `register` also runs on the edge runtime, which has no filesystem.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { watch, utimesSync } = await import('node:fs');
  const path = await import('node:path');

  const articles = path.resolve(
    process.cwd(),
    process.env.ARTICLES_DIR ?? './articles',
  );
  const loader = path.resolve(process.cwd(), 'lib/articles.ts');

  let pending: ReturnType<typeof setTimeout> | undefined;

  try {
    watch(articles, { recursive: true }, (_event, file) => {
      if (typeof file !== 'string' || !file.endsWith('.md')) return;

      // One save fires several events; collapse the burst into one touch.
      clearTimeout(pending);
      pending = setTimeout(() => {
        const now = new Date();
        try {
          utimesSync(loader, now, now);
        } catch (error) {
          console.warn('[articles] could not touch the loader:', error);
        }
      }, 50);
    });
  } catch (error) {
    console.warn('[articles] live reload disabled:', error);
  }
}
