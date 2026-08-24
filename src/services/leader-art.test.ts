import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { listLeaderArt, setLeaderArt } from './leader-art';
import { ValidationError } from '../lib/errors';
import { LEADER_ART } from '../lib/leader-images';
import { EXTRA_ART } from '../lib/clean-art';
import { printingsOf } from '../lib/printings';

const db = getTestDb();
afterAll(closeTestDb);

// A real card with at least three printings, so "not the base" and "a different
// alternate" are distinguishable.
const CODE = 'OP06-022';
const [BASE, ALT, SPR] = LEADER_ART[CODE];

describe('leader art', () => {
  beforeEach(resetDb);

  it('starts empty', async () => {
    expect(await listLeaderArt(db, 'user_a')).toEqual({});
  });

  it('records a chosen printing and returns the whole map', async () => {
    const map = await setLeaderArt(db, 'user_a', { setCode: CODE, art: ALT });
    expect(map).toEqual({ [CODE]: ALT });
    expect(await listLeaderArt(db, 'user_a')).toEqual({ [CODE]: ALT });
  });

  it('overwrites an earlier choice rather than adding a second row', async () => {
    await setLeaderArt(db, 'user_a', { setCode: CODE, art: ALT });
    const map = await setLeaderArt(db, 'user_a', { setCode: CODE, art: SPR });
    expect(map).toEqual({ [CODE]: SPR });
  });

  it('forgets the choice when the base printing is picked again', async () => {
    await setLeaderArt(db, 'user_a', { setCode: CODE, art: ALT });
    // Absent already means "base art" to every reader, so the row is dropped
    // rather than stored as a redundant statement of the default.
    expect(await setLeaderArt(db, 'user_a', { setCode: CODE, art: BASE })).toEqual({});
  });

  it('keeps players apart', async () => {
    await setLeaderArt(db, 'user_a', { setCode: CODE, art: ALT });
    await setLeaderArt(db, 'user_b', { setCode: CODE, art: SPR });
    expect(await listLeaderArt(db, 'user_a')).toEqual({ [CODE]: ALT });
    expect(await listLeaderArt(db, 'user_b')).toEqual({ [CODE]: SPR });
  });

  it('rejects art belonging to a different card', async () => {
    // The column is bare text, so an unchecked value would store happily and
    // then render as a 404 everywhere that leader appears.
    await expect(setLeaderArt(db, 'user_a', { setCode: CODE, art: 'OP01-001_p1' }))
      .rejects.toThrow(ValidationError);
    expect(await listLeaderArt(db, 'user_a')).toEqual({});
  });

  it('rejects a set code with no bundled art', async () => {
    await expect(setLeaderArt(db, 'user_a', { setCode: 'NOPE-001', art: 'NOPE-001' }))
      .rejects.toThrow(ValidationError);
  });
});

/*
 * The picker offers `printingsOf`, so the server must accept exactly that list.
 * Validating against optcgapi's alone would show a player a collected printing
 * and then refuse to remember it.
 */
describe('what the server accepts', () => {
  beforeEach(resetDb);

  it('accepts every printing the picker offers', async () => {
    for (const art of printingsOf(CODE)) {
      await expect(setLeaderArt(db, 'user_a', { setCode: CODE, art })).resolves.toBeDefined();
    }
  });

  it('is the same list the picker uses, not a second copy of it', () => {
    expect(printingsOf(CODE)).toEqual([...LEADER_ART[CODE], ...(EXTRA_ART[CODE] ?? [])]);
  });

  it('still refuses a printing of no card at all', async () => {
    await expect(setLeaderArt(db, 'user_a', { setCode: CODE, art: `${CODE}_c99` }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
