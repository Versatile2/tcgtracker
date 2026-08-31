import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/*
 * Leader card art is public game data, and the route serves it with
 * `Cache-Control: public` so a CDN can hold it. Protected, every image would
 * 307 to the sign-in page and no art would load anywhere.
 *
 * Nothing about a player is exposed by it: an image id says nothing without a
 * session that already lists it, and the response carries only card art.
 */
const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/leader-images/(.*)']);

/*
 * One prefix per surface rather than a decision repeated per route: every admin
 * endpoint lives under /api/admin, so the security model is a path.
 */
const isAdmin = createRouteMatcher(['/admin(.*)', '/api/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  await auth.protect();

  if (!isAdmin(req)) return;
  const { sessionClaims } = await auth();
  const role = (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role;
  if (role === 'admin') return;

  // A page nobody linked to may as well not exist; an API that 404s teaches its
  // client that the endpoint moved, which is a lie.
  return req.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    : NextResponse.rewrite(new URL('/404', req.url));
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
