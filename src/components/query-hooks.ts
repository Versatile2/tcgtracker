'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CreateRoundInput, UpdateRoundInput } from '@/lib/validation/round';
import type { CreateTournamentInput, UpdateTournamentInput } from '@/lib/validation/tournament';

const keys = {
  tournaments: ['tournaments'] as const,
  tournament: (id: string) => ['tournament', id] as const,
  leaders: ['leaders'] as const,
  sets: ['sets'] as const,
  stats: ['stats'] as const,
  matchups: (leaderId: string) => ['matchups', leaderId] as const,
  achievements: ['achievements'] as const,
};

export const useTournaments = () => useQuery({ queryKey: keys.tournaments, queryFn: apiClient.listTournaments });
export const useTournament = (id: string) => useQuery({ queryKey: keys.tournament(id), queryFn: () => apiClient.getTournament(id) });
export const useLeaders = () => useQuery({ queryKey: keys.leaders, queryFn: apiClient.listLeaders });
export const useSets = () => useQuery({ queryKey: keys.sets, queryFn: apiClient.listSets });

export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateTournamentInput) => apiClient.createTournament(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tournaments }),
  });
}
export function useUpdateTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateTournamentInput) => apiClient.updateTournament(id, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(id) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useDeleteTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteTournament(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tournaments }),
  });
}
export function useFinishTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.finishTournament(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(id) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useReopenTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.reopenTournament(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(id) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useAddRound(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateRoundInput) => apiClient.addRound(tournamentId, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(tournamentId) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useUpdateRound(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRoundInput }) => apiClient.updateRound(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(tournamentId) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useDeleteRound(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteRound(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(tournamentId) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useAddCustomLeader() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: apiClient.addLeader, onSuccess: () => qc.invalidateQueries({ queryKey: keys.leaders }) });
}
export function useAddCustomSet() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: apiClient.addSet, onSuccess: () => qc.invalidateQueries({ queryKey: keys.sets }) });
}

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: apiClient.getStats });
export const useMatchups = (leaderId: string | null) =>
  useQuery({
    queryKey: keys.matchups(leaderId ?? ''),
    queryFn: () => apiClient.getMatchups(leaderId as string),
    enabled: !!leaderId,
  });
export const useAchievements = () => useQuery({ queryKey: keys.achievements, queryFn: apiClient.getAchievements });
