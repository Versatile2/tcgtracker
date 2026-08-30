import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { leaders, leaderImages, leaderArt } from './schema';

const db = getTestDb();

// File scope, not inside `describe('schema')`: a hook there fires when that
// block finishes, which is before any sibling block runs — so the second
// describe below would start against a pool that had already been ended.
afterAll(async () => { await closeTestDb(); });

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

describe('leader_images', () => {
  beforeEach(async () => { await resetDb(); });
  // No afterAll here: the existing `describe('schema')` block already closes the
  // shared pool, and calling pool.end() twice throws.

  async function makeLeader() {
    const [row] = await db.insert(leaders)
      .values({ name: 'Yamato', colors: ['green'], setCode: 'OP06-022' })
      .returning();
    return row;
  }

  const bytes = Buffer.from('not-really-a-webp');

  it('allows only one default image per leader', async () => {
    const leader = await makeLeader();
    const base = {
      leaderId: leader.id, data: bytes, mimeType: 'image/webp',
      width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    };
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022', label: 'Base', isDefault: true });
    await expect(
      db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022_p1', label: 'p1', isDefault: true }),
    ).rejects.toThrow();
  });

  it('allows many non-default images for one leader', async () => {
    const leader = await makeLeader();
    const base = {
      leaderId: leader.id, data: bytes, mimeType: 'image/webp',
      width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    };
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022', label: 'Base', isDefault: true });
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022_p1', label: 'p1' });
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022_p2', label: 'p2' });
    const rows = await db.select().from(leaderImages).where(eq(leaderImages.leaderId, leader.id));
    expect(rows).toHaveLength(3);
  });

  it('rejects the same printing twice for one leader', async () => {
    const leader = await makeLeader();
    const base = {
      leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    };
    await db.insert(leaderImages).values(base);
    await expect(db.insert(leaderImages).values(base)).rejects.toThrow();
  });

  it('reads bytes back unchanged', async () => {
    const leader = await makeLeader();
    const [row] = await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    }).returning();
    expect(Buffer.isBuffer(row.data)).toBe(true);
    expect(row.data.equals(bytes)).toBe(true);
  });

  it('deletes a leader images with the leader', async () => {
    const leader = await makeLeader();
    await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    });
    await db.delete(leaders).where(eq(leaders.id, leader.id));
    const rows = await db.select().from(leaderImages);
    expect(rows).toHaveLength(0);
  });

  it('drops a player art preference when the image is deleted', async () => {
    const leader = await makeLeader();
    const [image] = await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP06-022_p1', label: 'p1', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'c',
    }).returning();
    await db.insert(leaderArt).values({ ownerId: 'user_1', leaderId: leader.id, leaderImageId: image.id });

    await db.delete(leaderImages).where(eq(leaderImages.id, image.id));
    const rows = await db.select().from(leaderArt);
    // The preference is cosmetic: losing the image means falling back to the
    // leader's default, not pointing at nothing.
    expect(rows).toHaveLength(0);
  });
});
