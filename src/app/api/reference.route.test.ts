import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { seedReferenceData } from '../../db/seed';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

describe('/api/leaders', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('GET returns global leaders', async () => {
    const { GET } = await import('./leaders/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((l: { name: string }) => l.name === 'Roronoa Zoro')).toBe(true);
  });

  it('POST adds a custom leader', async () => {
    const { POST } = await import('./leaders/route');
    const req = new Request('http://test/api/leaders', {
      method: 'POST', body: JSON.stringify({ name: 'Homebrew', colors: ['red'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Homebrew');
    expect(body.ownerId).toBe('user_api');
  });

  it('POST rejects invalid body with 400', async () => {
    const { POST } = await import('./leaders/route');
    const req = new Request('http://test/api/leaders', { method: 'POST', body: JSON.stringify({ name: '' }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('/api/metas', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('GET returns global metas', async () => {
    const { GET } = await import('./metas/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((m: { name: string }) => m.name === 'OP16')).toBe(true);
  });

  it('POST adds a custom meta', async () => {
    const { POST } = await import('./metas/route');
    const req = new Request('http://test/api/metas', {
      method: 'POST', body: JSON.stringify({ name: 'Local Promo Pack' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Local Promo Pack');
    expect(body.ownerId).toBe('user_api');
  });

  it('POST rejects invalid body with 400', async () => {
    const { POST } = await import('./metas/route');
    const req = new Request('http://test/api/metas', { method: 'POST', body: JSON.stringify({ name: '' }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
