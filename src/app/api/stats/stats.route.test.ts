import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';
import { leaders, tournaments, rounds } from '../../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_route_stats' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}

describe('stats routes', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('GET /api/stats returns overall, perSet, playedLeaders', async () => {
    const [t] = await db.insert(tournaments).values({ ownerId: 'user_route_stats', type: 'local', setId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, myLeaderId: await leaderId('Nami'), opponentLeaderId: await leaderId('Sanji'), result: 'win', playOrder: 'first', notes: null });

    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall.wins).toBe(1);
    expect(Array.isArray(body.perSet)).toBe(true);
    expect(body.playedLeaders.some((l: { name: string }) => l.name === 'Nami')).toBe(true);
  });

  it('GET matchups requires a valid leaderId (400)', async () => {
    const { GET } = await import('./matchups/route');
    const res = await GET(new Request('http://test/api/stats/matchups'));
    expect(res.status).toBe(400);
  });

  it('GET matchups returns the matchup structure', async () => {
    const zoro = await leaderId('Roronoa Zoro');
    const [t] = await db.insert(tournaments).values({ ownerId: 'user_route_stats', type: 'local', setId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, myLeaderId: zoro, opponentLeaderId: await leaderId('Nami'), result: 'win', playOrder: 'first', notes: null });

    const { GET } = await import('./matchups/route');
    const res = await GET(new Request(`http://test/api/stats/matchups?leaderId=${zoro}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.opponents[0].name).toBe('Nami');
    expect(body.turnOrder.first.wins).toBe(1);
  });
});
