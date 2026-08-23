'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Kept for the client-side data needs that arrive with Slice 2 (hold countdown,
 * availability polling). Slice 0's pages read their data in server components,
 * so nothing uses it yet.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
