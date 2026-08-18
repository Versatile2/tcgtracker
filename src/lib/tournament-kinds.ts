import type { TournamentType } from './dto';

/**
 * Types that are casual games rather than events, and so sit outside the
 * competitive record: they never count toward your overall win rate, your
 * tournament count, or achievements. They do count toward opponent and matchup
 * statistics, which is the whole reason for logging them.
 *
 * One constant rather than a `<> 'freeplay'` fragment repeated at each call
 * site, because those drifted the moment a second casual type existed.
 *
 * Freeplay and match differ in exactly one place: the per-meta breakdown
 * includes freeplay and excludes matches, since a match records no meta. That
 * one exception lives in `aggregateByMeta` rather than here.
 */
// Mutable rather than `as const`: drizzle's notInArray takes a mutable array,
// and the annotation still rejects a type that is not a real tournament type.
export const CASUAL_TYPES: TournamentType[] = ['freeplay', 'match'];

/** A single game with no event around it — exactly one round. */
export const MATCH_TYPE = 'match' as const satisfies TournamentType;
