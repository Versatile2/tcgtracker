import type { Achievement } from './achievements/definitions';
import type { TournamentSummaryDTO } from './dto';

/*
 * Level, XP and streak — all derived from history the client already holds,
 * never stored. A stored total can drift from the games it claims to describe;
 * a derived one cannot, and it costs no column, no migration and no round trip.
 *
 * Deliberate split from achievements: these measure the *habit* of logging, so
 * they count every game including casual ones. Achievements measure competitive
 * accomplishment and keep their existing scope.
 */

/** XP is paid for logging, with a bonus for winning. */
export const XP = {
  /** Every game you record, win or lose. */
  round: 10,
  /** On top of the round, for taking it. */
  win: 5,
  /** For seeing an event through and finishing it. */
  finishedEvent: 25,
} as const;

/**
 * Paying only for wins would teach a losing player to stop logging, and the
 * product exists for the data that logging produces. So a loss still pays — a
 * little less.
 */
export function xpForTournament(t: TournamentSummaryDTO): number {
  const { wins, losses, draws } = t.record;
  const games = wins + losses + draws;
  return games * XP.round + wins * XP.win + (t.status === 'locked' ? XP.finishedEvent : 0);
}

export function totalXp(tournaments: TournamentSummaryDTO[]): number {
  return tournaments.reduce((n, t) => n + xpForTournament(t), 0);
}

/**
 * A widening curve: each level costs a little more than the last, so early
 * levels arrive fast enough to signal that the system exists, and later ones
 * stay worth reaching. Level 1 starts at 0 XP.
 *
 * Cumulative XP to reach level n is 50·n·(n−1), i.e. 100 for level 2, 300 for
 * level 3, 600 for level 4. Inverted in closed form rather than looped so it
 * cannot be accidentally made O(level).
 */
export function levelFor(xp: number): { level: number; into: number; span: number; nextAt: number } {
  const level = Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 50)) / 2);
  const floorAt = 50 * level * (level - 1);
  const nextAt = 50 * (level + 1) * level;
  return { level, into: Math.max(0, xp) - floorAt, span: nextAt - floorAt, nextAt };
}

/**
 * ISO week key, e.g. "2026-W34". Weeks rather than days on purpose: locals run
 * weekly, so a daily streak would break constantly through no fault of the
 * player, and a streak that always breaks is worse than none at all.
 */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // Thursday of the current week determines the ISO year and week number.
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The week before the given one, by construction rather than by arithmetic on the label. */
function previousWeekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeek(d.toISOString().slice(0, 10));
}

export type Streak = {
  /** Consecutive weeks ending at this week or last week. Zero once it lapses. */
  weeks: number;
  /** True when this week has no game yet and the streak is still alive. */
  atRisk: boolean;
};

/**
 * Consecutive weeks containing at least one logged game, counted back from the
 * current week.
 *
 * A streak survives the current week being empty — the week is not over yet, so
 * calling it broken on Monday morning would be a lie. It is reported `atRisk`
 * instead, which is the state worth telling the player about.
 */
export function weekStreak(tournaments: TournamentSummaryDTO[], today: string): Streak {
  const played = new Set(tournaments.map((t) => isoWeek(t.playedOn)));
  const thisWeek = isoWeek(today);
  const lastWeek = previousWeekOf(today);

  const startedThisWeek = played.has(thisWeek);
  if (!startedThisWeek && !played.has(lastWeek)) return { weeks: 0, atRisk: false };

  let weeks = 0;
  let cursor = startedThisWeek ? today : new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  while (played.has(isoWeek(cursor))) {
    weeks += 1;
    cursor = new Date(new Date(`${cursor}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  }
  return { weeks, atRisk: !startedThisWeek };
}

export type Payoff = { key: string; name: string; remaining: number; label: string };

/**
 * The nearest achievement, phrased as what is left to do.
 *
 * This is the half of the design that most gamification skips. A reward the
 * player only learns about afterwards cannot make them look forward to the next
 * match; knowing they are one win away can.
 */
export function nextPayoff(achievements: Achievement[]): Payoff | null {
  const candidates = achievements
    .filter((a) => !a.unlocked && a.progress)
    .map((a) => ({ a, remaining: a.progress!.target - a.progress!.current }))
    .filter((c) => c.remaining > 0)
    // Fewest left first; where two are equally close, the one already started
    // wins, because it is the more believable next step. Untouched achievements
    // are deliberately *not* excluded — a brand-new player has progress on
    // nothing, and they are exactly who needs a reason to log the first game.
    .sort((x, y) =>
      x.remaining - y.remaining
      || y.a.progress!.current - x.a.progress!.current
      || x.a.name.localeCompare(y.a.name));

  const best = candidates[0];
  if (!best) return null;
  return {
    key: best.a.key,
    name: best.a.name,
    remaining: best.remaining,
    label: `${best.remaining} from ${best.a.name}`,
  };
}
