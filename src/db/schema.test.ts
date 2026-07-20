import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb } from '../../tests/setup/db';
import { leaders } from './schema';

const db = getTestDb();

describe('schema', () => {
  beforeEach(async () => { await resetDb(); });

  it('inserts and reads a global leader with null owner', async () => {
    const [row] = await db.insert(leaders)
      .values({ name: 'Roronoa Zoro', colors: ['green'] })
      .returning();
    expect(row.ownerId).toBeNull();
    expect(row.isCustom).toBe(false);

    const found = await db.select().from(leaders).where(eq(leaders.id, row.id));
    expect(found[0].name).toBe('Roronoa Zoro');
    expect(found[0].colors).toEqual(['green']);
  });
});
