import type { QueryClient } from '@tanstack/react-query';
import type { RoundDTO, TournamentDetailDTO, TournamentSummaryDTO } from '@/lib/dto';
import { keys } from '@/lib/query-keys';
import { computeRecord, computeDeckCount } from '@/lib/record';
import { isSession } from '@/lib/tournament-kinds';

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
    // playOrder included deliberately: the client evaluates achievements from
    // this cache the moment a round is logged, and without it a round that has
    // not yet reached the server would be invisible to the Underdog rule.
    matches: rounds.map((r) => ({ opponentLeaderId: r.opponentLeaderId, result: r.result, kind: r.kind, playOrder: r.playOrder })),
  };
};

// Matches the server's ordering: most recently played first.
const byRecency = (a: TournamentSummaryDTO, b: TournamentSummaryDTO) => b.playedOn.localeCompare(a.playedOn);

function putDetail(qc: QueryClient, detail: TournamentDetailDTO) {
  // Recomputed fresh from `rounds`, not trusted from the caller: an offline
  // round added after creation must update the deck count immediately, in
  // both the detail and list caches, not only once the outbox drains and
  // the server's value replaces it. Uses the same helper as the server's
  // `listTournaments` so the two definitions cannot drift.
  const withDeckCount: TournamentDetailDTO = { ...detail, deckCount: computeDeckCount(detail.rounds) };
  qc.setQueryData(keys.tournament(withDeckCount.id), withDeckCount);
  qc.setQueryData<TournamentSummaryDTO[]>(keys.tournaments, (list = []) =>
    [summaryOf(withDeckCount), ...list.filter((t) => t.id !== withDeckCount.id)].sort(byRecency)
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

/**
 * Mirrors the leader-promotion half of `convertTournamentType` (converting
 * into a tournament), so the optimistic patch can show the right leader
 * immediately instead of a stale null until the refetch lands. Only reachable
 * when decks played <= 1 — the service rejects the conversion otherwise — so
 * any game round's leader is the *same* id and which one `find` picks first
 * does not matter, same as on the server.
 *
 * Without a cached detail (converting from a list card whose tournament was
 * never opened) there is no round data to read, so this falls back to the
 * offered leader exactly as the server does when it has nothing to promote
 * from.
 */
export function promotedLeaderId(qc: QueryClient, tournamentId: string, offered: string | null): string | null {
  const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(tournamentId));
  if (!detail) return offered;
  const fromRounds = detail.rounds.find((r) => (r.kind === 'swiss' || r.kind === 'top_cut') && r.myLeaderId !== null)?.myLeaderId;
  return fromRounds ?? offered;
}

/**
 * Applies a conversion to the cache the same way `convertTournamentType`
 * applies it to the row: the leader moves between the tournament and its
 * swiss/top_cut rounds, not just the tournament's own field. `putDetail`
 * recomputes `deckCount` from `detail.rounds`, so leaving the rounds behind
 * would collapse a session's deck count to 0 the moment it converts — the
 * card would then offer a leader picker on the way back even though the
 * tournament already has one, and worse, the leader the player repicks there
 * is silently overruled by the round's real leader once the flush lands.
 * Byes and no-shows are skipped, same as the server: they never carry a
 * leader on either side of the boundary.
 *
 * Without a cached detail (converting from a list card whose tournament was
 * never opened) there is no round data to move, so this degrades to the same
 * tournament-row-only patch `convert` used to do unconditionally.
 */
export function convertTournament(
  qc: QueryClient,
  tournamentId: string,
  payload: { type: TournamentDetailDTO['type']; myLeaderId?: string | null }
) {
  const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(tournamentId));
  const toSession = isSession(payload.type);

  if (!detail) {
    patchTournament(qc, tournamentId, {
      type: payload.type,
      myLeaderId: toSession ? null : (payload.myLeaderId ?? null),
    });
    return;
  }

  // Computed from the pre-conversion cache, before rounds/tournament below are
  // rewritten — same rule `promotedLeaderId` documents for the server's own
  // promotion step.
  const myLeaderId = toSession ? null : promotedLeaderId(qc, tournamentId, payload.myLeaderId ?? null);
  // Going to session pushes the tournament's own (pre-conversion) leader down
  // onto the games; coming back clears them, mirroring the two branches of
  // convertTournamentType.
  const pushedDown = detail.myLeaderId;
  const rounds = detail.rounds.map((r) =>
    r.kind === 'swiss' || r.kind === 'top_cut' ? { ...r, myLeaderId: toSession ? pushedDown : null } : r
  );

  putDetail(qc, { ...detail, type: payload.type, myLeaderId, rounds });
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
