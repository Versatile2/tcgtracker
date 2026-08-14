export type Record = { wins: number; losses: number; draws: number };

export function computeRecord(rounds: { result: 'win' | 'loss' | 'draw' }[]): Record {
  return rounds.reduce<Record>(
    (acc, r) => {
      if (r.result === 'win') acc.wins += 1;
      else if (r.result === 'loss') acc.losses += 1;
      else acc.draws += 1;
      return acc;
    },
    { wins: 0, losses: 0, draws: 0 },
  );
}

export function formatRecord(r: Record): string {
  return r.draws > 0 ? `${r.wins}-${r.losses}-${r.draws}` : `${r.wins}-${r.losses}`;
}

/**
 * Distinct decks played across a session's rounds — the count of distinct
 * non-null round leaders. A repeat deck does not double-count. Classic
 * tournaments have no round leaders, so theirs is 0. Shared by the server
 * (`listTournaments`) and the offline optimistic cache so the two
 * definitions cannot drift.
 */
export function computeDeckCount(rounds: { myLeaderId: string | null }[]): number {
  return new Set(rounds.map((r) => r.myLeaderId).filter(Boolean)).size;
}
