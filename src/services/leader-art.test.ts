import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { leaders, leaderImages } from '../db/schema';
import { listLeaderArt, setLeaderArt } from './leader-art';
import { ValidationError } from '../lib/errors';

/*
 * The service-level counterpart to the route test.
 *
 * Not mentioned by the implementation plan, which replaced only the route test —
 * but this file asserted the old (setCode, art) contract and cannot compile
 * against the new one. Rewritten rather than deleted: it still owns the one case
 * the route test does not, that two players' choices never leak into each other.
 */

const db = getTestDb();
afterAll(closeTestDb);

const bytes = Buffer.from('not-really-a-webp');

async function seedLeader(name: string, setCode: string) {
  const [leader] = await db.insert(leaders).values({ name, colors: ['green'], setCode }).returning();
  const common = {
    leaderId: leader.id, data: bytes, mimeType: 'image/webp',
    width: 240, height: 335, byteSize: bytes.byteLength,
  };
  const [base] = await db.insert(leaderImages)
    .values({ ...common, cardImageId: setCode, label: 'Base', checksum: `${setCode}-a`, isDefault: true, sortOrder: 0 })
    .returning();
  const [alt] = await db.insert(leaderImages)
    .values({ ...common, cardImageId: `${setCode}_p1`, label: 'p1', checksum: `${setCode}-b`, sortOrder: 1 })
    .returning();
  return { leader, base, alt };
}

describe('leader art', () => {
  beforeEach(async () => { await resetDb(); });

  it('starts empty', async () => {
    expect(await listLeaderArt(db, 'user_a')).toEqual({});
  });

  it('records a chosen printing and returns the whole map', async () => {
    const { leader, alt } = await seedLeader('Yamato', 'OP06-022');
    expect(await setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: alt.id }))
      .toEqual({ [leader.id]: alt.id });
  });

  it('overwrites an earlier choice rather than adding a second row', async () => {
    const { leader, alt } = await seedLeader('Yamato', 'OP06-022');
    const common = {
      leaderId: leader.id, data: bytes, mimeType: 'image/webp',
      width: 240, height: 335, byteSize: bytes.byteLength,
    };
    const [third] = await db.insert(leaderImages)
      .values({ ...common, cardImageId: 'OP06-022_p2', label: 'p2', checksum: 'c', sortOrder: 2 })
      .returning();
    await setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: alt.id });
    expect(await setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: third.id }))
      .toEqual({ [leader.id]: third.id });
  });

  it('forgets the choice when the default is picked again', async () => {
    // Absent already means "the default" to every reader, so the row is dropped
    // rather than stored as a redundant statement of it.
    const { leader, base, alt } = await seedLeader('Yamato', 'OP06-022');
    await setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: alt.id });
    expect(await setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: base.id })).toEqual({});
  });

  it('keeps players apart', async () => {
    const { leader, alt } = await seedLeader('Yamato', 'OP06-022');
    await setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: alt.id });
    expect(await listLeaderArt(db, 'user_b')).toEqual({});
  });

  it('rejects an image belonging to a different leader', async () => {
    const { leader } = await seedLeader('Yamato', 'OP06-022');
    const other = await seedLeader('Zoro', 'OP01-001');
    await expect(setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: other.alt.id }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an image id that exists nowhere', async () => {
    const { leader } = await seedLeader('Yamato', 'OP06-022');
    await expect(setLeaderArt(db, 'user_a', {
      leaderId: leader.id, imageId: '00000000-0000-0000-0000-000000000000',
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('deleting an image forgets the players who chose it', async () => {
    // The cascade the spec calls a designed consequence: a player whose printing
    // is removed falls back to the default rather than pointing at nothing.
    const { leader, alt } = await seedLeader('Yamato', 'OP06-022');
    await setLeaderArt(db, 'user_a', { leaderId: leader.id, imageId: alt.id });
    const { eq } = await import('drizzle-orm');
    await db.delete(leaderImages).where(eq(leaderImages.id, alt.id));
    expect(await listLeaderArt(db, 'user_a')).toEqual({});
  });
});
