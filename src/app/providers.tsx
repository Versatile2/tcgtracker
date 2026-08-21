'use client';
import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AccentProvider } from '@/components/theme/accent-provider';
import { LeaderArtProvider } from '@/components/leaders/leader-art-provider';
import { CelebrationProvider } from '@/components/celebrate/celebration-provider';

const WEEK = 1000 * 60 * 60 * 24 * 7;

// Bump when the persisted query/response shapes change so stale localStorage
// caches from an older deploy are discarded on load instead of hydrating with
// an outdated shape. 'v2' = the meta/leader rework (perSet→perMeta,
// bestSet→bestMeta, leader moved off rounds). 'v3' = migration 0012 renamed the
// stored session types off `freeplay*`; a v2 cache holds rows whose `type` no
// longer has a label, which renders a blank type badge rather than anything
// obviously broken, for the whole week the cache lives.
const CACHE_BUSTER = 'glt-v3-session-types';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: WEEK, retry: 1 } },
  }));
  // One provider on both sides. Branching the tree on `typeof window` meant the
  // server rendered QueryClientProvider and the client PersistQueryClientProvider
  // — different components in the same position, which can never hydrate cleanly
  // and made React discard the server tree on every page load. The persister
  // simply no-ops without storage, so persistence still only happens in the browser.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      key: 'crewstat-query-cache',
    }),
  );

  const query = (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: WEEK, buster: CACHE_BUSTER }}>
      {/* Inside the query provider: it reads the chosen leader art from cache.
          Celebration sits inside that in turn, because the card it turns over
          is the printing the player chose. */}
      <LeaderArtProvider>
        <CelebrationProvider>{children}</CelebrationProvider>
      </LeaderArtProvider>
    </PersistQueryClientProvider>
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AccentProvider>{query}</AccentProvider>
    </ThemeProvider>
  );
}
