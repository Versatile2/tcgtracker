import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/*
 * Leader card art is public game data, and the route serves it with
 * `Cache-Control: public` so a CDN can hold it. Protected, every image would
 * 307 to the sign-in page and no art would load anywhere.
 *
 * Nothing about a player is exposed by it: an image id says nothing without a
 * session that already lists it, and the response carries only card art.
 */
const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/leader-images/(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
