import { asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, metas, rounds, tournaments } from '../db/schema';
import type { ExportRow } from '../lib/csv';

type DB = NodePgDatabase<typeof schema>;

// Leaders and metas are each joined twice — the player's and the opponent's —
// so both need aliases.
const myLeader = alias(leaders, 'my_leader');
const opponentLeader = alias(leaders, 'opponent_leader');
const tournamentMeta = alias(metas, 'tournament_meta');
const opponentMeta = alias(metas, 'opponent_meta');

/**
 * Every round the player has logged, with its tournament context denormalized
 * onto each row.
 *
 * Driven from `tournaments` with a left join to `rounds` so a tournament that
 * was created but never logged still appears — this is the player's data, and
 * an export that silently omits rows is worse than a sparse one.
 */
export async function exportRounds(db: DB, ownerId: string): Promise<ExportRow[]> {
  return db
    .select({
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      tournamentType: tournaments.type,
      playedOn: tournaments.playedOn,
      status: tournaments.status,
      myLeader: myLeader.name,
      tournamentMeta: tournamentMeta.name,
      roundNumber: rounds.roundNumber,
      roundKind: rounds.kind,
      opponentLeader: opponentLeader.name,
      opponentMeta: opponentMeta.name,
      result: rounds.result,
      playOrder: rounds.playOrder,
      wonDieRoll: rounds.wonDieRoll,
      games: rounds.games,
      notes: rounds.notes,
    })
    .from(tournaments)
    .leftJoin(tournamentMeta, eq(tournaments.metaId, tournamentMeta.id))
    .leftJoin(rounds, eq(rounds.tournamentId, tournaments.id))
    .leftJoin(myLeader, eq(myLeader.id, sql`coalesce(${rounds.myLeaderId}, ${tournaments.myLeaderId})`))
    .leftJoin(opponentLeader, eq(rounds.opponentLeaderId, opponentLeader.id))
    .leftJoin(opponentMeta, eq(rounds.opponentMetaId, opponentMeta.id))
    .where(eq(tournaments.ownerId, ownerId))
    .orderBy(desc(tournaments.playedOn), asc(tournaments.id), asc(rounds.roundNumber));
}
