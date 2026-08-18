'use client';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { keys } from '@/lib/query-keys';
import type { LeaderArtMapDTO } from '@/lib/dto';

/*
 * Which printing of each leader this player wants to look at, held once for the
 * whole tree.
 *
 * A context rather than a hook per avatar: the map is read by every LeaderAvatar
 * on screen — a stats page renders dozens — and they all want the same answer.
 * Reading it from context costs one subscription rather than dozens.
 *
 * The default is an empty map, so a LeaderAvatar rendered outside the provider
 * (a test, a share card captured in isolation) still draws base art rather than
 * throwing.
 */

type LeaderArtValue = {
  art: LeaderArtMapDTO;
  /** No-op outside the provider. */
  choose: (setCode: string, art: string) => void;
};

const LeaderArtContext = createContext<LeaderArtValue>({ art: {}, choose: () => {} });

export const useLeaderArt = () => useContext(LeaderArtContext);

export function LeaderArtProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { isSignedIn } = useAuth();

  const { data } = useQuery({
    queryKey: keys.leaderArt,
    queryFn: apiClient.getLeaderArt,
    // The endpoint is authenticated, and the provider wraps the sign-in screen
    // too; without this the signed-out pages would each fire a guaranteed 401.
    enabled: Boolean(isSignedIn),
    // Chosen art changes a handful of times ever, so re-fetching it on every
    // remount is pure noise on a venue connection.
    staleTime: 1000 * 60 * 60,
    retry: false,
  });

  const { mutate } = useMutation({
    mutationFn: apiClient.setLeaderArt,
    onMutate: async ({ setCode, art }) => {
      await qc.cancelQueries({ queryKey: keys.leaderArt });
      const previous = qc.getQueryData<LeaderArtMapDTO>(keys.leaderArt) ?? {};
      qc.setQueryData<LeaderArtMapDTO>(keys.leaderArt, { ...previous, [setCode]: art });
      return { previous };
    },
    // Unlike a round, this write is not queued for later: it takes no foreign
    // key and nothing depends on it, so the honest move offline is to put the
    // art back and say so rather than promise a sync that means nothing.
    onError: (_err, _vars, context) => {
      qc.setQueryData<LeaderArtMapDTO>(keys.leaderArt, context?.previous ?? {});
      toast.error('Couldn’t save that artwork. Check your connection.');
    },
    onSuccess: (map) => qc.setQueryData<LeaderArtMapDTO>(keys.leaderArt, map),
  });

  const choose = useCallback((setCode: string, art: string) => mutate({ setCode, art }), [mutate]);

  const value = useMemo<LeaderArtValue>(() => ({ art: data ?? {}, choose }), [data, choose]);

  return <LeaderArtContext.Provider value={value}>{children}</LeaderArtContext.Provider>;
}
