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

  it('orders by set code descending, newest sets first', async () => {
    await db.insert(leaders).values([
      { name: 'Older', colors: ['red'], setCode: 'OP01-001', status: 'published' },
      { name: 'Newest', colors: ['red'], setCode: 'OP16-041', status: 'published' },
      { name: 'Middle', colors: ['red'], setCode: 'OP09-001', status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/leaders/route');
    const body = await (await GET()).json();
    expect(body.map((l: { name: string }) => l.name)).toEqual(['Newest', 'Middle', 'Older']);
  });

  it('puts a leader with no set code last rather than first', async () => {
    // A custom row has no code; sorting it to the top would bury the catalog.
    await db.insert(leaders).values([
      { name: 'Codeless', colors: ['red'], setCode: null, status: 'published' },
      { name: 'Coded', colors: ['red'], setCode: 'OP01-001', status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/leaders/route');
    const body = await (await GET()).json();
    expect(body.map((l: { name: string }) => l.name)).toEqual(['Coded', 'Codeless']);
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

  it('orders by release date descending, not by code', async () => {
    // The codes are not a timeline: OP-14 and OP-15 shipped out of code order
    // more than once, and an EB/PRB code sorts above OP16 lexically.
    await db.insert(metas).values([
      { name: 'Older set', code: 'OP16', releasedAt: '2025-01-01', status: 'published' },
      { name: 'Newest set', code: 'OP01', releasedAt: '2026-06-12', status: 'published' },
      { name: 'Middle set', code: 'OP09', releasedAt: '2025-11-07', status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/metas/route');
    const body = await (await GET()).json();
    expect(body.map((m: { name: string }) => m.name)).toEqual(['Newest set', 'Middle set', 'Older set']);
  });

  it('falls back to code for metas with no date, and puts them last', async () => {
    await db.insert(metas).values([
      { name: 'Undated low', code: 'OP01', releasedAt: null, status: 'published' },
      { name: 'Undated high', code: 'OP09', releasedAt: null, status: 'published' },
      { name: 'Dated', code: 'OP02', releasedAt: '2023-03-10', status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/metas/route');
    const body = await (await GET()).json();
    expect(body.map((m: { name: string }) => m.name)).toEqual(['Dated', 'Undated high', 'Undated low']);
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

describe('editing catalog rows', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  const body = (b: unknown, method = 'PATCH') =>
    new Request('http://localhost/x', { method, body: JSON.stringify(b) });

  it('creates a leader as a draft by default', async () => {
    asAdmin();
    const { POST } = await import('./admin/leaders/route');
    const res = await POST(body({
      name: 'Homebrew Luffy', colors: ['red'], setCode: null,
      aliases: [], deckCodes: [], status: 'draft',
    }, 'POST'));
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created.status).toBe('draft');
    expect(created.name).toBe('Homebrew Luffy');
  });

  it('updates a leader name, aliases and status', async () => {
    const [row] = await db.insert(leaders)
      .values({ name: 'Wrong Name', colors: ['red'], setCode: 'OP01-001' }).returning();
    asAdmin();
    const { PATCH } = await import('./admin/leaders/[id]/route');
    const res = await PATCH(body({
      name: 'Roronoa Zoro', colors: ['red'], setCode: 'OP01-001',
      aliases: ['red zoro'], deckCodes: [], status: 'published',
    }), { params: Promise.resolve({ id: row.id }) });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe('Roronoa Zoro');
    expect(updated.aliases).toEqual(['red zoro']);
    expect(updated.status).toBe('published');
  });

  it('404s when updating a leader that does not exist', async () => {
    asAdmin();
    const { PATCH } = await import('./admin/leaders/[id]/route');
    const res = await PATCH(body({
      name: 'X', colors: [], setCode: null, aliases: [], deckCodes: [], status: 'draft',
    }), { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });

  it('rejects a colour that is not an OPTCG colour', async () => {
    asAdmin();
    const { POST } = await import('./admin/leaders/route');
    const res = await POST(body({
      name: 'X', colors: ['turquoise'], setCode: null, aliases: [], deckCodes: [], status: 'draft',
    }, 'POST'));
    expect(res.status).toBe(400);
  });

  it('403s for a non-admin', async () => {
    asPlayer();
    const { POST } = await import('./admin/leaders/route');
    const res = await POST(body({
      name: 'X', colors: ['red'], setCode: null, aliases: [], deckCodes: [], status: 'draft',
    }, 'POST'));
    expect(res.status).toBe(403);
  });

  it('stores a meta release date', async () => {
    const [row] = await db.insert(metas).values({ name: 'OP16', code: 'OP16' }).returning();
    asAdmin();
    const { PATCH } = await import('./admin/metas/[id]/route');
    const res = await PATCH(body({
      name: 'OP16 Royal Blood', code: 'OP16', releasedAt: '2025-11-01', status: 'published',
    }), { params: Promise.resolve({ id: row.id }) });
    expect((await res.json()).releasedAt).toBe('2025-11-01');
  });

  it('rejects a release date that is not a date', async () => {
    const [row] = await db.insert(metas).values({ name: 'OP16', code: 'OP16' }).returning();
    asAdmin();
    const { PATCH } = await import('./admin/metas/[id]/route');
    const res = await PATCH(body({
      name: 'OP16', code: 'OP16', releasedAt: 'last november', status: 'draft',
    }), { params: Promise.resolve({ id: row.id }) });
    expect(res.status).toBe(400);
  });
});
