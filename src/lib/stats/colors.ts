/**
 * Colour combinations, as decks actually come.
 *
 * A leader can be several colours — Sakazuki is Blue/Black, the promo Release
 * Event Luffy is all six — so one game against a two-colour deck belongs to two
 * answers at once. Counted per colour, a pie of six slices would sum far past
 * 100% and say something untrue.
 *
 * So the unit here is the *combination*: mono-red, Purple/Red and the six-colour
 * Luffy are three different decks, each game lands in exactly one, and the chart
 * partitions honestly. Coverage — "how many of the six have I beaten?" — is
 * counted separately, per colour, because beating a Purple/Red deck really does
 * beat both.
 */

/**
 * The game's own colour order. Used to normalise a combination key, because the
 * catalog stores the same pairing both ways round — `black/yellow` on four
 * leaders and `yellow/black` on one — and unnormalised keys would split one deck
 * across two slices of the same chart.
 */
export const COLOR_ORDER = ['red', 'green', 'blue', 'purple', 'black', 'yellow'] as const;
export type Color = (typeof COLOR_ORDER)[number];

const RANK = new Map<string, number>(COLOR_ORDER.map((c, i) => [c, i]));

/** Colours in canonical order, deduplicated. Unknown colours sort last, by name. */
export function normalizeColors(colors: readonly string[] | undefined): string[] {
  return [...new Set(colors ?? [])].sort((a, b) => {
    const ra = RANK.get(a) ?? COLOR_ORDER.length;
    const rb = RANK.get(b) ?? COLOR_ORDER.length;
    return ra - rb || a.localeCompare(b);
  });
}

/** The key a combination is counted under. Colourless decks get their own. */
export function comboKey(colors: readonly string[] | undefined): string {
  const cs = normalizeColors(colors);
  return cs.length ? cs.join('/') : 'colorless';
}

/** "purple/red" → "Purple / Red", which is how players say it. */
export function comboLabel(key: string): string {
  if (key === 'colorless') return 'No colour';
  const parts = key.split('/');
  // Six colours named in full is longer than any legend row can hold, and every
  // all-colour leader is a promo Release Event card, so it is named as one.
  if (parts.length === COLOR_ORDER.length) return 'All six';
  return parts.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ');
}

/** The colours of a combination key, for painting its slice. */
export const comboColors = (key: string): string[] => (key === 'colorless' ? [] : key.split('/'));
