import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { seedReferenceData } from '../../db/seed';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

describe('/api/leaders', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

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


});

describe('/api/metas', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

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
    expect(body.some((m: { code: string }) => m.code === 'OP16')).toBe(true);
  });


});
