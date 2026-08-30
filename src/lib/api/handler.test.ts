import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }));

describe('requireAdmin', () => {
  beforeEach(() => { auth.mockReset(); });

  it('returns the user id when the session claims the admin role', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: { metadata: { role: 'admin' } } });
    const { requireAdmin } = await import('./handler');
    await expect(requireAdmin()).resolves.toBe('user_1');
  });

  it('throws for a signed-in user with no role', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: {} });
    const { requireAdmin, ForbiddenError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws for a signed-in user with some other role', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: { metadata: { role: 'player' } } });
    const { requireAdmin, ForbiddenError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws Unauthorized when nobody is signed in', async () => {
    auth.mockResolvedValue({ userId: null });
    const { requireAdmin, UnauthorizedError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('maps ForbiddenError to a 403', async () => {
    const { errorToResponse, ForbiddenError } = await import('./handler');
    const res = errorToResponse(new ForbiddenError());
    expect(res.status).toBe(403);
  });
});
