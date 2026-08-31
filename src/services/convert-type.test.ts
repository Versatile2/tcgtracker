import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { FIXTURE_CATALOG } from '../../tests/fixtures/catalog';
import { rounds, tournaments } from '../db/schema';
import { createTournament, convertTournamentType, finishTournament } from './tournaments';
import { addRound } from './rounds';
import { listLeaders, listMetas } from './reference';
import { NotFoundError, ValidationError } from '../lib/errors';

const db = getTestDb();
const USER = 'user_a';

async function anyLeaderIds() {
  const ls = await listLeaders(db, USER);
  return { mine: ls[0].id, opp: ls[1].id, other: ls[2].id };
}

async function roundsFor(tournamentId: string) {
  return db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId)).orderBy(rounds.roundNumber);
}

beforeEach(async () => { await resetDb(); await seedReferenceData(db, FIXTURE_CATALOG); });
afterAll(closeTestDb);

describe('converting a tournament into a session', () => {
  it('moves the leader down onto the games and off the session', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-08-14' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss' });

    const converted = await convertTournamentType(db, USER, t.id, { type: 'session_gauntlet' });
    expect(converted.myLeaderId).toBeNull();
    const rs = await roundsFor(t.id);
    expect(rs.every((r) => r.myLeaderId === mine)).toBe(true);
  });

  it('leaves byes and no-shows without a leader', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-08-14' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await addRound(db, USER, t.id, { kind: 'bye' });
    await addRound(db, USER, t.id, { kind: 'no_show' });

    await convertTournamentType(db, USER, t.id, { type: 'session_gauntlet' });
    const rs = await roundsFor(t.id);
    const bye = rs.find((r) => r.kind === 'bye');
    const noShow = rs.find((r) => r.kind === 'no_show');
    expect(bye?.myLeaderId).toBeNull();
    expect(noShow?.myLeaderId).toBeNull();
  });

  it('keeps placement, field size, name, notes, meta and date', async () => {
    const ls = await listLeaders(db, USER);
    const metas = await listMetas(db, USER);
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: ls[0].id, metaId: metas[0].id, playedOn: '2026-08-14',
      name: 'Local #4', notes: 'Great venue', placement: 2, fieldSize: 16,
    });
    const converted = await convertTournamentType(db, USER, t.id, { type: 'session_gauntlet' });
    expect(converted.name).toBe('Local #4');
    expect(converted.notes).toBe('Great venue');
    expect(converted.placement).toBe(2);
    expect(converted.fieldSize).toBe(16);
    expect(converted.metaId).toBe(metas[0].id);
    expect(converted.playedOn).toBe(t.playedOn);
  });

  it('converts a locked tournament and leaves it locked', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-08-14' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await finishTournament(db, USER, t.id);

    const converted = await convertTournamentType(db, USER, t.id, { type: 'session_gauntlet' });
    expect(converted.status).toBe('locked');
  });
});

describe('converting a session into a tournament', () => {
  it('promotes the single deck onto the session and clears the rounds', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'session_gauntlet', playedOn: '2026-08-14' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win', myLeaderId: mine });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss', myLeaderId: mine });

    const converted = await convertTournamentType(db, USER, t.id, { type: 'local' });
    expect(converted.myLeaderId).toBe(mine);
    const rs = await roundsFor(t.id);
    expect(rs.every((r) => r.myLeaderId === null)).toBe(true);
  });

  it('refuses a session that played two or more decks', async () => {
    const { mine, opp, other } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'session_gauntlet', playedOn: '2026-08-14' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win', myLeaderId: mine });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss', myLeaderId: other });

    await expect(convertTournamentType(db, USER, t.id, { type: 'local' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('takes the leader it is given when the session has no rounds', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'session_gauntlet', playedOn: '2026-08-14' });
    const converted = await convertTournamentType(db, USER, t.id, { type: 'local', myLeaderId: mine });
    expect(converted.myLeaderId).toBe(mine);
  });

  it('takes the leader it is given when every round is a bye', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'session_gauntlet', playedOn: '2026-08-14' });
    await addRound(db, USER, t.id, { kind: 'bye' });
    await addRound(db, USER, t.id, { kind: 'no_show' });
    const converted = await convertTournamentType(db, USER, t.id, { type: 'local', myLeaderId: mine });
    expect(converted.myLeaderId).toBe(mine);
  });

  it('refuses a session with no rounds and no leader offered', async () => {
    const t = await createTournament(db, USER, { type: 'session_gauntlet', playedOn: '2026-08-14' });
    await expect(convertTournamentType(db, USER, t.id, { type: 'local' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('either direction', () => {
  it('round-trips a tournament unchanged', async () => {
    const { mine, opp } = await anyLeaderIds();
    const metas = await listMetas(db, USER);
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: mine, metaId: metas[0].id, playedOn: '2026-08-14',
      name: 'Local #4', notes: 'Great venue', placement: 2, fieldSize: 16,
    });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss' });
    await addRound(db, USER, t.id, { kind: 'bye' });

    const before = (await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0];
    const roundsBefore = await roundsFor(t.id);

    await convertTournamentType(db, USER, t.id, { type: 'session_gauntlet' });
    await convertTournamentType(db, USER, t.id, { type: 'local' });

    const after = (await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0];
    const roundsAfter = await roundsFor(t.id);

    // updatedAt legitimately changes on every write the conversion makes —
    // excluded deliberately rather than loosening the whole comparison.
    const omitUpdatedAt = (row: typeof before) =>
      Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'updatedAt'));
    expect(omitUpdatedAt(after)).toEqual(omitUpdatedAt(before));

    expect(roundsAfter.length).toBe(roundsBefore.length);
    for (let i = 0; i < roundsBefore.length; i++) {
      expect(roundsAfter[i].myLeaderId).toBe(roundsBefore[i].myLeaderId);
    }
  });

  it('refuses another owner', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-08-14' });
    await expect(convertTournamentType(db, 'user_b', t.id, { type: 'session_gauntlet' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a match', async () => {
    const { mine, opp } = await anyLeaderIds();
    const m = await createTournament(db, USER, { type: 'match', myLeaderId: mine, playedOn: '2026-08-14' });
    await addRound(db, USER, m.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await expect(convertTournamentType(db, USER, m.id, { type: 'session_gauntlet' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses converting a session into a match', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'session_gauntlet', playedOn: '2026-08-14' });
    await expect(convertTournamentType(db, USER, t.id, { type: 'match', myLeaderId: mine }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('is a no-op when the type does not cross the boundary', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-08-14' });
    await expect(convertTournamentType(db, USER, t.id, { type: 'regionals' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('returns the row unchanged when replayed against a conversion that already landed', async () => {
    // A replayed offline convert whose POST committed but whose response never
    // made it back: the outbox retries and this call reaches an already-
    // converted row. Every other queued op tolerates a replay of its own
    // already-applied effect (createTournament, addRound); convert has to as
    // well, or classifyFailure treats the resulting 400 as permanent and
    // discards the entry while the screen already shows the conversion done.
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-08-14' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });

    const converted = await convertTournamentType(db, USER, t.id, { type: 'session_gauntlet' });
    const replayed = await convertTournamentType(db, USER, t.id, { type: 'session_gauntlet' });

    expect(replayed).toEqual(converted);
    const rs = await roundsFor(t.id);
    expect(rs.every((r) => r.myLeaderId === mine)).toBe(true);
  });

  it('still refuses a same-side type change that is not a replay of the current type', async () => {
    // Distinguishes the no-op branch above from a genuine caller error: this
    // request never happened before (local -> regionals), it just happens to
    // land on the same side of session the tournament is already on. That is
    // still not a conversion, and must still be rejected rather than silently
    // renaming the type.
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-08-14' });
    await expect(convertTournamentType(db, USER, t.id, { type: 'regionals' }))
      .rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row.type).toBe('local');
  });
});
