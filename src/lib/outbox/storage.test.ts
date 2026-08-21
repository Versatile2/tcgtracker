// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OUTBOX_KEY, readOutbox, writeOutbox, subscribeOutbox, resetOutboxCache,
} from './storage';
import type { OutboxEntry } from './types';

const T = '11111111-1111-4111-8111-111111111111';

const entry = (opId: string): OutboxEntry => ({
  opId,
  createdAt: 1,
  attempts: 0,
  op: { kind: 'tournament.finish', tournamentId: T },
});

beforeEach(() => {
  window.localStorage.clear();
  resetOutboxCache();
});

/**
 * A queue exactly as it was written by the bundle before migration 0012: the
 * old `freeplay*` spelling, serialised into localStorage and untouched by the
 * cache buster, which clears the query cache and not this.
 *
 * Written as raw JSON rather than through `writeOutbox` because these values no
 * longer typecheck — which is the point.
 */
const legacyQueue = (type: string, kind = 'tournament.create') => JSON.stringify([{
  opId: 'legacy',
  createdAt: 1,
  attempts: 0,
  op: { kind, tournamentId: T, payload: { id: T, type, playedOn: '2026-08-01' } },
}]);

describe('outbox type migration (0012)', () => {
  it('rewrites a session create queued under the old spelling', () => {
    window.localStorage.setItem(OUTBOX_KEY, legacyQueue('freeplay_locals'));
    const [entry] = readOutbox();
    // Without this the server rejects the payload on flush and the game is lost.
    expect((entry.op as { payload: { type: string } }).payload.type).toBe('session_locals');
  });

  it('rewrites every renamed value, and nothing else', () => {
    const cases = [
      ['freeplay', 'session'],
      ['freeplay_sim', 'session_sim'],
      ['freeplay_sim_casual', 'session_sim_casual'],
      ['freeplay_friend', 'session_friend'],
      ['freeplay_locals', 'session_locals'],
      ['freeplay_gauntlet', 'session_gauntlet'],
      ['freeplay_teaching', 'session_teaching'],
      // Never renamed: already named for what it is, and a tournament type.
      ['testing', 'testing'],
      ['local', 'local'],
      ['match', 'match'],
    ];
    for (const [before, after] of cases) {
      window.localStorage.setItem(OUTBOX_KEY, legacyQueue(before));
      resetOutboxCache();
      expect([before, (readOutbox()[0].op as { payload: { type: string } }).payload.type])
        .toEqual([before, after]);
    }
  });

  it('rewrites updates and converts, not just creates', () => {
    for (const kind of ['tournament.update', 'tournament.convert']) {
      window.localStorage.setItem(OUTBOX_KEY, legacyQueue('freeplay_friend', kind));
      resetOutboxCache();
      expect([kind, (readOutbox()[0].op as { payload: { type: string } }).payload.type])
        .toEqual([kind, 'session_friend']);
    }
  });

  it('leaves an already-migrated queue alone, and returns it stably', () => {
    window.localStorage.setItem(OUTBOX_KEY, legacyQueue('session_locals'));
    expect((readOutbox()[0].op as { payload: { type: string } }).payload.type).toBe('session_locals');
    // Same reference, or useSyncExternalStore re-renders forever.
    expect(readOutbox()).toBe(readOutbox());
  });

  it('keeps a queued convert instead of discarding it', () => {
    // `tournament.convert` was missing from OP_KINDS, so `isEntry` rejected it
    // and an offline conversion vanished on the next read.
    window.localStorage.setItem(OUTBOX_KEY, legacyQueue('local', 'tournament.convert'));
    expect(readOutbox()).toHaveLength(1);
  });
});

describe('outbox storage', () => {
  it('starts empty', () => {
    expect(readOutbox()).toEqual([]);
  });

  it('round-trips a queue through localStorage', () => {
    writeOutbox([entry('a'), entry('b')]);
    resetOutboxCache();
    expect(readOutbox().map((e) => e.opId)).toEqual(['a', 'b']);
  });

  it('returns a stable reference between writes', () => {
    // useSyncExternalStore re-renders in a loop if getSnapshot keeps returning
    // a fresh array.
    writeOutbox([entry('a')]);
    expect(readOutbox()).toBe(readOutbox());
  });

  it('clears the key when the queue empties', () => {
    writeOutbox([entry('a')]);
    writeOutbox([]);
    expect(window.localStorage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it('recovers from corrupt stored JSON instead of throwing', () => {
    window.localStorage.setItem(OUTBOX_KEY, '{not json');
    expect(readOutbox()).toEqual([]);
  });

  it('drops entries that do not look like ops', () => {
    window.localStorage.setItem(
      OUTBOX_KEY,
      JSON.stringify([entry('good'), { opId: 'bad' }, { opId: 'x', createdAt: 1, attempts: 0, op: { kind: 'nope' } }])
    );
    expect(readOutbox().map((e) => e.opId)).toEqual(['good']);
  });

  it('notifies subscribers on write and stops after unsubscribe', () => {
    const notify = vi.fn();
    const unsubscribe = subscribeOutbox(notify);
    writeOutbox([entry('a')]);
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeOutbox([entry('b')]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps serving the queue in memory when persistence fails', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => writeOutbox([entry('a')])).not.toThrow();
    expect(readOutbox().map((e) => e.opId)).toEqual(['a']);
    setItem.mockRestore();
    warn.mockRestore();
  });
});
