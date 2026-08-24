import { Trophy, Shuffle, Swords, type LucideIcon } from 'lucide-react';

/**
 * The three kinds of thing you can log, described for the reader rather than
 * for the query planner.
 *
 * One module because the same three sentences are needed in four places — the
 * log sheet, each empty segment, Settings, and the comparison itself — and four
 * hand-written copies drifted apart the moment the stats rules moved. The
 * ✓/✗ flags below are the same rules `tournament-kinds.ts` and `stats.ts`
 * enforce, and `log-kinds.test.ts` fails if the two ever disagree.
 */

/** Matches `Segment` in `components/tournaments/segment.ts`; asserted in the test. */
export type LogKindKey = 'tournaments' | 'sessions' | 'matches';

/**
 * Where a kind of game shows up once it is logged. Deliberately the four
 * surfaces a player actually looks at, not the eight queries underneath — the
 * question being answered is "will this show up in my win rate", not "which
 * `notInArray` covers it".
 */
export type StatSurface = 'record' | 'meta' | 'achievements' | 'matchups';

export const STAT_SURFACES: { key: StatSurface; label: string }[] = [
  { key: 'record', label: 'Record' },
  { key: 'meta', label: 'Meta' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'matchups', label: 'Matchups' },
];

export type LogKind = {
  key: LogKindKey;
  /** Singular, as it appears in a sentence. */
  noun: string;
  /** Plural, for headings and counts. Not always noun + "s" — "free play" is not. */
  plural: string;
  /** The button that starts one. */
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line: what shape the thing is. */
  shape: string;
  /** One line: where it lands. Short enough to sit under `shape` in the sheet. */
  counts: string;
  /** The long form, shown in the comparison and in an empty segment. */
  blurb: string;
  counted: Record<StatSurface, boolean>;
};

/** Order is by how often the centre button is reached for, not by importance. */
export const LOG_KINDS: LogKind[] = [
  {
    key: 'tournaments',
    noun: 'tournament',
    plural: 'tournaments',
    label: 'New Tournament',
    href: '/tournaments/new',
    icon: Trophy,
    shape: 'An event you play several rounds of',
    counts: 'Counts toward everything',
    blurb:
      'One leader for the whole event, a round per opponent, and a placement at the end. This is your competitive record: it feeds your overall win rate, your per-meta breakdown and your achievements.',
    counted: { record: true, meta: true, achievements: true, matchups: true },
  },
  {
    key: 'sessions',
    noun: 'session',
    plural: 'sessions',
    label: 'New Session',
    href: '/sessions/new',
    icon: Shuffle,
    shape: 'Several games, changing deck as you go',
    counts: 'Matchups and meta, not your record',
    blurb:
      'A run of games in one sitting — deck testing, locals afterwards, a gauntlet on the sim. Every game records its own deck, so a session has no single leader. It sharpens your matchup and per-meta data while staying out of your record and achievements.',
    counted: { record: false, meta: true, achievements: false, matchups: true },
  },
  {
    key: 'matches',
    noun: 'free play',
    plural: 'free play',
    label: 'New Free Play',
    href: '/matches/new',
    icon: Swords,
    shape: 'A single game, on its own',
    counts: 'Matchups only',
    blurb:
      'One game, one opponent, no event around it. It exists so a pickup game still counts where it matters — your leader-vs-leader matchup data — without inventing a tournament to hold it.',
    counted: { record: false, meta: false, achievements: false, matchups: true },
  },
];

export const logKind = (key: LogKindKey): LogKind => LOG_KINDS.find((k) => k.key === key)!;

/**
 * The part no table can show: a segment is a choice, not a property of the
 * games. The same ranked run is part of your record as a tournament and outside
 * it as a session — see the note on `CASUAL_TYPES` in `tournament-kinds.ts`.
 */
export const KIND_CHOICE_NOTE =
  'The same games can be either. A ranked run logged as a tournament is part of your record; logged as a session it isn’t. You decide which one it was.';
