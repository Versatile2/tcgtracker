import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, leaderImages } from '../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const bytes = Buffer.from('not-really-a-webp');

async function seedLeaderWithTwoPrintings(name: string, setCode: string) {
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

function put(body: unknown) {
  return new Request('http://localhost/api/leader-art', {
    method: 'PUT', body: JSON.stringify(body),
  });
}

describe('/api/leader-art', () => {
  beforeEach(async () => { await resetDb(); });

  it('GET starts empty', async () => {
    const { GET } = await import('./leader-art/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('PUT records a non-default printing', async () => {
    const { leader, alt } = await seedLeaderWithTwoPrintings('Yamato', 'OP06-022');
    const { PUT } = await import('./leader-art/route');
    const res = await PUT(put({ leaderId: leader.id, imageId: alt.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ [leader.id]: alt.id });
  });

  it('PUT of the default printing clears the preference', async () => {
    // Choosing the default is the absence of a preference, not a preference for
    // the default, so the row is deleted rather than stored.
    const { leader, base, alt } = await seedLeaderWithTwoPrintings('Yamato', 'OP06-022');
    const { PUT } = await import('./leader-art/route');
    await PUT(put({ leaderId: leader.id, imageId: alt.id }));
    const res = await PUT(put({ leaderId: leader.id, imageId: base.id }));
    expect(await res.json()).toEqual({});
  });

  it('rejects an image belonging to another leader', async () => {
    const { leader } = await seedLeaderWithTwoPrintings('Yamato', 'OP06-022');
    const other = await seedLeaderWithTwoPrintings('Zoro', 'OP01-001');
    const { PUT } = await import('./leader-art/route');
    const res = await PUT(put({ leaderId: leader.id, imageId: other.alt.id }));
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not two uuids', async () => {
    const { PUT } = await import('./leader-art/route');
    const res = await PUT(put({ setCode: 'OP06-022', art: 'OP06-022_p1' }));
    expect(res.status).toBe(400);
  });
});
