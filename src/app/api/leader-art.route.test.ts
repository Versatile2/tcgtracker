import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { LEADER_ART } from '../../lib/leader-images';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

afterAll(closeTestDb);

const CODE = 'OP06-022';
const ALT = LEADER_ART[CODE][1];

const put = (body: unknown) =>
  new Request('http://test/api/leader-art', { method: 'PUT', body: JSON.stringify(body) });

describe('/api/leader-art', () => {
  beforeEach(resetDb);

  it('GET returns an empty map before anything is chosen', async () => {
    const { GET } = await import('./leader-art/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('PUT records a printing and answers with the whole map', async () => {
    const { PUT, GET } = await import('./leader-art/route');
    const res = await PUT(put({ setCode: CODE, art: ALT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ [CODE]: ALT });
    expect(await (await GET()).json()).toEqual({ [CODE]: ALT });
  });

  it('PUT rejects art that is not a printing of that card with 400', async () => {
    const { PUT } = await import('./leader-art/route');
    const res = await PUT(put({ setCode: CODE, art: 'OP01-001_p1' }));
    expect(res.status).toBe(400);
  });

  it('PUT rejects a malformed body with 400', async () => {
    const { PUT } = await import('./leader-art/route');
    expect((await PUT(put({ setCode: CODE }))).status).toBe(400);
    expect((await PUT(put({ setCode: '', art: '' }))).status).toBe(400);
  });
});
