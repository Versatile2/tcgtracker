import type { GameLog } from './dto';

export type CsvValue = string | number | boolean | null | undefined;

// Excel and Sheets treat a leading =, +, - or @ as the start of a formula, so a
// leader named "-Luffy" would execute rather than display. Prefixing with an
// apostrophe forces the cell to be read as text.
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  // Quote when the delimiter, a quote, a newline, or edge whitespace would
  // otherwise change how the field parses.
  if (/["\n\r,]/.test(text) || text !== text.trim()) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** Serialize to RFC 4180 CSV. CRLF line endings keep Excel happy. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** One flat row per round, carrying its tournament's context for pivoting. */
export type ExportRow = {
  tournamentId: string;
  tournamentName: string | null;
  tournamentType: string;
  playedOn: string;
  status: string;
  myLeader: string | null;
  tournamentMeta: string | null;
  roundNumber: number | null;
  roundKind: string | null;
  opponentLeader: string | null;
  opponentMeta: string | null;
  result: string | null;
  playOrder: string | null;
  wonDieRoll: boolean | null;
  games: GameLog[] | null;
  notes: string | null;
};

export const EXPORT_HEADERS = [
  'tournament_id', 'tournament_name', 'tournament_type', 'tournament_date', 'tournament_status',
  'my_leader', 'tournament_meta', 'round_number', 'round_kind', 'opponent_leader', 'opponent_meta',
  'result', 'play_order', 'won_die_roll', 'games', 'notes',
];

/** A best-of-3 as `W(first);L(second);W(first)`; play order omitted when unknown. */
export function formatGames(games: GameLog[] | null): string {
  if (!games || games.length === 0) return '';
  return games
    .map((g) => `${g.result === 'win' ? 'W' : 'L'}${g.playOrder ? `(${g.playOrder})` : ''}`)
    .join(';');
}

function toCells(row: ExportRow): CsvValue[] {
  return [
    row.tournamentId, row.tournamentName, row.tournamentType, row.playedOn, row.status,
    row.myLeader, row.tournamentMeta, row.roundNumber, row.roundKind, row.opponentLeader,
    row.opponentMeta, row.result, row.playOrder, row.wonDieRoll, formatGames(row.games), row.notes,
  ];
}

/**
 * Leaders and metas are exported by name rather than id: the file is for a
 * human with a spreadsheet, and ids mean nothing outside the database.
 * `tournament_id` stays as the grouping key.
 */
export function exportToCsv(rows: ExportRow[]): string {
  return toCsv(EXPORT_HEADERS, rows.map(toCells));
}
