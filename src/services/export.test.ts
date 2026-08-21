import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { createTournament } from './tournaments';
import { addRound } from './rounds';
import { listLeaders, listMetas } from './reference';
import { exportRounds } from './export';
import { exportToCsv } from '../lib/csv';
import { leaders, rounds, tournaments } from '../db/schema';

const db = getTestDb();
const USER = 'user_export';

async function leaderId(name: string) {
  // Ordered by set code: a leader name maps to several real printings, so an
  // unordered limit(1) would pick a different row from run to run.
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).orderBy(asc(leaders.setCode)).limit(1);
  return l.id;
}

describe('export service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });
  afterAll(closeTestDb);

  it('exports nothing for a player with no tournaments', async () => {
    expect(await exportRounds(db, USER)).toEqual([]);
  });

  it('exports one row per round with tournament context and names', async () => {
    const ls = await listLeaders(db, USER);
    const ms = await listMetas(db, USER);
    const t = await createTournament(db, USER, {
      type: 'regionals', myLeaderId: ls[0].id, metaId: ms[0].id, name: 'Spring', playedOn: '2026-08-07',
    });
    await addRound(db, USER, t.id, {
      kind: 'swiss', opponentLeaderId: ls[1].id, opponentMetaId: ms[1].id,
      result: 'win', playOrder: 'first', wonDieRoll: true, notes: 'close',
    });
    await addRound(db, USER, t.id, { kind: 'bye' });

    const rows = await exportRounds(db, USER);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tournamentName: 'Spring',
      tournamentType: 'regionals',
      playedOn: '2026-08-07',
      myLeader: ls[0].name,
      tournamentMeta: ms[0].name,
      roundNumber: 1,
      opponentLeader: ls[1].name,
      opponentMeta: ms[1].name,
      result: 'win',
      wonDieRoll: true,
      notes: 'close',
    });
    // A bye has no opponent.
    expect(rows[1]).toMatchObject({ roundNumber: 2, roundKind: 'bye', opponentLeader: null });
  });

  it('keeps a tournament with no rounds', async () => {
    const ls = await listLeaders(db, USER);
    await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-08-07' });
    const rows = await exportRounds(db, USER);
    expect(rows).toHaveLength(1);
    expect(rows[0].roundNumber).toBeNull();
  });

  it('never leaks another player\'s tournaments', async () => {
    const ls = await listLeaders(db, USER);
    await createTournament(db, 'someone_else', { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-08-07' });
    expect(await exportRounds(db, USER)).toEqual([]);
  });

  it('orders newest tournament first, then by round number', async () => {
    const ls = await listLeaders(db, USER);
    const older = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-08-01' });
    const newer = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-08-07' });
    await addRound(db, USER, older.id, { kind: 'swiss', opponentLeaderId: ls[1].id, result: 'win' });
    await addRound(db, USER, newer.id, { kind: 'swiss', opponentLeaderId: ls[1].id, result: 'win' });
    await addRound(db, USER, newer.id, { kind: 'swiss', opponentLeaderId: ls[1].id, result: 'loss' });

    const rows = await exportRounds(db, USER);
    expect(rows.map((r) => [r.playedOn, r.roundNumber])).toEqual([
      ['2026-08-07', 1], ['2026-08-07', 2], ['2026-08-01', 1],
    ]);
  });

  it('serializes a top-cut game log into the csv', async () => {
    const ls = await listLeaders(db, USER);
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-08-07' });
    await addRound(db, USER, t.id, {
      kind: 'top_cut', opponentLeaderId: ls[1].id,
      games: [{ result: 'win', playOrder: 'first' }, { result: 'loss' }, { result: 'win', playOrder: 'second' }],
    });
    const csv = exportToCsv(await exportRounds(db, USER));
    expect(csv.split('\r\n')[1]).toContain('W(first);L;W(second)');
  });

  it('exports a session round with the round own leader', async () => {
    const [t] = await db.insert(tournaments).values({
      ownerId: USER, type: 'session', myLeaderId: null, metaId: null,
      playedOn: '2026-08-14', status: 'locked',
    }).returning();
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: 1,
      myLeaderId: await leaderId('Edward Newgate'),
      opponentLeaderId: await leaderId('Nami'),
      result: 'win', playOrder: null, notes: null,
    });
    const rows = await exportRounds(db, USER);
    const row = rows.find((r) => r.tournamentId === t.id);
    expect(row).toBeDefined();
    expect(row!.myLeader).toBe('Edward Newgate');
  });

  it('keeps a session with zero rounds, with an empty leader cell', async () => {
    const [t] = await db.insert(tournaments).values({
      ownerId: USER, type: 'session', myLeaderId: null, metaId: null,
      playedOn: '2026-08-14', status: 'draft',
    }).returning();
    const rows = await exportRounds(db, USER);
    const row = rows.find((r) => r.tournamentId === t.id);
    expect(row).toBeDefined();
    expect(row!.myLeader).toBeNull();
  });
});
