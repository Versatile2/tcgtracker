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
