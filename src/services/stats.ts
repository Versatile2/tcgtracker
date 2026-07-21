import { and, eq, desc, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds, leaders, sets } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

const num = (v: unknown): number => Number(v ?? 0);
const rate = (wins: number, total: number): number => (total > 0 ? wins / total : 0);

export type OverallStats = {
  totalTournaments: number;
  wins: number; losses: number; draws: number;
  winRate: number; drawRate: number;
  bestSet: { setId: string | null; name: string; winRate: number; games: number } | null;
  mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null;
};
export type PerSetStat = {
  setId: string | null; name: string;
  tournaments: number; wins: number; losses: number; draws: number; winRate: number;
};

// Shared per-set aggregation used by both getPerSetStats and getOverallStats (bestSet).
async function aggregateBySet(db: DB, ownerId: string) {
  const rows = await db
    .select({
      setId: tournaments.setId,
      setName: sets.name,
      tournaments: sql<number>`count(distinct ${tournaments.id})`,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .leftJoin(sets, eq(tournaments.setId, sets.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(tournaments.setId, sets.name);
  return rows.map((r) => {
    const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
    return {
      setId: r.setId ?? null,
      name: r.setName ?? 'No set',
      tournaments: num(r.tournaments),
      wins, losses, draws,
      games: wins + losses + draws,
      winRate: rate(wins, wins + losses + draws),
    };
  });
}

export async function getPerSetStats(db: DB, ownerId: string): Promise<PerSetStat[]> {
  const rows = await aggregateBySet(db, ownerId);
  return rows
    .map(({ setId, name, tournaments, wins, losses, draws, winRate }) => ({ setId, name, tournaments, wins, losses, draws, winRate }))
    .sort((a, b) => b.winRate - a.winRate || a.name.localeCompare(b.name));
}

export async function getPlayedLeaders(db: DB, ownerId: string): Promise<{ id: string; name: string }[]> {
  return db
    .selectDistinct({ id: leaders.id, name: leaders.name })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .orderBy(leaders.name);
}

export async function getOverallStats(db: DB, ownerId: string): Promise<OverallStats> {
  const bySet = await aggregateBySet(db, ownerId);
  const wins = bySet.reduce((s, r) => s + r.wins, 0);
  const losses = bySet.reduce((s, r) => s + r.losses, 0);
  const draws = bySet.reduce((s, r) => s + r.draws, 0);
  const total = wins + losses + draws;

  const [{ count: totalTournaments }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tournaments)
    .where(eq(tournaments.ownerId, ownerId));

  // best set: highest win rate among sets with at least one game
  const withGames = bySet.filter((r) => r.games > 0);
  withGames.sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name));
  const best = withGames[0];
  const bestSet = best ? { setId: best.setId, name: best.name, winRate: best.winRate, games: best.games } : null;

  const [mp] = await db
    .select({
      leaderId: rounds.myLeaderId,
      name: leaders.name,
      tournaments: sql<number>`count(distinct ${rounds.tournamentId})`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(rounds.myLeaderId, leaders.name)
    .orderBy(desc(sql`count(distinct ${rounds.tournamentId})`), leaders.name)
    .limit(1);
  const mostPlayedLeader = mp ? { leaderId: mp.leaderId, name: mp.name, tournaments: num(mp.tournaments) } : null;

  return {
    totalTournaments: num(totalTournaments),
    wins, losses, draws,
    winRate: rate(wins, total),
    drawRate: rate(draws, total),
    bestSet,
    mostPlayedLeader,
  };
}

export type ResultCounts = { wins: number; losses: number; draws: number; games: number; winRate: number };
export type MatchupStats = {
  opponents: (ResultCounts & { leaderId: string; name: string; verdict: 'favored' | 'even' | 'unfavored' })[];
  turnOrder: { first: ResultCounts; second: ResultCounts };
  colorBreakdown: (ResultCounts & { color: string })[];
};

function counts(wins: number, losses: number, draws: number): ResultCounts {
  const games = wins + losses + draws;
  return { wins, losses, draws, games, winRate: rate(wins, games) };
}
function verdictOf(winRate: number): 'favored' | 'even' | 'unfavored' {
  if (winRate >= 0.55) return 'favored';
  if (winRate <= 0.45) return 'unfavored';
  return 'even';
}

export async function getMatchupStats(db: DB, ownerId: string, leaderId: string): Promise<MatchupStats> {
  // Opponents
  const oppRows = await db
    .select({
      leaderId: rounds.opponentLeaderId,
      name: leaders.name,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.opponentLeaderId, leaders.id))
    .where(and(eq(tournaments.ownerId, ownerId), eq(rounds.myLeaderId, leaderId)))
    .groupBy(rounds.opponentLeaderId, leaders.name);
  const opponents = oppRows
    .map((r) => {
      const c = counts(num(r.wins), num(r.losses), num(r.draws));
      return { leaderId: r.leaderId, name: r.name, ...c, verdict: verdictOf(c.winRate) };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

  // Turn order (exclude null play_order)
  const toRows = await db
    .select({
      playOrder: rounds.playOrder,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .where(and(eq(tournaments.ownerId, ownerId), eq(rounds.myLeaderId, leaderId), sql`${rounds.playOrder} is not null`))
    .groupBy(rounds.playOrder);
  const toFor = (po: 'first' | 'second') => {
    const r = toRows.find((x) => x.playOrder === po);
    return r ? counts(num(r.wins), num(r.losses), num(r.draws)) : counts(0, 0, 0);
  };
  const turnOrder = { first: toFor('first'), second: toFor('second') };

  // Color breakdown (unnest opponent colors; empty array => 'colorless')
  const colorResult = await db.execute(sql`
    SELECT color,
      count(*) filter (where r.result = 'win')  as wins,
      count(*) filter (where r.result = 'loss') as losses,
      count(*) filter (where r.result = 'draw') as draws
    FROM rounds r
    JOIN tournaments t ON r.tournament_id = t.id
    JOIN leaders opp ON r.opponent_leader_id = opp.id
    LEFT JOIN LATERAL unnest(
      CASE WHEN cardinality(opp.colors) = 0 THEN ARRAY['colorless'] ELSE opp.colors END
    ) AS color ON true
    WHERE t.owner_id = ${ownerId} AND r.my_leader_id = ${leaderId}
    GROUP BY color
  `);
  const colorBreakdown = (colorResult.rows as { color: string; wins: unknown; losses: unknown; draws: unknown }[])
    .map((r) => ({ color: r.color, ...counts(num(r.wins), num(r.losses), num(r.draws)) }))
    .sort((a, b) => b.games - a.games || a.color.localeCompare(b.color));

  return { opponents, turnOrder, colorBreakdown };
}
