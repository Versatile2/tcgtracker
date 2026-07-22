import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';
import { createTournament, finishTournament } from '../../../services/tournaments';
import { listLeaders } from '../../../services/reference';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_rd' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();

describe('round routes', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });
  afterAll(closeTestDb);

  it('POST adds a round; returns 409 once locked', async () => {
    const leaders = await listLeaders(db, 'user_rd');
    const t = await createTournament(db, 'user_rd', { type: 'local', myLeaderId: leaders[0].id, playedOn: '2026-07-20' });
    const { POST } = await import('../tournaments/[id]/rounds/route');
    const body = JSON.stringify({ opponentLeaderId: leaders[1].id, result: 'win' });

    const res = await POST(new Request('http://test', { method: 'POST', body }), { params: Promise.resolve({ id: t.id }) });
    expect(res.status).toBe(201);

    await finishTournament(db, 'user_rd', t.id);
    const locked = await POST(new Request('http://test', { method: 'POST', body }), { params: Promise.resolve({ id: t.id }) });
    expect(locked.status).toBe(409);
  });
});
