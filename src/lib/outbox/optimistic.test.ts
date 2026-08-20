import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { addTournament, addRound, promotedLeaderId, convertTournament } from './optimistic';
import { keys } from '@/lib/query-keys';
import type { TournamentDetailDTO, RoundDTO, TournamentSummaryDTO } from '@/lib/dto';

const T = '11111111-1111-4111-8111-111111111111';
const ZORO = '55555555-5555-4555-8555-555555555555';
const NAMI = '66666666-6666-4666-8666-666666666666';
const roundId = (n: number) => `3333333${n}-3333-4333-8333-333333333333`;

const freeplayDetail: TournamentDetailDTO = {
  id: T,
  type: 'freeplay',
  myLeaderId: null,
  metaId: null,
  name: null,
  notes: null,
  placement: null,
  fieldSize: null,
  playedOn: '2026-08-14',
  status: 'draft',
  matches: [],
  deckCount: 0,
  rounds: [],
};

const localDetail: TournamentDetailDTO = {
  id: T,
  type: 'local',
  myLeaderId: ZORO,
  metaId: null,
  name: null,
  notes: null,
  placement: null,
  fieldSize: null,
  playedOn: '2026-08-14',
  status: 'draft',
  matches: [],
  deckCount: 0,
  rounds: [],
};

const swissRound = (n: number, myLeaderId: string): RoundDTO => ({
  id: roundId(n),
  tournamentId: T,
  roundNumber: n,
  kind: 'swiss',
  opponentLeaderId: NAMI,
  opponentMetaId: null,
  myLeaderId,
  result: 'win',
  playOrder: null,
  wonDieRoll: null,
  games: null,
  notes: null,
});

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('optimistic cache deck count', () => {
  it('recomputes deckCount as offline rounds are added, in both the list and detail caches', () => {
    addTournament(qc, freeplayDetail);
    addRound(qc, T, swissRound(1, ZORO));
    addRound(qc, T, swissRound(2, NAMI));
    // A repeat deck does not double-count.
    addRound(qc, T, swissRound(3, ZORO));

    const list = qc.getQueryData<TournamentSummaryDTO[]>(keys.tournaments);
    expect(list?.find((t) => t.id === T)?.deckCount).toBe(2);

    const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(T));
    expect(detail?.deckCount).toBe(2);
  });
});

describe('promotedLeaderId', () => {
  // Mirrors convertTournamentType's promotion rule exactly, so a divergence
  // between the two implementations fails here rather than showing up as a
  // leader that silently changes on the card once the flush lands.

  it('promotes the leader from round data when the payload carries none', () => {
    addTournament(qc, freeplayDetail);
    addRound(qc, T, swissRound(1, ZORO));
    expect(promotedLeaderId(qc, T, null)).toBe(ZORO);
  });

  it('falls back to the offered leader when no round carries one', () => {
    addTournament(qc, freeplayDetail);
    // A bye/no-show-only session, or one with no rounds logged yet — nothing
    // for the server to promote from either, so it uses what was offered.
    addRound(qc, T, { ...swissRound(1, ZORO), myLeaderId: null });
    expect(promotedLeaderId(qc, T, ZORO)).toBe(ZORO);
  });

  it('ignores byes and no-shows as leader sources', () => {
    addTournament(qc, freeplayDetail);
    // Byes/no-shows never actually carry a leader in real data (see the
    // RoundDTO comment), but the promotion rule filters by round *kind*, not
    // by whether myLeaderId happens to be set. Force one to carry a leader
    // anyway so the kind filter itself is what's under test, not the data.
    addRound(qc, T, { ...swissRound(1, ZORO), kind: 'bye' });
    expect(promotedLeaderId(qc, T, null)).toBeNull();
  });

  it('returns null when there is nothing to promote and nothing offered', () => {
    addTournament(qc, freeplayDetail);
    expect(promotedLeaderId(qc, T, null)).toBeNull();
  });

  it('falls back to the offered leader when the detail is not cached at all', () => {
    // Converting from a list card whose tournament was never opened — there is
    // no round data available to read, same as the server has nothing to read
    // when it has no cached detail to fall back to either.
    expect(promotedLeaderId(qc, T, ZORO)).toBe(ZORO);
  });
});

describe('convertTournament', () => {
  // Mirrors convertTournamentType's two branches on the cached rounds, not
  // just the tournament row — otherwise deckCount (recomputed from rounds by
  // putDetail) goes stale the moment a conversion happens optimistically.

  it('classic to session: pushes the leader down onto the games and clears the tournament row', () => {
    addTournament(qc, localDetail);
    addRound(qc, T, { ...swissRound(1, ZORO), myLeaderId: null });
    addRound(qc, T, { ...swissRound(2, ZORO), myLeaderId: null });

    convertTournament(qc, T, { type: 'freeplay_gauntlet' });

    const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(T));
    expect(detail?.type).toBe('freeplay_gauntlet');
    expect(detail?.myLeaderId).toBeNull();
    expect(detail?.rounds.every((r) => r.myLeaderId === ZORO)).toBe(true);
    // The rounds now carry the leader, so the deck count is not 0.
    expect(detail?.deckCount).toBe(1);

    const list = qc.getQueryData<TournamentSummaryDTO[]>(keys.tournaments);
    expect(list?.find((t) => t.id === T)?.deckCount).toBe(1);
  });

  it('classic to session: leaves byes and no-shows without a leader', () => {
    addTournament(qc, localDetail);
    addRound(qc, T, { ...swissRound(1, ZORO), myLeaderId: null, kind: 'bye' });

    convertTournament(qc, T, { type: 'freeplay_gauntlet' });

    const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(T));
    expect(detail?.rounds[0].myLeaderId).toBeNull();
  });

  it('session to classic: promotes the round leader onto the tournament row and clears the games', () => {
    addTournament(qc, freeplayDetail);
    addRound(qc, T, swissRound(1, ZORO));
    addRound(qc, T, swissRound(2, ZORO));

    convertTournament(qc, T, { type: 'local' });

    const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(T));
    expect(detail?.type).toBe('local');
    expect(detail?.myLeaderId).toBe(ZORO);
    expect(detail?.rounds.every((r) => r.myLeaderId === null)).toBe(true);
    // A classic type's deck count is always 0 — the leader lives on the row.
    expect(detail?.deckCount).toBe(0);
  });

  it('session to classic: falls back to the offered leader when no round has one to promote', () => {
    addTournament(qc, freeplayDetail);
    addRound(qc, T, { ...swissRound(1, ZORO), kind: 'bye' });

    convertTournament(qc, T, { type: 'local', myLeaderId: NAMI });

    const detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(T));
    expect(detail?.myLeaderId).toBe(NAMI);
  });

  it('round-trips: converting back offers the same leader instead of a stale deckCount of 0', () => {
    // The exact regression this fixes: without moving the rounds, converting
    // classic -> session left the cached rounds without the leader, so
    // deckCount read 0 and the reverse conversion looked like it needed a
    // leader picked from scratch (convert-sheet.tsx gates on deckCount === 0).
    addTournament(qc, localDetail);
    addRound(qc, T, { ...swissRound(1, ZORO), myLeaderId: null });

    convertTournament(qc, T, { type: 'freeplay_gauntlet' });
    let detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(T));
    expect(detail?.deckCount).toBe(1);

    convertTournament(qc, T, { type: 'local' });
    detail = qc.getQueryData<TournamentDetailDTO>(keys.tournament(T));
    expect(detail?.myLeaderId).toBe(ZORO);
  });

  it('falls back to a row-only patch when the detail is not cached', () => {
    // Converting from a list card whose tournament was never opened — there is
    // no round data to move, same fallback promotedLeaderId documents. Seed
    // the summary list directly, the way the list query would have populated
    // it, without ever caching the detail.
    const { rounds: _rounds, ...summary } = localDetail;
    void _rounds;
    qc.setQueryData<TournamentSummaryDTO[]>(keys.tournaments, [{ ...summary, record: { wins: 0, losses: 0, draws: 0 } }]);

    convertTournament(qc, T, { type: 'freeplay_gauntlet' });

    const list = qc.getQueryData<TournamentSummaryDTO[]>(keys.tournaments);
    expect(list?.find((t) => t.id === T)?.type).toBe('freeplay_gauntlet');
    expect(list?.find((t) => t.id === T)?.myLeaderId).toBeNull();
  });
});
