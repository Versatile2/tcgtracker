import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient, ApiError } from './api-client';

afterEach(() => { vi.restoreAllMocks(); });

describe('apiClient', () => {
  it('parses a successful list response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: '1' }]), { status: 200 })));
    const result = await apiClient.listTournaments();
    expect(result).toEqual([{ id: '1' }]);
  });

  it('throws ApiError with status and message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Tournament is locked' }), { status: 409 })));
    await expect(apiClient.finishTournament('x')).rejects.toMatchObject({ status: 409, message: 'Tournament is locked' });
    await expect(apiClient.finishTournament('x')).rejects.toBeInstanceOf(ApiError);
  });
});
