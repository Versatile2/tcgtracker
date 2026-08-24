import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { seedReferenceData } from '../../db/seed';
import { leaders, metas } from '../../db/schema';
import { createTournament, listTournaments } from '../../services/tournaments';
import { addRound } from '../../services/rounds';
import { getOverallStats, getPerMetaStats } from '../../services/stats';
import { listLeaders, listMetas } from '../../services/reference';
import { statsForSegment } from './segment-stats';
import type { LeaderDTO, MetaDTO, TournamentSummaryDTO } from '../dto';

/*
 * The stats pages are computed on the client so they keep working with no
 * signal, which is only safe while they agree with the server on the numbers
 * both still produce. This plays a real history through the services and holds
 * the two to the same answer, so a change to the SQL, the DTO or the module
 * fails here rather than by quietly showing two different records on two
 * screens of the same app.
 *
 * The overlap is the competitive record — the server's `getOverallStats`
 * excludes exactly the casual types the client's `tournaments` segment excludes
 * — and the per-meta breakdown of it.
 */

const db = getTestDb();
const USER = 'user_stats_parity';
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).orderBy(asc(leaders.setCode)).limit(1);
  return l.id;
}
async function metaId(code: string) {
  const [m] = await db.select().from(metas).where(eq(metas.code, code)).limit(1);
  return m.id;
}

beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

async function bothWays() {
  const server = await getOverallStats(db, USER);
  const serverMeta = await getPerMetaStats(db, USER);
  const client = statsForSegment(
    (await listTournaments(db, USER)) as unknown as TournamentSummaryDTO[],
    (await listLeaders(db, USER)) as unknown as LeaderDTO[],
    (await listMetas(db, USER)) as unknown as MetaDTO[],
    'tournaments',
  );
  return { server, serverMeta, client };
}

describe('the client reaches the same record as the server', () => {
  it('on an empty history', async () => {
    const { server, client } = await bothWays();
    expect([client.wins, client.losses, client.draws]).toEqual([server.wins, server.losses, server.draws]);
    expect(client.winRate).toBeCloseTo(server.winRate, 10);
  });

  it('after a tournament with wins, losses and a draw', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-10', metaId: await metaId('OP01'),
    });
    for (const [opp, result] of [['Monkey D. Luffy', 'win'], ['Kaido', 'win'], ['Nami', 'loss'], ['Enel', 'draw']] as const) {
      await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId(opp), result, playOrder: 'first' });
    }
    const { server, client } = await bothWays();
    expect([client.wins, client.losses, client.draws]).toEqual([server.wins, server.losses, server.draws]);
    expect(client.winRate).toBeCloseTo(server.winRate, 10);
    expect(client.events).toBe(server.totalTournaments);
  });

  it('with byes and no-shows, which are not games on either side', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-11', metaId: await metaId('OP01'),
    });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'win', playOrder: 'first' });
    await addRound(db, USER, t.id, { kind: 'bye' });
    await addRound(db, USER, t.id, { kind: 'no_show' });
    const { server, client } = await bothWays();
    expect([client.wins, client.losses, client.draws]).toEqual([server.wins, server.losses, server.draws]);
  });

  it('excluding sessions and free play, which the record leaves out', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-12', metaId: await metaId('OP01'),
    });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'win', playOrder: 'first' });

    const s = await createTournament(db, USER, { type: 'session_locals', playedOn: '2026-08-12' });
    await addRound(db, USER, s.id, {
      kind: 'swiss', opponentLeaderId: await leaderId('Enel'), myLeaderId: await leaderId('Nami'), result: 'win', playOrder: 'first',
    });
    const m = await createTournament(db, USER, { type: 'match', myLeaderId: await leaderId('Nami'), playedOn: '2026-08-12' });
    await addRound(db, USER, m.id, { kind: 'swiss', opponentLeaderId: await leaderId('Enel'), result: 'win', playOrder: 'first' });

    const { server, client } = await bothWays();
    expect([client.wins, client.losses, client.draws]).toEqual([server.wins, server.losses, server.draws]);
    // …and the casual games are not lost, only filed elsewhere.
    const all = (await listTournaments(db, USER)) as unknown as TournamentSummaryDTO[];
    const ls = (await listLeaders(db, USER)) as unknown as LeaderDTO[];
    const ms = (await listMetas(db, USER)) as unknown as MetaDTO[];
    expect(statsForSegment(all, ls, ms, 'sessions').games).toBe(1);
    expect(statsForSegment(all, ls, ms, 'matches').games).toBe(1);
  });

  it('and the same per-meta split of that record', async () => {
    for (const [code, date] of [['OP01', '2026-08-01'], ['OP02', '2026-08-02']] as const) {
      const t = await createTournament(db, USER, {
        type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: date, metaId: await metaId(code),
      });
      await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'win', playOrder: 'first' });
    }
    const { serverMeta, client } = await bothWays();
    // The server's per-meta breakdown includes sessions; this history has none,
    // so on this fixture the two cover the same games.
    const mine = new Map(client.byMeta.map((r) => [r.label, r.wins + r.losses + r.draws]));
    for (const row of serverMeta) {
      expect([row.name, mine.get(row.name)]).toEqual([row.name, row.wins + row.losses + row.draws]);
    }
  });
});
