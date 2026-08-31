import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { FIXTURE_CATALOG, FIXTURE_LEADERS } from '../../tests/fixtures/catalog';
import { leaders, metas, tournaments, rounds } from '../db/schema';
import { listLeaders, listMetas } from './reference';

const db = getTestDb();
const USER = 'user_123';

/*
 * Custom leaders and metas can no longer be created — the catalog ships the real
 * 132 leaders and OP01–OP16, and the daily refresh adds new sets as they
 * release, so a hand-typed row was a duplicate waiting to split someone's
 * statistics.
 *
 * What these tests hold is the other half of that decision: rows already
 * recorded stay visible and keep working. The games logged against them are
 * real games, and hiding them would silently rewrite a player's history.
 */
// File scope, not inside a describe: a hook there fires when that block
// finishes, which is before any sibling block runs — so the second describe
// below would start against a pool that had already been ended.
afterAll(async () => { await closeTestDb(); });

describe('reference service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db, FIXTURE_CATALOG); });

  /** A custom row as one already in the database looks. */
  async function existingCustomLeader(ownerId: string, name: string) {
    const [row] = await db.insert(leaders)
      .values({ name, colors: [], setCode: null, isCustom: true, ownerId })
      .returning();
    return row;
  }

  it('lists the seeded catalog', async () => {
    const list = await listLeaders(db, USER);
    expect(list.some((l) => l.name === 'Roronoa Zoro' && l.ownerId === null)).toBe(true);
    expect(list).toHaveLength(FIXTURE_LEADERS.length);
  });

  // The migration swept legacy custom rows into `draft`, so they are no longer
  // offered. What must survive is the history: a row this player actually
  // played still resolves, or the match that used it would render blank.
  it('still shows a custom leader recorded before they were withdrawn', async () => {
    const custom = await existingCustomLeader(USER, 'My Homebrew');
    const [t] = await db.insert(tournaments).values({
      ownerId: USER, type: 'local', playedOn: '2026-01-01', myLeaderId: custom.id,
    }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, result: 'win' });
    const list = await listLeaders(db, USER);
    expect(list.some((l) => l.name === 'My Homebrew' && l.ownerId === USER)).toBe(true);
  });

  it('does not show another user custom leaders', async () => {
    await existingCustomLeader('other_user', 'Secret Deck');
    const list = await listLeaders(db, USER);
    expect(list.some((l) => l.name === 'Secret Deck')).toBe(false);
  });

  it('lists global metas newest first', async () => {
    const list = await listMetas(db, USER);
    expect(list[0]?.code).toBe('OP06');
    expect(list.every((m) => m.ownerId === null)).toBe(true);
  });

  it('still shows a custom meta recorded before they were withdrawn', async () => {
    const [custom] = await db.insert(metas)
      .values({ name: 'Local Promo Pack', isCustom: true, ownerId: USER })
      .returning();
    await db.insert(tournaments).values({
      ownerId: USER, type: 'local', playedOn: '2026-01-01', metaId: custom.id,
    });
    const list = await listMetas(db, USER);
    expect(list.some((m) => m.name === 'Local Promo Pack' && m.ownerId === USER)).toBe(true);
  });

  it('offers no way to create either', async () => {
    const mod = await import('./reference');
    expect('addCustomLeader' in mod).toBe(false);
    expect('addCustomMeta' in mod).toBe(false);
  });
});

describe('catalog visibility', () => {
  beforeEach(async () => { await resetDb(); });

  async function leader(name: string, status: 'draft' | 'published' | 'hidden') {
    const [row] = await db.insert(leaders).values({ name, colors: ['red'], status }).returning();
    return row;
  }

  it('returns published leaders', async () => {
    const pub = await leader('Published Zoro', 'published');
    const list = await listLeaders(db, 'user_1');
    expect(list.map((l) => l.id)).toContain(pub.id);
  });

  it('hides drafts and hidden leaders nobody played', async () => {
    await leader('Draft Zoro', 'draft');
    await leader('Hidden Zoro', 'hidden');
    const list = await listLeaders(db, 'user_1');
    expect(list).toHaveLength(0);
  });

  it('still returns a hidden leader this player has played', async () => {
    // Hiding a leader must never blank a past match: the client resolves names
    // by id from this one list.
    const hidden = await leader('Hidden Zoro', 'hidden');
    const [t] = await db.insert(tournaments).values({
      ownerId: 'user_1', type: 'local', playedOn: '2026-01-01', myLeaderId: hidden.id,
    }).returning();
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: 1, result: 'win',
    });
    const list = await listLeaders(db, 'user_1');
    expect(list.map((l) => l.id)).toContain(hidden.id);
  });

  it('does not leak another player hidden leader', async () => {
    const hidden = await leader('Hidden Zoro', 'hidden');
    const [t] = await db.insert(tournaments).values({
      ownerId: 'user_2', type: 'local', playedOn: '2026-01-01', myLeaderId: hidden.id,
    }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, result: 'win' });
    const list = await listLeaders(db, 'user_1');
    expect(list).toHaveLength(0);
  });

  it('returns a hidden leader played as an opponent', async () => {
    const hidden = await leader('Hidden Zoro', 'hidden');
    const [t] = await db.insert(tournaments).values({
      ownerId: 'user_1', type: 'local', playedOn: '2026-01-01',
    }).returning();
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: 1, result: 'win', opponentLeaderId: hidden.id,
    });
    const list = await listLeaders(db, 'user_1');
    expect(list.map((l) => l.id)).toContain(hidden.id);
  });
});
