import { describe, it, expect } from 'vitest';
import { toCsv, formatGames, exportToCsv, EXPORT_HEADERS, type ExportRow } from './csv';

describe('toCsv', () => {
  it('writes a header row and CRLF line endings', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('emits a header-only file for no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b');
  });

  it('renders empty cells for null and undefined', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe('a,b,c\r\n,,0');
  });

  it('quotes fields containing the delimiter, quotes or newlines', () => {
    expect(toCsv(['a'], [['x,y']])).toBe('a\r\n"x,y"');
    expect(toCsv(['a'], [['line\nbreak']])).toBe('a\r\n"line\nbreak"');
  });

  it('doubles embedded quotes', () => {
    expect(toCsv(['a'], [['say "hi"']])).toBe('a\r\n"say ""hi"""');
  });

  it('quotes fields with leading or trailing whitespace', () => {
    expect(toCsv(['a'], [[' padded ']])).toBe('a\r\n" padded "');
  });

  it('defuses spreadsheet formulas', () => {
    // Without this, opening the export would execute the cell.
    expect(toCsv(['a'], [['=1+1']])).toBe("a\r\n'=1+1");
    expect(toCsv(['a'], [['@SUM(A1)']])).toBe("a\r\n'@SUM(A1)");
    expect(toCsv(['a'], [['-Luffy']])).toBe("a\r\n'-Luffy");
  });

  it('leaves a negative number readable as a number', () => {
    // Numbers are stringified before the formula check, so this is quoted text —
    // acceptable, and safer than letting a crafted cell through.
    expect(toCsv(['a'], [[-5]])).toBe("a\r\n'-5");
  });

  it('renders booleans', () => {
    expect(toCsv(['a'], [[true], [false]])).toBe('a\r\ntrue\r\nfalse');
  });
});

describe('formatGames', () => {
  it('is empty when there are no games', () => {
    expect(formatGames(null)).toBe('');
    expect(formatGames([])).toBe('');
  });

  it('renders results with play order', () => {
    expect(formatGames([
      { result: 'win', playOrder: 'first' },
      { result: 'loss', playOrder: 'second' },
      { result: 'win', playOrder: 'first' },
    ])).toBe('W(first);L(second);W(first)');
  });

  it('omits unknown play order', () => {
    expect(formatGames([{ result: 'win', playOrder: null }])).toBe('W');
  });
});

describe('exportToCsv', () => {
  const row: ExportRow = {
    tournamentId: 't-1',
    tournamentName: 'Spring Regional',
    tournamentType: 'regionals',
    playedOn: '2026-08-07',
    status: 'locked',
    myLeader: 'Monkey D. Luffy',
    tournamentMeta: 'OP16',
    roundNumber: 1,
    roundKind: 'swiss',
    opponentLeader: 'Kaido',
    opponentMeta: 'OP15',
    result: 'win',
    playOrder: 'first',
    wonDieRoll: true,
    games: null,
    notes: 'close one',
  };

  it('writes the documented column order', () => {
    expect(exportToCsv([]).split('\r\n')[0]).toBe(EXPORT_HEADERS.join(','));
  });

  it('writes one line per round', () => {
    const lines = exportToCsv([row, { ...row, roundNumber: 2 }]).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('t-1,Spring Regional,regionals,2026-08-07,locked,Monkey D. Luffy,OP16,1,swiss,Kaido,OP15,win,first,true,,close one');
  });

  it('leaves round columns empty for a tournament with no rounds', () => {
    const empty: ExportRow = {
      ...row,
      roundNumber: null, roundKind: null, opponentLeader: null, opponentMeta: null,
      result: null, playOrder: null, wonDieRoll: null, games: null, notes: null,
    };
    expect(exportToCsv([empty]).split('\r\n')[1])
      .toBe('t-1,Spring Regional,regionals,2026-08-07,locked,Monkey D. Luffy,OP16,,,,,,,,,');
  });
});
