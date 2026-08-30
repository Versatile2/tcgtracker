import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, leaderImages } from '../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const bytes = Buffer.from('not-really-a-webp');

async function seedImage() {
  const [leader] = await db.insert(leaders)
    .values({ name: 'Yamato', colors: ['green'], setCode: 'OP06-022' })
    .returning();
  const [image] = await db.insert(leaderImages).values({
    leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
    mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength,
    checksum: 'sha-of-the-bytes', isDefault: true,
  }).returning();
  return image;
}

describe('/api/leader-images/[id]', () => {
  beforeEach(async () => { await resetDb(); });

  it('returns the bytes with the stored mime type', async () => {
    const image = await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: image.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(bytes)).toBe(true);
  });

  it('caches immutably and tags the response with the checksum', async () => {
    const image = await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: image.id }),
    });
    expect(res.headers.get('etag')).toBe('"sha-of-the-bytes"');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('cache-control')).toContain('max-age=31536000');
  });

  it('answers 304 when the client already has that checksum', async () => {
    const image = await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/leader-images/x', {
        headers: { 'if-none-match': '"sha-of-the-bytes"' },
      }),
      { params: Promise.resolve({ id: image.id }) },
    );
    expect(res.status).toBe(304);
  });

  it('404s on an unknown id', async () => {
    await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(404);
  });

  it('404s on an id that is not a uuid instead of erroring', async () => {
    // Postgres raises on a malformed uuid comparison; an unknown id is a 404,
    // not a 500, however malformed it is.
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: 'nonsense' }),
    });
    expect(res.status).toBe(404);
  });
});
