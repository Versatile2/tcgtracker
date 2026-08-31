import { ZodError } from 'zod';
import { auth } from '@clerk/nextjs/server';
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
 * The signed-in user id, provided they hold the admin role.
 *
 * The role is read from the session token rather than fetched per request,
 * which needs the Clerk session token to expose public metadata (dashboard:
 * Sessions → Customize session token → {"metadata": "{{user.public_metadata}}"}).
 *
 * This is the second of two barriers — src/proxy.ts is the first. The
 * redundancy is deliberate: a mis-written matcher opens the whole admin area
 * with nothing to signal it, and this turns that mistake into a 403 rather than
 * a silent breach.
 */
export async function requireAdmin(): Promise<string> {
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new UnauthorizedError();
  const role = (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role;
  if (role !== 'admin') throw new ForbiddenError();
  return userId;
}
