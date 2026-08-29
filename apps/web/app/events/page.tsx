import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EventsBrowser, EventsBrowserSkeleton } from './events-browser';

export const metadata: Metadata = {
  title: 'Browse events · Event-Forge',
  description: 'Find and book tickets for live events.',
};

/**
 * `useSearchParams` opts its subtree out of prerendering, which makes this
 * boundary load-bearing rather than ceremonial: whatever it falls back to is
 * literally the first paint of this route. Hence a skeleton and not `null`.
 */
export default function EventsPage() {
  return (
    <Suspense fallback={<EventsBrowserSkeleton />}>
      <EventsBrowser />
    </Suspense>
  );
}
