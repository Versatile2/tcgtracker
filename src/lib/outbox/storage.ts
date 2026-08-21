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
  'tournament.finish', 'tournament.reopen', 'tournament.convert',
  'round.create', 'round.update', 'round.delete',
];

/**
 * Stored type values renamed by migration 0012. A queue written before that
 * deploy still holds the old spelling, and the server's enum no longer accepts
 * it — so without this rewrite a session logged offline is rejected on flush
 * and the game is gone. Applied on read, ahead of `isEntry`, and written back
 * on the next persist.
 *
 * Idempotent: a value that is not a key here is returned untouched, so reading
 * an already-migrated queue does nothing.
 *
 * These are the only string literals in `src/` outside `segmentFromTab` that
 * still spell the retired word, and `session-guard.test.ts` allows both by name.
 */
const TYPE_RENAMES: Record<string, string> = {
  freeplay: 'session',
  freeplay_sim: 'session_sim',
  freeplay_sim_casual: 'session_sim_casual',
  freeplay_friend: 'session_friend',
  freeplay_locals: 'session_locals',
  freeplay_gauntlet: 'session_gauntlet',
  freeplay_teaching: 'session_teaching',
};

/** The op kinds whose payload carries a tournament type. */
const TYPED_OPS = new Set<OutboxOp['kind']>([
  'tournament.create', 'tournament.update', 'tournament.convert',
]);

function migrateTypes(entries: OutboxEntry[]): OutboxEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    if (!TYPED_OPS.has(entry.op.kind)) return entry;
    const payload = (entry.op as { payload?: { type?: string } }).payload;
    const renamed = payload?.type ? TYPE_RENAMES[payload.type] : undefined;
    if (!renamed) return entry;
    changed = true;
    return { ...entry, op: { ...entry.op, payload: { ...payload, type: renamed } } as OutboxOp };
  });
  return changed ? next : entries;
}

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
    // Rename before filtering: `isEntry` does not inspect the type, but the
    // order matters if it ever starts to, and a rewritten entry must never be
    // the thing that gets dropped.
    cache = Array.isArray(parsed) ? migrateTypes(parsed.filter(isEntry)) : EMPTY;
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
