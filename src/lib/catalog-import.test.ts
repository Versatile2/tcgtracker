import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { leaders, metas, leaderImages } from '../db/schema';
import { diffLeader, applyImport } from './catalog-import';

const db = getTestDb();
afterAll(async () => { await closeTestDb(); });

/** A minimal valid WebP header followed by filler. */
function webp(size = 512): Buffer {
  const b = Buffer.alloc(size, 0x20);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(size - 8, 4);
  b.write('WEBP', 8, 'ascii');
  return b;
}

describe('diffLeader', () => {
  it('reports nothing when they agree', () => {
    expect(diffLeader(
      { name: 'Yamato', colors: ['green', 'yellow'] },
      { name: 'Yamato', colors: ['green', 'yellow'] },
    )).toEqual([]);
  });

  it('reports a differing name', () => {
    expect(diffLeader(
      { name: 'Yamato', colors: ['green'] },
      { name: 'Yamato (Alt)', colors: ['green'] },
    )).toEqual(['name']);
  });

  it('ignores colour ordering', () => {
    // The API is not stable about ordering, and a reported difference the owner
    // cannot act on trains them to ignore the report.
    expect(diffLeader(
      { name: 'Yamato', colors: ['green', 'yellow'] },
      { name: 'Yamato', colors: ['yellow', 'green'] },
    )).toEqual([]);
  });

  it('reports both fields when both differ', () => {
    expect(diffLeader(
      { name: 'A', colors: ['red'] },
      { name: 'B', colors: ['blue'] },
    ).sort()).toEqual(['colors', 'name']);
  });
});

describe('applyImport', () => {
  beforeEach(async () => { await resetDb(); });

  const yamato = (printings: { cardImageId: string; bytes: Buffer }[]) => ({
    setCode: 'OP06-022', name: 'Yamato', colors: ['green', 'yellow'], printings,
  });

  it('inserts an unknown leader as a draft with its first printing as the default', async () => {
    const report = await applyImport(db, {
      leaders: [yamato([
        { cardImageId: 'OP06-022', bytes: webp() },
        { cardImageId: 'OP06-022_p1', bytes: webp(600) },
      ])],
      metas: [],
    });
    expect(report.insertedLeaders).toBe(1);
    expect(report.insertedPrintings).toBe(2);

    const [row] = await db.select().from(leaders).where(eq(leaders.setCode, 'OP06-022'));
    expect(row.status).toBe('draft');

    const imgs = await db.select().from(leaderImages)
      .where(eq(leaderImages.leaderId, row.id)).orderBy(asc(leaderImages.sortOrder));
    expect(imgs.map((i) => i.cardImageId)).toEqual(['OP06-022', 'OP06-022_p1']);
    expect(imgs[0].isDefault).toBe(true);
    expect(imgs[1].isDefault).toBe(false);
  });

  it('never modifies an existing leader whose name differs, and reports it', async () => {
    await db.insert(leaders).values({
      name: 'Yamato (hand corrected)', colors: ['green', 'yellow'],
      setCode: 'OP06-022', status: 'published',
    });
    const report = await applyImport(db, { leaders: [yamato([])], metas: [] });

    expect(report.insertedLeaders).toBe(0);
    expect(report.differs).toHaveLength(1);
    expect(report.differs[0].fields).toEqual(['name']);

    const [row] = await db.select().from(leaders).where(eq(leaders.setCode, 'OP06-022'));
    expect(row.name).toBe('Yamato (hand corrected)');
    expect(row.status).toBe('published');
  });

  it('does not insert a printing it already holds', async () => {
    await applyImport(db, {
      leaders: [yamato([{ cardImageId: 'OP06-022', bytes: webp() }])], metas: [],
    });
    const second = await applyImport(db, {
      leaders: [yamato([
        { cardImageId: 'OP06-022', bytes: webp() },
        { cardImageId: 'OP06-022_p2', bytes: webp(700) },
      ])],
      metas: [],
    });
    expect(second.insertedPrintings).toBe(1);
    const [row] = await db.select().from(leaders).where(eq(leaders.setCode, 'OP06-022'));
    const imgs = await db.select().from(leaderImages).where(eq(leaderImages.leaderId, row.id));
    expect(imgs).toHaveLength(2);
  });

  it('adds a new printing without moving a default the owner chose', async () => {
    await applyImport(db, {
      leaders: [yamato([
        { cardImageId: 'OP06-022', bytes: webp() },
        { cardImageId: 'OP06-022_p1', bytes: webp(600) },
      ])],
      metas: [],
    });
    const [row] = await db.select().from(leaders).where(eq(leaders.setCode, 'OP06-022'));
    // The owner prefers the parallel art.
    const imgs = await db.select().from(leaderImages)
      .where(eq(leaderImages.leaderId, row.id)).orderBy(asc(leaderImages.sortOrder));
    await db.update(leaderImages).set({ isDefault: false }).where(eq(leaderImages.id, imgs[0].id));
    await db.update(leaderImages).set({ isDefault: true }).where(eq(leaderImages.id, imgs[1].id));

    await applyImport(db, {
      leaders: [yamato([{ cardImageId: 'OP06-022_p2', bytes: webp(800) }])], metas: [],
    });

    const after = await db.select().from(leaderImages).where(eq(leaderImages.leaderId, row.id));
    expect(after.filter((i) => i.isDefault).map((i) => i.cardImageId)).toEqual(['OP06-022_p1']);
  });

  it('inserts an unknown meta as a draft and skips one it holds', async () => {
    const first = await applyImport(db, { leaders: [], metas: [{ code: 'OP17', name: 'OP17 Whatever' }] });
    expect(first.insertedMetas).toBe(1);
    const [m] = await db.select().from(metas).where(eq(metas.code, 'OP17'));
    expect(m.status).toBe('draft');

    const second = await applyImport(db, { leaders: [], metas: [{ code: 'OP17', name: 'OP17 Whatever' }] });
    expect(second.insertedMetas).toBe(0);
  });
});
