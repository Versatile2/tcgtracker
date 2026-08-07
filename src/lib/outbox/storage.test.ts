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
