import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { addTournament, addRound, promotedLeaderId } from './optimistic';
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
