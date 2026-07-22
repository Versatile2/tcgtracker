import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isNull } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { leaders, metas } from './schema';
import { seedReferenceData } from './seed';
import { SEED_LEADERS, SEED_METAS } from './seed-data';

const db = getTestDb();

describe('seedReferenceData', () => {
  beforeEach(async () => { await resetDb(); });

  afterAll(() => closeTestDb());

  it('inserts all global leaders and metas with null owner', async () => {
    const result = await seedReferenceData(db);
    expect(result.leaders).toBe(SEED_LEADERS.length);
    expect(result.metas).toBe(SEED_METAS.length);

    const globalLeaders = await db.select().from(leaders).where(isNull(leaders.ownerId));
    expect(globalLeaders.length).toBe(SEED_LEADERS.length);
    expect(globalLeaders.every((l) => l.isCustom === false)).toBe(true);

    const globalMetas = await db.select().from(metas).where(isNull(metas.ownerId));
    expect(globalMetas.length).toBe(SEED_METAS.length);
  });

  it('is idempotent: re-running inserts nothing and leaves global counts unchanged', async () => {
    await seedReferenceData(db);

    const second = await seedReferenceData(db);
    expect(second.leaders).toBe(0);
    expect(second.metas).toBe(0);

    const globalLeaders = await db.select().from(leaders).where(isNull(leaders.ownerId));
    expect(globalLeaders.length).toBe(SEED_LEADERS.length);

    const globalMetas = await db.select().from(metas).where(isNull(metas.ownerId));
    expect(globalMetas.length).toBe(SEED_METAS.length);
  });
});
