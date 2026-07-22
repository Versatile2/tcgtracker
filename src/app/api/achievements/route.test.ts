import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';
import { leaders, tournaments, rounds } from '../../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_ach_route' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}

describe('GET /api/achievements', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('returns achievements with unlockedCount and total', async () => {
    const [t] = await db.insert(tournaments).values({ ownerId: 'user_ach_route', type: 'local', myLeaderId: await leaderId('Nami'), metaId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, opponentLeaderId: await leaderId('Sanji'), result: 'win', playOrder: 'first', notes: null });

    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(body.achievements.length);
    expect(body.unlockedCount).toBeGreaterThanOrEqual(1); // first_blood
    expect(body.achievements.find((a: { key: string }) => a.key === 'first_blood').unlocked).toBe(true);
  });
});
