import { ZodError } from 'zod';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NotFoundError, ConflictError, ValidationError } from '../errors';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') { super(message); this.name = 'UnauthorizedError'; }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') { super(message); this.name = 'ForbiddenError'; }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

export function errorToResponse(err: unknown): Response {
  if (err instanceof UnauthorizedError) return json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return json({ error: err.message }, { status: 403 });
  if (err instanceof NotFoundError) return json({ error: err.message }, { status: 404 });
  if (err instanceof ConflictError) return json({ error: err.message }, { status: 409 });
  if (err instanceof ValidationError) return json({ error: err.message }, { status: 400 });
  if (err instanceof ZodError) return json({ error: 'Invalid input', issues: err.issues }, { status: 400 });
  console.error(err);
  return json({ error: 'Internal error' }, { status: 500 });
}

export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

/**
 * Whether this user holds the admin role.
 *
 * The session token carries public metadata only once the Clerk dashboard's
 * "Customize session token" is set to {"metadata": "{{user.public_metadata}}"}.
 * That is instance-level and has no Backend API equivalent, so an instance that
 * has not had it done locks every admin out with nothing to explain it — which
 * is exactly what happened on this one.
 *
 * So the claim is treated as a cache: read it when it is there, ask Clerk when
 * it is not. Both answers come from the same authority — `publicMetadata` is
 * what grants the role — so the fallback is not a weaker check, only a slower
 * one. A failure to reach Clerk denies rather than admits.
 */
export async function hasAdminRole(
  sessionClaims: unknown,
  userId: string,
): Promise<boolean> {
  const claimed = (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role;
  if (claimed !== undefined) return claimed === 'admin';

  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return (user.publicMetadata as { role?: string } | undefined)?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * The signed-in user id, provided they hold the admin role.
 *
 * This is the second of two barriers — src/proxy.ts is the first. The
 * redundancy is deliberate: a mis-written matcher opens the whole admin area
 * with nothing to signal it, and this turns that mistake into a 403 rather than
 * a silent breach.
 */
export async function requireAdmin(): Promise<string> {
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new UnauthorizedError();
  if (!(await hasAdminRole(sessionClaims, userId))) throw new ForbiddenError();
  return userId;
}
