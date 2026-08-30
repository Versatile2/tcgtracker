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
  /** Leader id → the image id this player chose. */
  art: LeaderArtMapDTO;
  /** The image to draw for a leader: the player's choice, else the leader's default, else none. */
  imageIdFor: (leaderId: string | null | undefined) => string | null;
  /** No-op outside the provider. */
  choose: (leaderId: string, imageId: string) => void;
};

export const LeaderArtContext = createContext<LeaderArtValue>({
  art: {}, imageIdFor: () => null, choose: () => {},
});

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

  // react-query dedupes this against the query the pages already run under the
  // same key, so the catalog is fetched once however many providers mount.
  const { data: leaderRows } = useQuery({
    queryKey: keys.leaders,
    queryFn: apiClient.listLeaders,
    enabled: Boolean(isSignedIn),
    staleTime: 1000 * 60 * 60,
    retry: false,
  });

  const { mutate } = useMutation({
    mutationFn: apiClient.setLeaderArt,
    onMutate: async ({ leaderId, imageId }) => {
      await qc.cancelQueries({ queryKey: keys.leaderArt });
      const previous = qc.getQueryData<LeaderArtMapDTO>(keys.leaderArt) ?? {};
      qc.setQueryData<LeaderArtMapDTO>(keys.leaderArt, { ...previous, [leaderId]: imageId });
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

  const choose = useCallback((leaderId: string, imageId: string) => mutate({ leaderId, imageId }), [mutate]);

  const imageIdFor = useCallback((leaderId: string | null | undefined): string | null => {
    if (!leaderId) return null;
    const leader = leaderRows?.find((l) => l.id === leaderId);
    if (!leader) return null;
    const chosen = data?.[leaderId];
    // A choice is checked against the leader's own printings rather than
    // trusted: an image deleted in the admin page would otherwise render as a
    // 404 everywhere that leader appears.
    if (chosen && leader.images.some((i) => i.id === chosen)) return chosen;
    return leader.defaultImageId;
  }, [leaderRows, data]);

  const value = useMemo<LeaderArtValue>(
    () => ({ art: data ?? {}, imageIdFor, choose }),
    [data, imageIdFor, choose],
  );

  return <LeaderArtContext.Provider value={value}>{children}</LeaderArtContext.Provider>;
}
