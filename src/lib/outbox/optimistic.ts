import type { QueryClient } from '@tanstack/react-query';
import type { RoundDTO, TournamentDetailDTO, TournamentSummaryDTO } from '@/lib/dto';
import { keys } from '@/lib/query-keys';
import { computeRecord } from '@/lib/record';

/**
 * Apply a pending write to the query cache immediately. The cache is persisted
 * to localStorage, so this is also what makes an offline round survive the PWA
 * being backgrounded between matches.
 *
 * The server stays authoritative: everything here is recomputed from the real
 * response once the outbox drains and queries are invalidated.
 */

const summaryOf = (detail: TournamentDetailDTO): TournamentSummaryDTO => {
  const { rounds, ...rest } = detail;
  return {
    ...rest,
    record: computeRecord(rounds),
    matches: rounds.map((r) => ({ opponentLeaderId: r.opponentLeaderId, result: r.result, kind: r.kind })),
  };
};

// Matches the server's ordering: most recently played first.
const byRecency = (a: TournamentSummaryDTO, b: TournamentSummaryDTO) => b.playedOn.localeCompare(a.playedOn);

function putDetail(qc: QueryClient, detail: TournamentDetailDTO) {
  qc.setQueryData(keys.tournament(detail.id), detail);
  qc.setQueryData<TournamentSummaryDTO[]>(keys.tournaments, (list = []) =>
    [summaryOf(detail), ...list.filter((t) => t.id !== detail.id)].sort(byRecency)
  );
}

export function addTournament(qc: QueryClient, detail: TournamentDetailDTO) {
  putDetail(qc, detail);
}

export function patchTournament(qc: QueryClient, id: string, patch: Partial<TournamentDetailDTO>) {
  const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(id));
  if (detail) {
    putDetail(qc, { ...detail, ...patch });
    return;
  }
  // Editing from the list without the detail loaded — patch the summary alone.
  qc.setQueryData<TournamentSummaryDTO[]>(keys.tournaments, (list = []) =>
    list.map((t) => (t.id === id ? { ...t, ...patch } : t)).sort(byRecency)
  );
}

export function dropTournament(qc: QueryClient, id: string) {
  qc.removeQueries({ queryKey: keys.tournament(id) });
  qc.setQueryData<TournamentSummaryDTO[]>(keys.tournaments, (list = []) => list.filter((t) => t.id !== id));
}

/** Round numbers are contiguous and 1-based, both here and on the server. */
const renumber = (rounds: RoundDTO[]): RoundDTO[] =>
  rounds.map((r, i) => (r.roundNumber === i + 1 ? r : { ...r, roundNumber: i + 1 }));

function withRounds(qc: QueryClient, tournamentId: string, next: (rounds: RoundDTO[]) => RoundDTO[]) {
  const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(tournamentId));
  if (!detail) return;
  putDetail(qc, { ...detail, rounds: renumber(next(detail.rounds)) });
}

export function addRound(qc: QueryClient, tournamentId: string, round: RoundDTO) {
  withRounds(qc, tournamentId, (rounds) => [...rounds, round]);
}

export function patchRound(qc: QueryClient, tournamentId: string, roundId: string, fields: Partial<RoundDTO>) {
  withRounds(qc, tournamentId, (rounds) => rounds.map((r) => (r.id === roundId ? { ...r, ...fields } : r)));
}

export function dropRound(qc: QueryClient, tournamentId: string, roundId: string) {
  withRounds(qc, tournamentId, (rounds) => rounds.filter((r) => r.id !== roundId));
}

/** The round number a newly logged round will take. */
export function nextRoundNumber(qc: QueryClient, tournamentId: string): number {
  const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(tournamentId));
  return (detail?.rounds.length ?? 0) + 1;
}
