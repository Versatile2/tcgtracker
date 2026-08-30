import { db } from '@/db/client';
import { findLeaderImage } from '@/services/leader-images';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

/**
 * Leader card art, addressed by image id.
 *
 * Unauthenticated on purpose: this is public card art, and `Cache-Control:
 * public` on an authenticated route would let the CDN hand one player's
 * response to another.
 *
 * `immutable` is not a gamble — image rows are never rewritten, so an id names
 * bytes that cannot change. Correcting a leader's art produces a new id, and
 * therefore a new URL, so no cache ever needs purging.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const image = await findLeaderImage(db, id);
  if (!image) return new Response('Not found', { status: 404 });

  const etag = `"${image.checksum}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(new Uint8Array(image.data), {
    status: 200,
    headers: {
      'content-type': image.mimeType,
      'cache-control': 'public, max-age=31536000, immutable',
      etag,
    },
  });
}
