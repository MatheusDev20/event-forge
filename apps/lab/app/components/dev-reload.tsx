'use client';

import { useEffect } from 'react';

/*
 * Polls the revision written by `scripts/watch-articles.mjs` and reloads when
 * it moves, so editing a write-up shows up without a manual refresh. Rendered
 * only in development — see app/layout.tsx.
 */
const POLL_MS = 700;

export function DevReload() {
  useEffect(() => {
    let current: string | null = null;

    const check = async () => {
      let next: string;
      try {
        const response = await fetch('/dev-revision.txt', { cache: 'no-store' });
        if (!response.ok) return;
        next = await response.text();
      } catch {
        // The dev server is restarting; try again on the next tick.
        return;
      }

      if (current === null) current = next;
      else if (next !== current) window.location.reload();
    };

    void check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return null;
}
