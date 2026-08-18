import { and, eq, notInArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds, leaders } from '../db/schema';
import { CASUAL_TYPES } from '../lib/tournament-kinds';
import {
  computeCtx, evaluateAchievements,
  type Achievement, type RoundRow, type TourneyRow,
} from '../lib/achievements/definitions';

type DB = NodePgDatabase<typeof schema>;

// The rules live in src/lib/achievements/definitions.ts so the client can run
// them too. All this file owns is the query that reads a player's history.
export type { Achievement, AchievementProgress, Ctx } from '../lib/achievements/definitions';
export { ACHIEVEMENTS, computeCtx } from '../lib/achievements/definitions';

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
    .where(and(eq(tournaments.ownerId, ownerId), notInArray(tournaments.type, CASUAL_TYPES)));

  const tourneyRows = await db
    .select({ id: tournaments.id, metaId: tournaments.metaId, playedOn: tournaments.playedOn, createdAt: tournaments.createdAt })
    .from(tournaments)
    .where(and(eq(tournaments.ownerId, ownerId), notInArray(tournaments.type, CASUAL_TYPES)));

  return evaluateAchievements(computeCtx(roundRows as RoundRow[], tourneyRows as TourneyRow[]));
}
