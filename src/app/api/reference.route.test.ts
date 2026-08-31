import { eq } from 'drizzle-orm';
import { leaders, leaderImages } from '../../db/schema';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { seedReferenceData } from '../../db/seed';
import { FIXTURE_CATALOG } from '../../../tests/fixtures/catalog';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

describe('/api/leaders', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db, FIXTURE_CATALOG); });

  it('offers no way to create one', async () => {
    // The catalog ships the real leaders and the daily refresh adds new sets,
    // so a hand-typed row is a duplicate waiting to split someone's statistics.
    const mod = await import('./leaders/route');
    expect('POST' in mod).toBe(false);
  });

  it('GET returns global leaders', async () => {
    const { GET } = await import('./leaders/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((l: { name: string }) => l.name === 'Roronoa Zoro')).toBe(true);
  });



  it('GET carries each leader printings and its default', async () => {
    const [leader] = await db.select().from(leaders)
      .where(eq(leaders.setCode, 'OP01-001')).limit(1);
    const bytes = Buffer.from('not-really-a-webp');
    const [base] = await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP01-001', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength,
      checksum: 'a', isDefault: true, sortOrder: 0,
    }).returning();
    await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP01-001_p1', label: 'p1', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength,
      checksum: 'b', sortOrder: 1,
    });

    const { GET } = await import('./leaders/route');
    const body = await (await GET()).json();
    const zoro = body.find((l: { id: string }) => l.id === leader.id);
    expect(zoro.defaultImageId).toBe(base.id);
    expect(zoro.images.map((i: { label: string }) => i.label)).toEqual(['Base', 'p1']);
  });
});

describe('/api/metas', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db, FIXTURE_CATALOG); });

  it('offers no way to create one', async () => {
    const mod = await import('./metas/route');
    expect('POST' in mod).toBe(false);
  });

  it('GET returns global metas', async () => {
    const { GET } = await import('./metas/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((m: { code: string }) => m.code === 'OP06')).toBe(true);
  });


});
