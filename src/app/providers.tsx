'use client';
import { useState } from 'react';
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

  if (!persister) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: WEEK }}>
      {children}
    </PersistQueryClientProvider>
  );
}
