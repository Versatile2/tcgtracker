'use client';
import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const WEEK = 1000 * 60 * 60 * 24 * 7;

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: WEEK, retry: 1 } },
  }));
  const [persister] = useState(() =>
    typeof window !== 'undefined'
      ? createSyncStoragePersister({ storage: window.localStorage, key: 'crewstat-query-cache' })
      : null
  );

  const query = persister
    ? <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: WEEK }}>{children}</PersistQueryClientProvider>
    : <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {query}
    </ThemeProvider>
  );
}
