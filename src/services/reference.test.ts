import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { listLeaders, addCustomLeader, listSets, addCustomSet } from './reference';

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

  it('reuses an existing leader on duplicate custom-add (case-insensitive)', async () => {
    const first = await addCustomLeader(db, USER, { name: 'roronoa zoro', colors: [] });
    // Matches the global seed "Roronoa Zoro"
    expect(first.ownerId).toBeNull();
    const list = await listLeaders(db, USER);
    expect(list.filter((l) => l.name.toLowerCase() === 'roronoa zoro').length).toBe(1);
  });

  it('adds and dedupes custom sets', async () => {
    const a = await addCustomSet(db, USER, { name: 'Local Promo Pack' });
    const b = await addCustomSet(db, USER, { name: 'local promo pack' });
    expect(b.id).toBe(a.id);
    const sets = await listSets(db, USER);
    expect(sets.filter((s) => s.name.toLowerCase() === 'local promo pack').length).toBe(1);
  });
});
