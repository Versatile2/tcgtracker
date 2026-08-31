import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, leaderImages } from '../../db/schema';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const asAdmin = () => auth.mockResolvedValue({ userId: 'u', sessionClaims: { metadata: { role: 'admin' } } });
const asPlayer = () => auth.mockResolvedValue({ userId: 'u', sessionClaims: {} });

/** A minimal valid WebP header followed by filler. */
function webp(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x20);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(size - 8, 4);
  b.write('WEBP', 8, 'ascii');
  return b;
}

function png(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x20);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  return b;
}

function jpeg(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x20);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(b, 0);
  return b;
}

/** A GIF — a real image format the catalog deliberately does not accept. */
function gif(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x20);
  b.write('GIF89a', 0, 'ascii');
  return b;
}

function upload(bytes: Buffer, label = 'Custom', type = 'image/webp') {
  const form = new FormData();
  // A Uint8Array view rather than the Buffer itself: Buffer is not a BlobPart
  // under this TS config, though it works at runtime.
  form.set('file', new Blob([new Uint8Array(bytes)], { type }), 'art.webp');
  form.set('label', label);
  return new Request('http://localhost/x', { method: 'POST', body: form });
}

async function makeLeader() {
  const [row] = await db.insert(leaders)
    .values({ name: 'Yamato', colors: ['green'], setCode: 'OP06-022' }).returning();
  return row;
}

describe('POST /api/admin/leaders/[id]/images', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  it('403s without the admin role', async () => {
    const leader = await makeLeader();
    asPlayer();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(webp()), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(403);
  });

  it('stores a webp and makes it the default when it is the first', async () => {
    const leader = await makeLeader();
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(webp()), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(200);
    const rows = await db.select().from(leaderImages).where(eq(leaderImages.leaderId, leader.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].isDefault).toBe(true);
    expect(rows[0].mimeType).toBe('image/webp');
  });

  it('does not steal the default from an existing image', async () => {
    const leader = await makeLeader();
    const bytes = webp();
    await db.insert(leaderImages).values({
      leaderId: leader.id, label: 'Base', data: bytes, mimeType: 'image/webp',
      width: 240, height: 336, byteSize: bytes.byteLength, checksum: 'x', isDefault: true,
    });
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    await POST(upload(webp(3000)), { params: Promise.resolve({ id: leader.id }) });
    const rows = await db.select().from(leaderImages)
      .where(eq(leaderImages.leaderId, leader.id)).orderBy(asc(leaderImages.sortOrder));
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.label).toBe('Base');
  });

  it('rejects a body over the cap', async () => {
    const leader = await makeLeader();
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(webp(600 * 1024)), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported format however it is labelled', async () => {
    // A client can claim any content type; the signature is the only thing that
    // is actually true about the bytes. This one really is a GIF and really is
    // called a WebP, and the signature is what decides.
    const leader = await makeLeader();
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(gif()), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(400);
  });

  /*
   * The crop is re-encoded by a canvas, and `toBlob` silently hands back PNG
   * when the browser cannot encode WebP — so insisting on WebP locked those
   * browsers out of uploading anything at all. The stored mimeType is what the
   * bytes actually are, and /api/leader-images serves that back verbatim.
   */
  it.each([
    ['png', () => png(), 'image/png'],
    ['jpeg', () => jpeg(), 'image/jpeg'],
    ['webp', () => webp(), 'image/webp'],
  ])('accepts %s and records what the bytes really are', async (_name, make, expected) => {
    const leader = await makeLeader();
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    // Deliberately mislabelled: the declared type must not decide anything.
    const res = await POST(upload(make(), 'Custom', 'application/octet-stream'),
      { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(leaderImages).where(eq(leaderImages.leaderId, leader.id));
    expect(row.mimeType).toBe(expected);
  });
});

describe('PATCH/DELETE /api/admin/images/[id]', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  async function twoImages() {
    const leader = await makeLeader();
    const bytes = webp();
    const common = {
      leaderId: leader.id, data: bytes, mimeType: 'image/webp',
      width: 240, height: 336, byteSize: bytes.byteLength,
    };
    const [base] = await db.insert(leaderImages)
      .values({ ...common, label: 'Base', checksum: 'a', isDefault: true, sortOrder: 0 }).returning();
    const [alt] = await db.insert(leaderImages)
      .values({ ...common, label: 'p1', checksum: 'b', sortOrder: 1 }).returning();
    return { leader, base, alt };
  }

  const patch = (b: unknown) => new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(b) });

  it('renames a label', async () => {
    const { alt } = await twoImages();
    asAdmin();
    const { PATCH } = await import('./admin/images/[id]/route');
    const res = await PATCH(patch({ label: 'Alternate Art' }), { params: Promise.resolve({ id: alt.id }) });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(leaderImages).where(eq(leaderImages.id, alt.id));
    expect(row.label).toBe('Alternate Art');
  });

  it('moves the default without violating the one-default constraint', async () => {
    const { base, alt } = await twoImages();
    asAdmin();
    const { PATCH } = await import('./admin/images/[id]/route');
    const res = await PATCH(patch({ isDefault: true }), { params: Promise.resolve({ id: alt.id }) });
    expect(res.status).toBe(200);
    const rows = await db.select().from(leaderImages);
    expect(rows.find((r) => r.id === alt.id)?.isDefault).toBe(true);
    expect(rows.find((r) => r.id === base.id)?.isDefault).toBe(false);
  });

  it('promotes a survivor when the default is deleted', async () => {
    // A leader with images but no default renders as a blank slot, which reads
    // as a bug rather than as a deletion.
    const { base, alt } = await twoImages();
    asAdmin();
    const { DELETE } = await import('./admin/images/[id]/route');
    await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: base.id }),
    });
    const rows = await db.select().from(leaderImages);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(alt.id);
    expect(rows[0].isDefault).toBe(true);
  });

  it('403s without the admin role', async () => {
    const { alt } = await twoImages();
    asPlayer();
    const { PATCH } = await import('./admin/images/[id]/route');
    const res = await PATCH(patch({ label: 'X' }), { params: Promise.resolve({ id: alt.id }) });
    expect(res.status).toBe(403);
  });
});
