import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_t' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();

describe('/api/tournaments', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });
  afterAll(closeTestDb);

  it('POST creates then GET lists it', async () => {
    const { POST, GET } = await import('./route');
    const createRes = await POST(new Request('http://test/api/tournaments', {
      method: 'POST', body: JSON.stringify({ type: 'local', playedOn: '2026-07-20' }),
    }));
    expect(createRes.status).toBe(201);

    const listRes = await GET();
    const body = await listRes.json();
    expect(body.length).toBe(1);
    expect(body[0].record).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it('GET /:id returns 404 for a non-existent tournament', async () => {
    const mod = await import('./[id]/route');
    const res = await mod.GET(new Request('http://test'), { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});
