import type { TournamentType } from './dto';

/** The two strips that remember what you picked last. */
export type TypeSegment = 'tournament' | 'session';

/**
 * The type you last created, per segment. Players run the same kind of thing
 * over and over — a season of locals, a month of gauntlets — so the last one is
 * a far better default than always starting at the head of the list.
 *
 * Two keys rather than one because the segments have nothing to say to each
 * other: a Regional logged last week must not open the session form on Ranked
 * Simulator. That used to be prevented by refusing to remember anything on the
 * session side at all, which was fine at two options and useless at eight.
 *
 * Local, like the recent-leaders list, and for the same reasons: no round trip,
 * works with no signal, and it is a preference about this device rather than
 * data worth a column.
 *
 * The `crewstat-` prefix is fixed by PRODUCT.md.
 */
const KEYS: Record<TypeSegment, string> = {
  tournament: 'crewstat-last-tournament-type',
  session: 'crewstat-last-session-type',
};

/** Null when nothing is remembered, or when storage is unreadable. */
export function lastType(segment: TypeSegment): TournamentType | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEYS[segment]);
    return raw ? (raw as TournamentType) : null;
  } catch {
    // Reading storage can itself throw in a locked-down or private-mode browser.
    return null;
  }
}

export function rememberType(segment: TypeSegment, type: TournamentType): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEYS[segment], type);
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
 * An unknown or no-longer-offered type (testing, once it moved to the session
 * segment) is ignored rather than prepended.
 */
export function orderTypes(types: TournamentType[], lead: TournamentType | null): TournamentType[] {
  if (!lead || !types.includes(lead)) return types;
  return [lead, ...types.filter((t) => t !== lead)];
}
