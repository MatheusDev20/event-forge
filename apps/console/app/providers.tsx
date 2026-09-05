'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Kept for the client-side data the console's first real screens will need —
 * an event list that refetches after a publish, a form that invalidates its
 * own query on success. Nothing uses it yet; the shell reads nothing.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
