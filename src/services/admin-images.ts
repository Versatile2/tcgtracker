import { and, asc, eq, ne } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaderImages } from '../db/schema';
import { NotFoundError, ValidationError } from '../lib/errors';

type DB = NodePgDatabase<typeof schema>;

export const MAX_IMAGE_BYTES = 512 * 1024;

/**
 * What these bytes actually are, or null if it is nothing we store.
 *
 * The declared content type is whatever the client felt like sending; a
 * signature is the only statement about the bytes that the bytes themselves
 * make, so it is the only one trusted here.
 *
 * Three formats rather than WebP alone because the crop is re-encoded by a
 * canvas, and `toBlob` silently returns PNG when the browser cannot encode
 * WebP — insisting on WebP locked those browsers out of uploading at all.
 */
export function detectImageType(bytes: Buffer): 'image/webp' | 'image/png' | 'image/jpeg' | null {
  if (bytes.length > 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';

  if (bytes.length > 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';

  if (bytes.length > 3
    && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

  return null;
}

export async function addLeaderImage(db: DB, leaderId: string, bytes: Buffer, label: string) {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ValidationError('Image too large.');
  const mimeType = detectImageType(bytes);
  if (!mimeType) throw new ValidationError('Image must be a WebP, PNG or JPEG.');

  const existing = await db.select({ sortOrder: leaderImages.sortOrder })
    .from(leaderImages).where(eq(leaderImages.leaderId, leaderId));

  const [row] = await db.insert(leaderImages).values({
    leaderId,
    cardImageId: null,
    label,
    data: bytes,
    mimeType,
    width: 240,
    height: 336,
    byteSize: bytes.byteLength,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    // First image in, first image shown. Later uploads never displace a default
    // the owner chose — that is what the star in the panel is for.
    isDefault: existing.length === 0,
    sortOrder: existing.length,
  }).returning({ id: leaderImages.id, label: leaderImages.label, isDefault: leaderImages.isDefault });

  return row;
}

export async function updateLeaderImage(db: DB, id: string, patch: { label?: string; isDefault?: boolean }) {
  const [image] = await db.select().from(leaderImages).where(eq(leaderImages.id, id)).limit(1);
  if (!image) throw new NotFoundError('No such image.');

  return db.transaction(async (tx) => {
    if (patch.isDefault) {
      // Clear first: the partial unique index rejects two defaults, so the order
      // of these two statements is the difference between working and erroring.
      await tx.update(leaderImages).set({ isDefault: false })
        .where(and(eq(leaderImages.leaderId, image.leaderId), ne(leaderImages.id, id)));
    }
    const [row] = await tx.update(leaderImages)
      .set({
        ...(patch.label === undefined ? {} : { label: patch.label }),
        ...(patch.isDefault === undefined ? {} : { isDefault: patch.isDefault }),
      })
      .where(eq(leaderImages.id, id))
      .returning({ id: leaderImages.id, label: leaderImages.label, isDefault: leaderImages.isDefault });
    return row;
  });
}

export async function deleteLeaderImage(db: DB, id: string) {
  const [image] = await db.select().from(leaderImages).where(eq(leaderImages.id, id)).limit(1);
  if (!image) throw new NotFoundError('No such image.');

  return db.transaction(async (tx) => {
    await tx.delete(leaderImages).where(eq(leaderImages.id, id));
    if (!image.isDefault) return { ok: true };

    // Leaving a leader with images but no default renders a blank slot, which
    // reads as a bug rather than as a deletion.
    const [survivor] = await tx.select({ id: leaderImages.id }).from(leaderImages)
      .where(eq(leaderImages.leaderId, image.leaderId))
      .orderBy(asc(leaderImages.sortOrder)).limit(1);
    if (survivor) {
      await tx.update(leaderImages).set({ isDefault: true }).where(eq(leaderImages.id, survivor.id));
    }
    return { ok: true };
  });
}
