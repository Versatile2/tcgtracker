'use client';
import type { OutboxEntry, OutboxOp } from './types';

// Keeps the established `crewstat-*` prefix: renaming storage keys resets
// existing users' data.
export const OUTBOX_KEY = 'crewstat-outbox';

const EMPTY: OutboxEntry[] = [];

// getSnapshot must be referentially stable between writes or useSyncExternalStore
// re-renders forever, so the parsed queue is cached and only replaced on write.
let cache: OutboxEntry[] | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  // Access itself can throw in a locked-down/private-mode browser.
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const OP_KINDS: OutboxOp['kind'][] = [
  'tournament.create', 'tournament.update', 'tournament.delete',
  'tournament.finish', 'tournament.reopen',
  'round.create', 'round.update', 'round.delete',
];

function isEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<OutboxEntry>;
  return (
    typeof e.opId === 'string' &&
    typeof e.createdAt === 'number' &&
    typeof e.attempts === 'number' &&
    typeof e.op === 'object' && e.op !== null &&
    OP_KINDS.includes((e.op as OutboxOp).kind) &&
    typeof (e.op as OutboxOp).tournamentId === 'string'
  );
}

export function readOutbox(): OutboxEntry[] {
  if (cache) return cache;
  const store = storage();
  if (!store) {
    cache = EMPTY;
    return cache;
  }
  try {
    const raw = store.getItem(OUTBOX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // Drop anything unrecognisable rather than letting one bad entry wedge the
    // queue — a stuck entry would block every later write behind it.
    cache = Array.isArray(parsed) ? parsed.filter(isEntry) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

export function writeOutbox(next: OutboxEntry[]): void {
  cache = next;
  const store = storage();
  if (store) {
    try {
      if (next.length === 0) store.removeItem(OUTBOX_KEY);
      else store.setItem(OUTBOX_KEY, JSON.stringify(next));
    } catch {
      // Out of quota or private mode: the in-memory queue still flushes this
      // session, it just will not survive a reload.
      console.warn('Could not persist the offline queue');
    }
  }
  for (const notify of listeners) notify();
}

export function subscribeOutbox(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export const getOutboxSnapshot = (): OutboxEntry[] => readOutbox();
export const getOutboxServerSnapshot = (): OutboxEntry[] => EMPTY;

/** Test seam: forget the parsed cache so the next read hits localStorage again. */
export function resetOutboxCache(): void {
  cache = null;
}
