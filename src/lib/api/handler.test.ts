import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
const getUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => auth(),
  clerkClient: async () => ({ users: { getUser } }),
}));

describe('requireAdmin', () => {
  beforeEach(() => { auth.mockReset(); getUser.mockReset(); getUser.mockResolvedValue({ publicMetadata: {} }); });

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

/*
 * The session token only carries public metadata once the Clerk dashboard's
 * "Customize session token" has been set, which is instance-level and has no
 * Backend API equivalent. Until then every admin is locked out with nothing to
 * explain it, so the role is read from Clerk directly when the claim is absent.
 *
 * This is the same authority either way — publicMetadata is what grants the
 * role. The claim is a cache of it, not a second, weaker source.
 */
describe('requireAdmin without the session-token claim', () => {
  beforeEach(() => { auth.mockReset(); getUser.mockReset(); });

  it('falls back to the Clerk API and admits a real admin', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: {} });
    getUser.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    const { requireAdmin } = await import('./handler');
    await expect(requireAdmin()).resolves.toBe('user_1');
    expect(getUser).toHaveBeenCalledWith('user_1');
  });

  it('still refuses someone whose metadata does not grant the role', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: {} });
    getUser.mockResolvedValue({ publicMetadata: { role: 'player' } });
    const { requireAdmin, ForbiddenError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('does not call Clerk when the claim already answers', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: { metadata: { role: 'admin' } } });
    const { requireAdmin } = await import('./handler');
    await expect(requireAdmin()).resolves.toBe('user_1');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses rather than throwing when Clerk is unreachable', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: {} });
    getUser.mockRejectedValue(new Error('network'));
    const { requireAdmin, ForbiddenError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
