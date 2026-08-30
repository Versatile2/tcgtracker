import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, metas } from '../../db/schema';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const asAdmin = () => auth.mockResolvedValue({ userId: 'user_admin', sessionClaims: { metadata: { role: 'admin' } } });
const asPlayer = () => auth.mockResolvedValue({ userId: 'user_1', sessionClaims: {} });

describe('/api/admin/leaders', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  it('403s without the admin role', async () => {
    asPlayer();
    const { GET } = await import('./admin/leaders/route');
    expect((await GET()).status).toBe(403);
  });

  it('returns drafts and hidden rows, which the player endpoint does not', async () => {
    await db.insert(leaders).values([
      { name: 'Draft Zoro', colors: ['red'], status: 'draft' },
      { name: 'Hidden Law', colors: ['green'], status: 'hidden' },
      { name: 'Live Luffy', colors: ['red'], status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/leaders/route');
    const body = await (await GET()).json();
    expect(body.map((l: { name: string }) => l.name).sort())
      .toEqual(['Draft Zoro', 'Hidden Law', 'Live Luffy']);
  });

  it('sorts drafts first', async () => {
    await db.insert(leaders).values([
      { name: 'AAA Published', colors: ['red'], status: 'published' },
      { name: 'ZZZ Draft', colors: ['red'], status: 'draft' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/leaders/route');
    const body = await (await GET()).json();
    expect(body[0].name).toBe('ZZZ Draft');
  });
});

describe('/api/admin/metas', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  it('403s without the admin role', async () => {
    asPlayer();
    const { GET } = await import('./admin/metas/route');
    expect((await GET()).status).toBe(403);
  });

  it('returns every meta whatever its status', async () => {
    await db.insert(metas).values([
      { name: 'OP17', code: 'OP17', status: 'draft' },
      { name: 'OP16', code: 'OP16', status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/metas/route');
    const body = await (await GET()).json();
    expect(body).toHaveLength(2);
  });
});

describe('/api/admin/leaders/status', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  async function threeDrafts() {
    return db.insert(leaders).values([
      { name: 'A', colors: ['red'], status: 'draft' },
      { name: 'B', colors: ['red'], status: 'draft' },
      { name: 'C', colors: ['red'], status: 'draft' },
    ]).returning();
  }

  function patch(body: unknown) {
    return new Request('http://localhost/api/admin/leaders/status', {
      method: 'PATCH', body: JSON.stringify(body),
    });
  }

  it('403s without the admin role', async () => {
    asPlayer();
    const { PATCH } = await import('./admin/leaders/status/route');
    expect((await PATCH(patch({ ids: [], status: 'published' }))).status).toBe(403);
  });

  it('publishes exactly the selected rows and leaves the rest alone', async () => {
    const [a, b, c] = await threeDrafts();
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    const res = await PATCH(patch({ ids: [a.id, b.id], status: 'published' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: 2 });

    const after = await db.select().from(leaders);
    const byId = Object.fromEntries(after.map((l) => [l.id, l.status]));
    expect(byId[a.id]).toBe('published');
    expect(byId[b.id]).toBe('published');
    expect(byId[c.id]).toBe('draft');
  });

  it('rejects an empty selection', async () => {
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    expect((await PATCH(patch({ ids: [], status: 'published' }))).status).toBe(400);
  });

  it('rejects a status outside the enum', async () => {
    const [a] = await threeDrafts();
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    expect((await PATCH(patch({ ids: [a.id], status: 'retired' }))).status).toBe(400);
  });

  it('reports zero changed for ids that do not exist', async () => {
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    const res = await PATCH(patch({
      ids: ['00000000-0000-0000-0000-000000000000'], status: 'published',
    }));
    expect(await res.json()).toEqual({ changed: 0 });
  });
});
