import type { TournamentType } from './dto';

/**
 * The tournament type you last created. Players run the same kind of event over
 * and over — a season of locals, a run of regionals — so the last one is a far
 * better default than always starting at "Local".
 *
 * Local, like the recent-leaders list, and for the same reasons: no round trip,
 * works with no signal, and it is a preference about this device rather than
 * data worth a column.
 *
 * The `crewstat-` prefix is fixed by PRODUCT.md. This is a new key, not a
 * rename.
 */
const KEY = 'crewstat-last-tournament-type';

/** Null when nothing is remembered, or when storage is unreadable. */
export function lastTournamentType(): TournamentType | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (raw as TournamentType) : null;
  } catch {
    // Reading storage can itself throw in a locked-down or private-mode browser.
    return null;
  }
}

export function rememberTournamentType(type: TournamentType): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, type);
  } catch {
    // A full or blocked store costs the shortcut, never the tournament.
  }
}

/**
 * The remembered type first, then the rest in their usual order.
 *
 * Deliberately computed from what was remembered rather than from the current
 * selection: reordering on every tap would slide the next choice out from under
 * the player's finger. The lead is settled when the screen opens and stays put.
 *
 * An unknown or no-longer-offered type (freeplay, once it moved to its own tab)
 * is ignored rather than prepended.
 */
export function orderTypes(types: TournamentType[], lead: TournamentType | null): TournamentType[] {
  if (!lead || !types.includes(lead)) return types;
  return [lead, ...types.filter((t) => t !== lead)];
}
