import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds, leaders } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

export type AchievementProgress = { current: number; target: number };
export type Achievement = {
  key: string; name: string; description: string;
  unlocked: boolean; progress: AchievementProgress | null;
};

type Result = 'win' | 'loss' | 'draw';
export type Ctx = {
  totalTournaments: number; totalRounds: number;
  wins: number; losses: number; draws: number; winRate: number;
  hasPerfectRun: boolean; maxLeaderTournaments: number; hasMetaDominator: boolean;
  secondWins: number; colorsBeaten: number; maxWinStreak: number; distinctMetas: number;
};

const COLORS = ['red', 'green', 'blue', 'purple', 'black', 'yellow'];

function count(current: number, target: number) {
  return { unlocked: current >= target, progress: { current: Math.min(current, target), target } };
}
function bool(b: boolean) {
  return { unlocked: b, progress: null as AchievementProgress | null };
}

type Def = { key: string; name: string; description: string; evaluate: (c: Ctx) => { unlocked: boolean; progress: AchievementProgress | null } };

export const ACHIEVEMENTS: Def[] = [
  { key: 'first_blood', name: 'First Blood', description: 'Log your first tournament.', evaluate: (c) => count(c.totalTournaments, 1) },
  { key: 'regular', name: 'Regular', description: 'Log 10 tournaments.', evaluate: (c) => count(c.totalTournaments, 10) },
  { key: 'veteran', name: 'Veteran', description: 'Log 25 tournaments.', evaluate: (c) => count(c.totalTournaments, 25) },
  { key: 'century', name: 'Century', description: 'Play 100 rounds.', evaluate: (c) => count(c.totalRounds, 100) },
  { key: 'perfect_run', name: 'Perfect Run', description: 'Finish a tournament with an all-win record (3+ rounds).', evaluate: (c) => bool(c.hasPerfectRun) },
  { key: 'consistent', name: 'Consistent Winner', description: 'Reach a 70% win rate over at least 20 games.', evaluate: (c) => c.totalRounds < 20
    ? { unlocked: false, progress: { current: c.totalRounds, target: 20 } }
    : { unlocked: c.winRate >= 0.7, progress: null } },
  { key: 'deck_master', name: 'Deck Master', description: 'Play 10 tournaments with a single leader.', evaluate: (c) => count(c.maxLeaderTournaments, 10) },
  { key: 'set_dominator', name: 'Meta Dominator', description: 'Reach a 75% win rate in one meta (10+ games).', evaluate: (c) => bool(c.hasMetaDominator) },
  { key: 'underdog', name: 'Underdog', description: 'Win 10 rounds going second.', evaluate: (c) => count(c.secondWins, 10) },
  { key: 'rainbow', name: 'Rainbow Crusher', description: 'Beat opponents of all 6 colors.', evaluate: (c) => count(c.colorsBeaten, 6) },
  { key: 'on_fire', name: 'On Fire', description: 'Win 3 tournaments in a row.', evaluate: (c) => count(c.maxWinStreak, 3) },
  { key: 'well_traveled', name: 'Well Traveled', description: 'Play in 5 different metas.', evaluate: (c) => count(c.distinctMetas, 5) },
];

type RoundRow = { tournamentId: string; metaId: string | null; myLeaderId: string; result: Result; playOrder: 'first' | 'second' | null; opponentColors: string[] };
type TourneyRow = { id: string; metaId: string | null; playedOn: string; createdAt: Date };

export function computeCtx(roundRows: RoundRow[], tourneyRows: TourneyRow[]): Ctx {
  let wins = 0, losses = 0, draws = 0, secondWins = 0;
  const perTournament = new Map<string, { wins: number; losses: number; draws: number; count: number }>();
  const perLeaderTournaments = new Map<string, Set<string>>();
  const perMeta = new Map<string, { wins: number; games: number }>();
  const colorsBeaten = new Set<string>();
  const distinctMetas = new Set<string>();

  for (const r of roundRows) {
    if (r.result === 'win') wins++; else if (r.result === 'loss') losses++; else draws++;
    if (r.playOrder === 'second' && r.result === 'win') secondWins++;

    const pt = perTournament.get(r.tournamentId) ?? { wins: 0, losses: 0, draws: 0, count: 0 };
    pt.count++;
    if (r.result === 'win') pt.wins++; else if (r.result === 'loss') pt.losses++; else pt.draws++;
    perTournament.set(r.tournamentId, pt);

    const ls = perLeaderTournaments.get(r.myLeaderId) ?? new Set<string>();
    ls.add(r.tournamentId);
    perLeaderTournaments.set(r.myLeaderId, ls);

    if (r.metaId) {
      distinctMetas.add(r.metaId);
      const pm = perMeta.get(r.metaId) ?? { wins: 0, games: 0 };
      pm.games++;
      if (r.result === 'win') pm.wins++;
      perMeta.set(r.metaId, pm);
    }

    if (r.result === 'win') for (const c of r.opponentColors) if (COLORS.includes(c)) colorsBeaten.add(c);
  }

  const totalRounds = wins + losses + draws;
  const winRate = totalRounds > 0 ? wins / totalRounds : 0;
  const hasPerfectRun = [...perTournament.values()].some((t) => t.count >= 3 && t.losses === 0 && t.draws === 0);
  const maxLeaderTournaments = Math.max(0, ...[...perLeaderTournaments.values()].map((s) => s.size));
  const hasMetaDominator = [...perMeta.values()].some((s) => s.games >= 10 && s.wins / s.games >= 0.75);

  const ordered = [...tourneyRows].sort((a, b) =>
    a.playedOn < b.playedOn ? -1 : a.playedOn > b.playedOn ? 1 : a.createdAt.getTime() - b.createdAt.getTime()
  );
  let maxWinStreak = 0, cur = 0;
  for (const t of ordered) {
    const pt = perTournament.get(t.id);
    if (pt && pt.wins > pt.losses) { cur++; maxWinStreak = Math.max(maxWinStreak, cur); } else cur = 0;
  }

  return {
    totalTournaments: tourneyRows.length, totalRounds,
    wins, losses, draws, winRate,
    hasPerfectRun, maxLeaderTournaments, hasMetaDominator,
    secondWins, colorsBeaten: colorsBeaten.size, maxWinStreak, distinctMetas: distinctMetas.size,
  };
}

export async function getAchievements(db: DB, ownerId: string): Promise<Achievement[]> {
  const roundRows = await db
    .select({
      tournamentId: rounds.tournamentId,
      metaId: tournaments.metaId,
      myLeaderId: tournaments.myLeaderId,
      result: rounds.result,
      playOrder: rounds.playOrder,
      opponentColors: leaders.colors,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.opponentLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId));

  const tourneyRows = await db
    .select({ id: tournaments.id, metaId: tournaments.metaId, playedOn: tournaments.playedOn, createdAt: tournaments.createdAt })
    .from(tournaments)
    .where(eq(tournaments.ownerId, ownerId));

  const ctx = computeCtx(roundRows as RoundRow[], tourneyRows as TourneyRow[]);
  return ACHIEVEMENTS.map((d) => {
    const r = d.evaluate(ctx);
    return { key: d.key, name: d.name, description: d.description, unlocked: r.unlocked, progress: r.progress };
  });
}
