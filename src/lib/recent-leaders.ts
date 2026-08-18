/**
 * The leaders you last picked, most recent first.
 *
 * Deliberately local rather than derived from stats: `stats.playedLeaders` and
 * `stats.opponents` are ordered by games played, which answers "what do you play
 * most", not "what did you just pick". At a venue those differ — you are on one
 * deck all day, and the answer needs no round trip and no connection.
 *
 * Scoped by role, so choosing an opponent never reorders your own decks.
 *
 * The `crewstat-` prefix is load-bearing: PRODUCT.md fixes it, and renaming an
 * existing key would strand a player's data. This is a new key, not a rename.
 */
const KEY = (role: string) => `crewstat-recent-leaders-${role}`;

/** How many to remember. Beyond a handful the strip head stops being a shortcut. */
export const RECENT_LIMIT = 8;

/** Reading storage can itself throw in a locked-down or private-mode browser. */
function read(role: string): string[] {
  try {
    const raw = window.localStorage.getItem(KEY(role));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function recentLeaders(role: string | undefined): string[] {
  if (!role || typeof window === 'undefined') return [];
  return read(role).slice(0, RECENT_LIMIT);
}

/** Moves `id` to the front, keeping the list deduped and capped. */
export function pushRecentLeader(role: string | undefined, id: string): string[] {
  if (!role || typeof window === 'undefined') return [];
  const next = [id, ...read(role).filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(KEY(role), JSON.stringify(next));
  } catch {
    // A full or blocked store costs the shortcut, never the selection itself.
  }
  return next;
}
