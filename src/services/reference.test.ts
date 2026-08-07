import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { listLeaders, addCustomLeader, listMetas, addCustomMeta } from './reference';

const db = getTestDb();
const USER = 'user_123';

describe('reference service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });
  afterAll(closeTestDb);

  it('lists global leaders plus the user custom ones', async () => {
    await addCustomLeader(db, USER, { name: 'My Homebrew', colors: ['red'] });
    const list = await listLeaders(db, USER);
    expect(list.some((l) => l.name === 'Roronoa Zoro' && l.ownerId === null)).toBe(true);
    expect(list.some((l) => l.name === 'My Homebrew' && l.ownerId === USER)).toBe(true);
  });

  it('does not show another user custom leaders', async () => {
    await addCustomLeader(db, 'other_user', { name: 'Secret Deck', colors: [] });
    const list = await listLeaders(db, USER);
    expect(list.some((l) => l.name === 'Secret Deck')).toBe(false);
  });

  it('reuses the user own custom leader on duplicate custom-add (case-insensitive)', async () => {
    const first = await addCustomLeader(db, USER, { name: 'My Homebrew', colors: [] });
    const second = await addCustomLeader(db, USER, { name: 'my homebrew', colors: [] });
    expect(second.id).toBe(first.id);
    const list = await listLeaders(db, USER);
    expect(list.filter((l) => l.name.toLowerCase() === 'my homebrew').length).toBe(1);
  });

  it('does not collapse a custom leader onto a real card with the same name', async () => {
    // "Roronoa Zoro" is a real card, but it names two distinct printings — so a
    // custom add must create the user's own row rather than pick one of them.
    const custom = await addCustomLeader(db, USER, { name: 'roronoa zoro', colors: [] });
    expect(custom.ownerId).toBe(USER);
    expect(custom.isCustom).toBe(true);
  });

  it('adds and dedupes custom metas', async () => {
    const a = await addCustomMeta(db, USER, { name: 'Local Promo Pack' });
    const b = await addCustomMeta(db, USER, { name: 'local promo pack' });
    expect(b.id).toBe(a.id);
    const metas = await listMetas(db, USER);
    expect(metas.filter((m) => m.name.toLowerCase() === 'local promo pack').length).toBe(1);
    expect(metas.some((m) => m.code === 'OP16')).toBe(true);
  });
});
