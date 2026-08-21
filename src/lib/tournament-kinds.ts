import type { TournamentType } from './dto';

/**
 * The types that live in the Sessions segment.
 *
 * There was once a single type — `freeplay`, renamed to `session` in 0012 — and
 * every call site asked `type === 'freeplay'` directly. That stopped working
 * when Ranked Simulator arrived, because the same kind of event can be logged
 * as a tournament or as a session, and the segment — not the label — is what
 * decides how it counts. So the two ideas are separated: a type says what was
 * played, this set says where it lives.
 *
 * `testing` lives here too, and keeps its name because it already describes
 * itself. It was offered as a tournament type for as long as there was only one
 * session type, which forced a deck-testing night to declare one leader and put
 * it in the competitive record. It is a session.
 */
export const SESSION_TYPES: TournamentType[] = [
  'session', 'session_sim', 'session_sim_casual', 'session_friend',
  'session_locals', 'session_gauntlet', 'testing', 'session_teaching',
];

/** Whether a row belongs to the Sessions segment: no leader of its own, a deck per round. */
export const isSession = (type: TournamentType) => SESSION_TYPES.includes(type);

/**
 * Types that are casual games rather than events, and so sit outside the
 * competitive record: they never count toward your overall win rate, your
 * tournament count, or achievements. They do count toward opponent and matchup
 * statistics, which is the whole reason for logging them.
 *
 * One constant rather than a `<> 'session'` fragment repeated at each call
 * site, because those drifted the moment a second casual type existed.
 *
 * Note what is *not* here: `ranked_sim`. Ranked play logged as a tournament is
 * part of the competitive record, and the identical games logged as a session
 * are not. That is the point of keeping the segment and the label apart — the
 * player decides which one a run of games was.
 *
 * Sessions and free play differ in exactly one place: the per-meta breakdown
 * includes sessions and excludes free play. That one exception lives in
 * `aggregateByMeta` rather than here.
 */
// Mutable rather than `as const`: drizzle's notInArray takes a mutable array,
// and the annotation still rejects a type that is not a real tournament type.
export const CASUAL_TYPES: TournamentType[] = [...SESSION_TYPES, 'match'];

/** A single game with no event around it — exactly one round. Shown as "Free Play". */
export const MATCH_TYPE = 'match' as const satisfies TournamentType;

/** Offered when creating a tournament, in the order the strip reads. */
export const TOURNAMENT_TYPES: TournamentType[] = [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'ranked_sim',
];
