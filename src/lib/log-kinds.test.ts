import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOG_KINDS, STAT_SURFACES, logKind, type LogKindKey } from './log-kinds';
import { CASUAL_TYPES, SESSION_TYPES, MATCH_TYPE, TOURNAMENT_TYPES } from './tournament-kinds';
import type { TournamentType } from './dto';
import type { Segment } from '../components/tournaments/segment';

/*
 * The explainer makes four promises per kind — record, meta, achievements,
 * matchups — and nothing at runtime forces them to be true. A player who reads
 * "counts toward your record" and then cannot find the game is worse off than
 * one who was never told anything.
 *
 * So these tests derive the same answers from the constants the queries
 * actually use, and fail when the copy and the rules part company. If a rule
 * changes, the copy fails the build rather than quietly lying.
 */

/** The types that live in each segment, as `tournament-list.tsx` splits them. */
const TYPES_IN: Record<LogKindKey, TournamentType[]> = {
  tournaments: TOURNAMENT_TYPES,
  sessions: SESSION_TYPES,
  matches: [MATCH_TYPE],
};

// Derived the way the services derive them, not copied from the copy.
const inCompetitiveRecord = (t: TournamentType) => !CASUAL_TYPES.includes(t);
// `aggregateByMeta` excludes matches whichever way its session switch is set.
const inPerMetaBreakdown = (t: TournamentType) => t !== MATCH_TYPE;
// Opponent and matchup stats are the whole reason casual games are logged.
const inMatchupStats = () => true;

describe('log kinds', () => {
  it('describes each of the three segments exactly once', () => {
    const keys = LOG_KINDS.map((k) => k.key);
    expect(keys).toEqual(['tournaments', 'sessions', 'matches']);
    // A compile-time check that the explainer's keys and the list's segments
    // are the same union — a segment added to one must reach the other.
    const asSegments: Segment[] = keys;
    expect(asSegments).toHaveLength(3);
  });

  it('promises a record only where the competitive record includes it', () => {
    for (const kind of LOG_KINDS) {
      for (const type of TYPES_IN[kind.key]) {
        expect({ type, counts: kind.counted.record }).toEqual({ type, counts: inCompetitiveRecord(type) });
      }
    }
  });

  it('promises achievements on the same terms as the record', () => {
    for (const kind of LOG_KINDS) {
      expect(kind.counted.achievements).toBe(kind.counted.record);
      for (const type of TYPES_IN[kind.key]) {
        expect({ type, counts: kind.counted.achievements }).toEqual({ type, counts: inCompetitiveRecord(type) });
      }
    }
  });

  it('promises the per-meta breakdown everywhere but matches', () => {
    for (const kind of LOG_KINDS) {
      for (const type of TYPES_IN[kind.key]) {
        expect({ type, counts: kind.counted.meta }).toEqual({ type, counts: inPerMetaBreakdown(type) });
      }
    }
    // The one place sessions and matches differ, and the reason both are worth
    // explaining separately rather than as one "casual" bucket.
    expect(logKind('sessions').counted.meta).toBe(true);
    expect(logKind('matches').counted.meta).toBe(false);
  });

  it('promises matchup stats for all three', () => {
    for (const kind of LOG_KINDS) {
      for (const type of TYPES_IN[kind.key]) {
        expect({ type, counts: kind.counted.matchups }).toEqual({ type, counts: inMatchupStats() });
      }
    }
  });

  it('rates every surface for every kind', () => {
    for (const kind of LOG_KINDS) {
      for (const { key } of STAT_SURFACES) {
        expect(typeof kind.counted[key]).toBe('boolean');
      }
    }
  });

  it('sends you somewhere that exists', () => {
    for (const kind of LOG_KINDS) {
      expect(existsSync(resolve(__dirname, '..', 'app', kind.href.slice(1), 'page.tsx'))).toBe(true);
    }
  });

  it('says something in every field the UI renders', () => {
    for (const kind of LOG_KINDS) {
      expect(kind.shape.length).toBeGreaterThan(10);
      expect(kind.counts.length).toBeGreaterThan(5);
      expect(kind.blurb.length).toBeGreaterThan(60);
      // The sheet puts `shape` and `counts` on two lines of a list row, where a
      // sentence would wrap into a paragraph and push the next row off screen.
      expect(kind.shape.length).toBeLessThan(48);
      expect(kind.counts.length).toBeLessThan(40);
    }
  });
});
