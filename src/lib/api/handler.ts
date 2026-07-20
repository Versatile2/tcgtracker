import { ZodError } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { NotFoundError, ConflictError, ValidationError } from '../errors';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') { super(message); this.name = 'UnauthorizedError'; }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

export function errorToResponse(err: unknown): Response {
  if (err instanceof UnauthorizedError) return json({ error: err.message }, { status: 401 });
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
