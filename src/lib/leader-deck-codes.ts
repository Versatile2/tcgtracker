// Search metadata, not image data: the single-colour starter decks reprint an
// existing booster leader under its original code, so a player searching for
// their "ST17" deck needs this to find OP01-060. Stage 2 folds it into a column
// on `leaders`.

/**
 * Starter decks that reprint a leader under a different set code, so the
 * picker can find OP01-060 when a player searches for their "ST17" deck.
 */
export const LEADER_DECK_CODES: Readonly<Record<string, readonly string[]>> = {
  'OP01-060': ['ST17'],
  'OP02-001': ['ST15'],
  'OP02-093': ['ST19'],
  'OP03-099': ['ST20'],
  'OP05-060': ['ST18'],
  'OP06-022': ['ST28'],
  'OP07-019': ['ST24'],
  'OP09-001': ['ST23'],
  'OP09-042': ['ST25'],
  'OP09-061': ['ST26'],
  'OP09-081': ['ST27'],
  'OP10-099': ['ST36'],
  'OP11-062': ['ST34'],
  'OP12-020': ['ST32'],
  'OP12-040': ['ST33'],
  'OP13-004': ['ST35'],
  'ST11-001': ['ST16'],
  'ST21-001': ['ST31'],
};
