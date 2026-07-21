import type {
  LeaderDTO, SetDTO, RoundDTO, TournamentSummaryDTO, TournamentDetailDTO,
  StatsDTO, MatchupStatsDTO,
} from './dto';
import type { CreateTournamentInput, UpdateTournamentInput } from './validation/tournament';
import type { CreateRoundInput, UpdateRoundInput } from './validation/round';
import type { CustomLeaderInput, CustomSetInput } from './validation/reference';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).error ?? message; } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const apiClient = {
  listLeaders: () => request<LeaderDTO[]>('/api/leaders'),
  addLeader: (b: CustomLeaderInput) => request<LeaderDTO>('/api/leaders', { method: 'POST', body: JSON.stringify(b) }),
  listSets: () => request<SetDTO[]>('/api/sets'),
  addSet: (b: CustomSetInput) => request<SetDTO>('/api/sets', { method: 'POST', body: JSON.stringify(b) }),

  listTournaments: () => request<TournamentSummaryDTO[]>('/api/tournaments'),
  getTournament: (id: string) => request<TournamentDetailDTO>(`/api/tournaments/${id}`),
  createTournament: (b: CreateTournamentInput) => request<TournamentSummaryDTO>('/api/tournaments', { method: 'POST', body: JSON.stringify(b) }),
  updateTournament: (id: string, b: UpdateTournamentInput) => request<TournamentSummaryDTO>(`/api/tournaments/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteTournament: (id: string) => request<{ ok: true }>(`/api/tournaments/${id}`, { method: 'DELETE' }),
  finishTournament: (id: string) => request<TournamentSummaryDTO>(`/api/tournaments/${id}/finish`, { method: 'POST' }),
  reopenTournament: (id: string) => request<TournamentSummaryDTO>(`/api/tournaments/${id}/reopen`, { method: 'POST' }),

  addRound: (tid: string, b: CreateRoundInput) => request<RoundDTO>(`/api/tournaments/${tid}/rounds`, { method: 'POST', body: JSON.stringify(b) }),
  updateRound: (id: string, b: UpdateRoundInput) => request<RoundDTO>(`/api/rounds/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteRound: (id: string) => request<{ ok: true }>(`/api/rounds/${id}`, { method: 'DELETE' }),

  getStats: () => request<StatsDTO>('/api/stats'),
  getMatchups: (leaderId: string) => request<MatchupStatsDTO>(`/api/stats/matchups?leaderId=${encodeURIComponent(leaderId)}`),
};
