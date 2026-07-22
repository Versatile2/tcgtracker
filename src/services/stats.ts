import { and, eq, desc, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds, leaders, metas } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

const num = (v: unknown): number => Number(v ?? 0);
const rate = (wins: number, total: number): number => (total > 0 ? wins / total : 0);

export type OverallStats = {
  totalTournaments: number;
  wins: number; losses: number; draws: number;
  winRate: number; drawRate: number;
  bestMeta: { metaId: string | null; name: string; winRate: number; games: number } | null;
  mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null;
};
export type PerMetaStat = {
  metaId: string | null; name: string;
  tournaments: number; wins: number; losses: number; draws: number; winRate: number;
};

// Shared per-meta aggregation used by both getPerMetaStats and getOverallStats (bestMeta).
async function aggregateByMeta(db: DB, ownerId: string) {
  const rows = await db
    .select({
      metaId: tournaments.metaId,
      metaName: metas.name,
      tournaments: sql<number>`count(distinct ${tournaments.id})`,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .leftJoin(metas, eq(tournaments.metaId, metas.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(tournaments.metaId, metas.name);
  return rows.map((r) => {
    const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
    return {
      metaId: r.metaId ?? null,
      name: r.metaName ?? 'No meta',
      tournaments: num(r.tournaments),
      wins, losses, draws,
      games: wins + losses + draws,
      winRate: rate(wins, wins + losses + draws),
    };
  });
}

export async function getPerMetaStats(db: DB, ownerId: string): Promise<PerMetaStat[]> {
  const rows = await aggregateByMeta(db, ownerId);
  return rows
    .map(({ metaId, name, tournaments, wins, losses, draws, winRate }) => ({ metaId, name, tournaments, wins, losses, draws, winRate }))
    .sort((a, b) => b.winRate - a.winRate || a.name.localeCompare(b.name));
}

export async function getPlayedLeaders(db: DB, ownerId: string): Promise<{ id: string; name: string }[]> {
  return db
    .selectDistinct({ id: leaders.id, name: leaders.name })
    .from(tournaments)
    .innerJoin(rounds, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(tournaments.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .orderBy(leaders.name);
}

export async function getOverallStats(db: DB, ownerId: string): Promise<OverallStats> {
  const byMeta = await aggregateByMeta(db, ownerId);
  const wins = byMeta.reduce((s, r) => s + r.wins, 0);
  const losses = byMeta.reduce((s, r) => s + r.losses, 0);
  const draws = byMeta.reduce((s, r) => s + r.draws, 0);
  const total = wins + losses + draws;

  const [{ count: totalTournaments }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tournaments)
    .where(eq(tournaments.ownerId, ownerId));

  // best meta: highest win rate among metas with at least one game
  const withGames = byMeta.filter((r) => r.games > 0);
  withGames.sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name));
  const best = withGames[0];
  const bestMeta = best ? { metaId: best.metaId, name: best.name, winRate: best.winRate, games: best.games } : null;

  const [mp] = await db
    .select({
      leaderId: tournaments.myLeaderId,
      name: leaders.name,
      tournaments: sql<number>`count(*)`,
    })
    .from(tournaments)
    .innerJoin(leaders, eq(tournaments.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(tournaments.myLeaderId, leaders.name)
    .orderBy(desc(sql`count(*)`), leaders.name)
    .limit(1);
  const mostPlayedLeader = mp ? { leaderId: mp.leaderId, name: mp.name, tournaments: num(mp.tournaments) } : null;

  return {
    totalTournaments: num(totalTournaments),
    wins, losses, draws,
    winRate: rate(wins, total),
    drawRate: rate(draws, total),
    bestMeta,
    mostPlayedLeader,
  };
}

export type OpponentMetaStat = {
  metaId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
};
export type OpponentLeaderStat = {
  leaderId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
  byMeta: OpponentMetaStat[];
};

export async function getOpponentStats(db: DB, ownerId: string): Promise<OpponentLeaderStat[]> {
  // Overall per opponent leader (all rounds)
  const leaderRows = await db
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
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(rounds.opponentLeaderId, leaders.name);

  // Per opponent leader x meta (only rounds with an opponent meta set)
  const metaRows = await db
    .select({
      leaderId: rounds.opponentLeaderId,
      metaId: rounds.opponentMetaId,
      metaName: metas.name,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(metas, eq(rounds.opponentMetaId, metas.id))
    .where(and(eq(tournaments.ownerId, ownerId), sql`${rounds.opponentMetaId} is not null`))
    .groupBy(rounds.opponentLeaderId, rounds.opponentMetaId, metas.name);

  const byLeaderMeta = new Map<string, OpponentMetaStat[]>();
  for (const r of metaRows) {
    if (!r.metaId) continue;
    const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
    const list = byLeaderMeta.get(r.leaderId) ?? [];
    list.push({
      metaId: r.metaId, name: r.metaName ?? '—',
      wins, losses, draws, games: wins + losses + draws, winRate: rate(wins, wins + losses + draws),
    });
    byLeaderMeta.set(r.leaderId, list);
  }

  return leaderRows
    .map((r) => {
      const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
      const games = wins + losses + draws;
      const byMeta = (byLeaderMeta.get(r.leaderId) ?? []).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
      return { leaderId: r.leaderId, name: r.name, wins, losses, draws, games, winRate: rate(wins, games), byMeta };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
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
    .where(and(eq(tournaments.ownerId, ownerId), eq(tournaments.myLeaderId, leaderId)))
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
    .where(and(eq(tournaments.ownerId, ownerId), eq(tournaments.myLeaderId, leaderId), sql`${rounds.playOrder} is not null`))
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
    WHERE t.owner_id = ${ownerId} AND t.my_leader_id = ${leaderId}
    GROUP BY color
  `);
  const colorBreakdown = (colorResult.rows as { color: string; wins: unknown; losses: unknown; draws: unknown }[])
    .map((r) => ({ color: r.color, ...counts(num(r.wins), num(r.losses), num(r.draws)) }))
    .sort((a, b) => b.games - a.games || a.color.localeCompare(b.color));

  return { opponents, turnOrder, colorBreakdown };
}
