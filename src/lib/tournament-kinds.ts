import type { TournamentType } from './dto';

/**
 * Sessions that live in the Freeplay segment.
 *
 * Freeplay used to *be* a type, and every call site asked `type === 'freeplay'`
 * directly. That stopped working when Ranked Simulator arrived, because the
 * same kind of event can be logged as a tournament or as a freeplay session and
 * the segment — not the label — is what decides how it counts. So the two ideas
 * are separated: a type says what was played, this set says where it lives.
 *
 * `testing` lives here too. It was offered as a tournament type for as long as
 * freeplay was a single option, which forced a deck-testing night to declare
 * one leader and put it in the competitive record. It is a session.
 */
export const FREEPLAY_TYPES: TournamentType[] = [
  'freeplay', 'freeplay_sim', 'freeplay_sim_casual', 'freeplay_friend',
  'freeplay_locals', 'freeplay_gauntlet', 'testing', 'freeplay_teaching',
];

/** Whether a session belongs to the Freeplay segment: no leader of its own, a deck per round. */
export const isFreeplay = (type: TournamentType) => FREEPLAY_TYPES.includes(type);

/**
 * Types that are casual games rather than events, and so sit outside the
 * competitive record: they never count toward your overall win rate, your
 * tournament count, or achievements. They do count toward opponent and matchup
 * statistics, which is the whole reason for logging them.
 *
 * One constant rather than a `<> 'freeplay'` fragment repeated at each call
 * site, because those drifted the moment a second casual type existed.
 *
 * Note what is *not* here: `ranked_sim`. Ranked play logged as a tournament is
 * part of the competitive record, and the identical games logged as a freeplay
 * session are not. That is the point of keeping the segment and the label
 * apart — the player decides which one a session was.
 *
 * Freeplay and match differ in exactly one place: the per-meta breakdown
 * includes freeplay and excludes matches, since a match records no meta. That
 * one exception lives in `aggregateByMeta` rather than here.
 */
// Mutable rather than `as const`: drizzle's notInArray takes a mutable array,
// and the annotation still rejects a type that is not a real tournament type.
export const CASUAL_TYPES: TournamentType[] = [...FREEPLAY_TYPES, 'match'];

/** A single game with no event around it — exactly one round. */
export const MATCH_TYPE = 'match' as const satisfies TournamentType;

/** Offered when creating a tournament, in the order the strip reads. */
export const TOURNAMENT_TYPES: TournamentType[] = [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'ranked_sim',
];
