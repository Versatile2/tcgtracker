import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isNull } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { leaders, sets } from './schema';
import { seedReferenceData } from './seed';
import { SEED_LEADERS, SEED_SETS } from './seed-data';

const db = getTestDb();

describe('seedReferenceData', () => {
  beforeEach(async () => { await resetDb(); });

  afterAll(() => closeTestDb());

  it('inserts all global leaders and sets with null owner', async () => {
    const result = await seedReferenceData(db);
    expect(result.leaders).toBe(SEED_LEADERS.length);
    expect(result.sets).toBe(SEED_SETS.length);

    const globalLeaders = await db.select().from(leaders).where(isNull(leaders.ownerId));
    expect(globalLeaders.length).toBe(SEED_LEADERS.length);
    expect(globalLeaders.every((l) => l.isCustom === false)).toBe(true);

    const globalSets = await db.select().from(sets).where(isNull(sets.ownerId));
    expect(globalSets.length).toBe(SEED_SETS.length);
  });

  it('is idempotent: re-running inserts nothing and leaves global counts unchanged', async () => {
    await seedReferenceData(db);

    const second = await seedReferenceData(db);
    expect(second.leaders).toBe(0);
    expect(second.sets).toBe(0);

    const globalLeaders = await db.select().from(leaders).where(isNull(leaders.ownerId));
    expect(globalLeaders.length).toBe(SEED_LEADERS.length);

    const globalSets = await db.select().from(sets).where(isNull(sets.ownerId));
    expect(globalSets.length).toBe(SEED_SETS.length);
  });
});
