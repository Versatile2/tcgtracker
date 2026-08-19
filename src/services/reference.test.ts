import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, metas } from '../db/schema';
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
describe('reference service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });
  afterAll(closeTestDb);

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
    expect(list.length).toBeGreaterThan(100);
  });

  it('still shows a custom leader recorded before they were withdrawn', async () => {
    await existingCustomLeader(USER, 'My Homebrew');
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
    expect(list[0]?.code).toBe('OP16');
    expect(list.every((m) => m.ownerId === null)).toBe(true);
  });

  it('still shows a custom meta recorded before they were withdrawn', async () => {
    await db.insert(metas).values({ name: 'Local Promo Pack', isCustom: true, ownerId: USER });
    const list = await listMetas(db, USER);
    expect(list.some((m) => m.name === 'Local Promo Pack' && m.ownerId === USER)).toBe(true);
  });

  it('offers no way to create either', async () => {
    const mod = await import('./reference');
    expect('addCustomLeader' in mod).toBe(false);
    expect('addCustomMeta' in mod).toBe(false);
  });
});
