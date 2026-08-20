'use client';
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { keys } from '@/lib/query-keys';
import { roundFieldsFromInput } from '@/lib/round-values';
import * as cache from '@/lib/outbox/optimistic';
import { useOutbox } from '@/lib/outbox/use-outbox';
import type { RoundDTO, TournamentDetailDTO } from '@/lib/dto';
import type { CreateRoundInput, UpdateRoundInput } from '@/lib/validation/round';
import type { CreateTournamentInput, UpdateTournamentInput, ConvertTournamentInput } from '@/lib/validation/tournament';

export const useTournaments = () => useQuery({ queryKey: keys.tournaments, queryFn: apiClient.listTournaments });
export const useTournament = (id: string) => useQuery({ queryKey: keys.tournament(id), queryFn: () => apiClient.getTournament(id) });
export const useLeaders = () => useQuery({ queryKey: keys.leaders, queryFn: apiClient.listLeaders });
export const useMetas = () => useQuery({ queryKey: keys.metas, queryFn: apiClient.listMetas });

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: apiClient.getStats });
export const useMatchups = (leaderId: string | null) =>
  useQuery({
    queryKey: keys.matchups(leaderId ?? ''),
    queryFn: () => apiClient.getMatchups(leaderId as string),
    enabled: !!leaderId,
  });
export const useAchievements = () => useQuery({ queryKey: keys.achievements, queryFn: apiClient.getAchievements });

/*
 * Writes go through the outbox — always, not only when offline. A single path
 * means the offline code runs on every write instead of rotting until the one
 * day it is needed, and logging never waits on a round trip.
 */

export function useTournamentWrites() {
  const qc = useQueryClient();
  const { push } = useOutbox();

  /** Returns the new tournament's id, which the client picks so it is known at once. */
  const create = useCallback(
    (input: CreateTournamentInput): string => {
      const id = input.id ?? crypto.randomUUID();
      const detail: TournamentDetailDTO = {
        id,
        type: input.type,
        // Freeplay omits myLeaderId entirely (the schema rejects it being
        // present); every other type requires it. The DTO models the
        // freeplay case as `null`.
        myLeaderId: input.myLeaderId ?? null,
        metaId: input.metaId ?? null,
        name: input.name ?? null,
        notes: input.notes ?? null,
        placement: input.placement ?? null,
        fieldSize: input.fieldSize ?? null,
        playedOn: input.playedOn,
        status: 'draft',
        matches: [],
        // No rounds yet, so no decks played yet either.
        deckCount: 0,
        rounds: [],
      };
      cache.addTournament(qc, detail);
      push({ kind: 'tournament.create', tournamentId: id, payload: { ...input, id } });
      return id;
    },
    [qc, push]
  );

  const update = useCallback(
    (id: string, patch: UpdateTournamentInput) => {
      cache.patchTournament(qc, id, patch as Partial<TournamentDetailDTO>);
      push({ kind: 'tournament.update', tournamentId: id, payload: patch });
    },
    [qc, push]
  );

  const remove = useCallback(
    (id: string) => {
      cache.dropTournament(qc, id);
      push({ kind: 'tournament.delete', tournamentId: id });
    },
    [qc, push]
  );

  const setStatus = useCallback(
    (id: string, status: 'draft' | 'locked') => {
      cache.patchTournament(qc, id, { status });
      push({ kind: status === 'locked' ? 'tournament.finish' : 'tournament.reopen', tournamentId: id });
    },
    [qc, push]
  );

  const convert = useCallback(
    (id: string, payload: ConvertTournamentInput) => {
      // The card must change segment on the tap, not on the flush — leader and
      // all, on both the tournament row and its cached rounds, mirroring the
      // server exactly. See `convertTournament`'s own comment for why leaving
      // the rounds behind is not an option.
      cache.convertTournament(qc, id, payload);
      push({ kind: 'tournament.convert', tournamentId: id, payload });
    },
    [qc, push]
  );

  return useMemo(
    () => ({
      create,
      update,
      remove,
      finish: (id: string) => setStatus(id, 'locked'),
      reopen: (id: string) => setStatus(id, 'draft'),
      convert,
    }),
    [create, update, remove, setStatus, convert]
  );
}

export function useRoundWrites(tournamentId: string) {
  const qc = useQueryClient();
  const { push } = useOutbox();

  /** Returns the new round's id. */
  const add = useCallback(
    (input: CreateRoundInput): string => {
      const id = input.id ?? crypto.randomUUID();
      const round: RoundDTO = {
        id,
        tournamentId,
        roundNumber: cache.nextRoundNumber(qc, tournamentId),
        ...roundFieldsFromInput(input),
      };
      cache.addRound(qc, tournamentId, round);
      push({ kind: 'round.create', tournamentId, roundId: id, payload: { ...input, id } });
      return id;
    },
    [qc, push, tournamentId]
  );

  const update = useCallback(
    (roundId: string, input: UpdateRoundInput) => {
      cache.patchRound(qc, tournamentId, roundId, roundFieldsFromInput(input));
      push({ kind: 'round.update', tournamentId, roundId, payload: input });
    },
    [qc, push, tournamentId]
  );

  const remove = useCallback(
    (roundId: string) => {
      cache.dropRound(qc, tournamentId, roundId);
      push({ kind: 'round.delete', tournamentId, roundId });
    },
    [qc, push, tournamentId]
  );

  return useMemo(() => ({ add, update, remove }), [add, update, remove]);
}

