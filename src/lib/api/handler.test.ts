import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { errorToResponse, UnauthorizedError } from './handler';
import { NotFoundError, ConflictError, ValidationError } from '../errors';

async function status(err: unknown) {
  const res = errorToResponse(err);
  return { code: res.status, body: await res.json() };
}

describe('errorToResponse', () => {
  it('maps NotFoundError to 404', async () => {
    expect((await status(new NotFoundError())).code).toBe(404);
  });
  it('maps ConflictError to 409', async () => {
    expect((await status(new ConflictError())).code).toBe(409);
  });
  it('maps ValidationError and ZodError to 400', async () => {
    expect((await status(new ValidationError())).code).toBe(400);
    const zerr = new ZodError([]);
    expect((await status(zerr)).code).toBe(400);
  });
  it('maps UnauthorizedError to 401', async () => {
    expect((await status(new UnauthorizedError())).code).toBe(401);
  });
  it('maps unknown to 500', async () => {
    expect((await status(new Error('boom'))).code).toBe(500);
  });
});
