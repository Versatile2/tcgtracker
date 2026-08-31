import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { seedReferenceData } from '../../db/seed';
import { FIXTURE_CATALOG } from '../../../tests/fixtures/catalog';
import { leaders } from '../../db/schema';
import { createTournament, listTournaments } from '../../services/tournaments';
import { addRound } from '../../services/rounds';
import { getAchievements } from '../../services/achievements';
import { listLeaders } from '../../services/reference';
import { evaluateAchievements } from './definitions';
import { ctxFromCache } from './from-cache';
import type { LeaderDTO, TournamentSummaryDTO } from '../dto';

/*
 * The client evaluates achievements from its cache so an unlock can fire the
 * instant a round is logged, offline. That is only safe while it reaches the
 * same answer as the server. This test plays a real history through the
 * services, then asserts both routes agree — so a change to the query, the DTO
 * or the cache builder that breaks the correspondence fails here rather than by
 * celebrating something a player has not earned.
 */

const db = getTestDb();
const USER = 'user_parity';
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).orderBy(asc(leaders.setCode)).limit(1);
  return l.id;
}

beforeEach(async () => { await resetDb(); await seedReferenceData(db, FIXTURE_CATALOG); });

/** Both routes, from the same database. */
async function bothWays() {
  const server = await getAchievements(db, USER);
  const client = evaluateAchievements(ctxFromCache(
    (await listTournaments(db, USER)) as unknown as TournamentSummaryDTO[],
    (await listLeaders(db, USER)) as unknown as LeaderDTO[],
  ));
  return { server, client };
}

describe('the client reaches the same verdict as the server', () => {
  it('on an empty history', async () => {
    const { server, client } = await bothWays();
    expect(client).toEqual(server);
  });

  it('after a tournament with wins, losses and both play orders', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-10',
    });
    const opponents: [string, 'win' | 'loss' | 'draw', 'first' | 'second'][] = [
      ['Monkey D. Luffy', 'win', 'second'],
      ['Kaido', 'win', 'first'],
      ['Nami', 'loss', 'second'],
      ['Enel', 'draw', 'first'],
    ];
    for (const [opp, result, playOrder] of opponents) {
      await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId(opp), result, playOrder });
    }
    const { server, client } = await bothWays();
    expect(client).toEqual(server);
  });

  it('with byes and no-shows in the history', async () => {
    // The server inner-joins the opponent leader, so these rounds never reach
    // the rules; the cache builder has to drop them the same way or every win
    // rate diverges.
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-11',
    });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'win', playOrder: 'first' });
    await addRound(db, USER, t.id, { kind: 'bye' });
    await addRound(db, USER, t.id, { kind: 'no_show' });
    const { server, client } = await bothWays();
    expect(client).toEqual(server);
  });

  it('ignoring casual games, which are not part of the record', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-12',
    });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'win', playOrder: 'first' });

    const m = await createTournament(db, USER, {
      type: 'match', myLeaderId: await leaderId('Nami'), playedOn: '2026-08-12',
    });
    await addRound(db, USER, m.id, { kind: 'swiss', opponentLeaderId: await leaderId('Enel'), result: 'win', playOrder: 'first' });

    const { server, client } = await bothWays();
    expect(client).toEqual(server);
    expect(client.find((a) => a.key === 'first_blood')?.progress?.current).toBe(1);
  });

  it('on recorded placements, which only some events have', async () => {
    // Placement is optional, so the two builders must agree about events that
    // have one, events that have only a placement, and events that have none.
    const rows: [string, number | null, number | null][] = [
      ['2026-08-01', 1, 24],    // won it
      ['2026-08-08', 3, 12],    // podium
      ['2026-08-15', 8, 32],    // top cut
      ['2026-08-16', 8, 8],     // last of eight — not a cut
      ['2026-08-17', 2, null],  // placed, field size never learned
      ['2026-08-18', null, null],
    ];
    for (const [day, placement, fieldSize] of rows) {
      const t = await createTournament(db, USER, {
        type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: day,
        ...(placement !== null ? { placement } : {}),
        ...(fieldSize !== null ? { fieldSize } : {}),
      });
      await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'win', playOrder: 'first' });
    }
    const { server, client } = await bothWays();
    expect(client).toEqual(server);
    expect(client.find((a) => a.key === 'champion')?.unlocked).toBe(true);
    expect(client.find((a) => a.key === 'top_cut')?.unlocked).toBe(true);
    // Three podiums recorded (1st, 3rd, 2nd), five needed.
    expect(client.find((a) => a.key === 'podium')?.progress).toEqual({ current: 3, target: 5 });
  });

  it('across several events, where the tournament win streak is ordered', async () => {
    for (const [day, results] of [
      ['2026-08-01', ['win', 'win']],
      ['2026-08-08', ['loss', 'loss']],
      ['2026-08-15', ['win', 'win']],
    ] as [string, ('win' | 'loss')[]][]) {
      const t = await createTournament(db, USER, {
        type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: day,
      });
      for (const result of results) {
        await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result, playOrder: 'first' });
      }
    }
    const { server, client } = await bothWays();
    expect(client).toEqual(server);
  });
});
