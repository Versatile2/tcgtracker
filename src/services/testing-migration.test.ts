import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, tournaments, rounds } from '../db/schema';

const db = getTestDb();
const USER = 'user_migration';

/*
 * The migration is exercised against data shaped the way the old code wrote it:
 * a Testing tournament holding one leader for the whole event, and rounds
 * holding none. Reading the shipped .sql rather than restating it keeps this
 * test honest — an edit to the migration that breaks the reshape fails here.
 */
async function runMigration() {
  const sql = readFileSync('./drizzle/0011_testing_to_freeplay.sql', 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) await db.execute(trimmed);
  }
}

describe('testing tournaments become sessions', () => {
  beforeEach(async () => {
    await resetDb();
    await seedReferenceData(db);
  });
  afterAll(closeTestDb);

  it('carries the session leader down onto the rounds and clears it', async () => {
    const [myLeader, opponent] = await db.select().from(leaders).orderBy(asc(leaders.setCode)).limit(2);
    const tournamentId = randomUUID();
    await db.insert(tournaments).values({
      id: tournamentId, ownerId: USER, type: 'testing',
      myLeaderId: myLeader.id, playedOn: '2026-08-01',
    });
    await db.insert(rounds).values([
      { tournamentId, roundNumber: 1, kind: 'swiss', opponentLeaderId: opponent.id, result: 'win' },
      { tournamentId, roundNumber: 2, kind: 'bye', result: 'win' },
    ]);

    await runMigration();

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    expect(t.myLeaderId).toBeNull();

    const rows = await db.select().from(rounds)
      .where(eq(rounds.tournamentId, tournamentId)).orderBy(asc(rounds.roundNumber));
    expect(rows[0].myLeaderId).toBe(myLeader.id);
    // A bye is not a game and carries no leader in either segment.
    expect(rows[1].myLeaderId).toBeNull();
  });

  it('leaves other types alone', async () => {
    const [myLeader] = await db.select().from(leaders).orderBy(asc(leaders.setCode)).limit(1);
    const tournamentId = randomUUID();
    await db.insert(tournaments).values({
      id: tournamentId, ownerId: USER, type: 'regionals',
      myLeaderId: myLeader.id, playedOn: '2026-08-01',
    });

    await runMigration();

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    expect(t.myLeaderId).toBe(myLeader.id);
  });

  it('is safe to run twice', async () => {
    const [myLeader, opponent] = await db.select().from(leaders).orderBy(asc(leaders.setCode)).limit(2);
    const tournamentId = randomUUID();
    await db.insert(tournaments).values({
      id: tournamentId, ownerId: USER, type: 'testing',
      myLeaderId: myLeader.id, playedOn: '2026-08-01',
    });
    await db.insert(rounds).values(
      { tournamentId, roundNumber: 1, kind: 'swiss', opponentLeaderId: opponent.id, result: 'win' },
    );

    await runMigration();
    await runMigration();

    const rows = await db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId));
    expect(rows[0].myLeaderId).toBe(myLeader.id);

    // The first statement re-carries a leader that is already there; the
    // second re-clears a column that is already null. Only the first is
    // covered above — this covers the second.
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    expect(t.myLeaderId).toBeNull();
  });
});
