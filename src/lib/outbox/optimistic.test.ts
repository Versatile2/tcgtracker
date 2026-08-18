import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { addTournament, addRound } from './optimistic';
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
