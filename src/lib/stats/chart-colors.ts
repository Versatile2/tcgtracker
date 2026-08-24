import { COLOR_ORDER } from './colors';

/**
 * The CSS variable a chart slice is painted with.
 *
 * Deliberately not `LEADER_COLOR_HEX`. Those are the card's colours, right for a
 * whole avatar; a slice is small and sits against its neighbours, so the chart
 * uses steps chosen for separability and validated against the dataviz checker
 * in both themes — see the note beside the tokens in `globals.css`. Going
 * through CSS variables also means the dark palette is a real second choice
 * rather than an automatic flip, with no JavaScript involved in the swap.
 */
export const chartColorVar = (color: string): string =>
  (COLOR_ORDER as readonly string[]).includes(color) ? `var(--chart-${color})` : 'var(--chart-neutral)';

/**
 * The paint for a slice: a flat colour for one, a gradient reference for
 * several, the neutral for none.
 *
 * A combination is drawn in its own colours — a Purple/Red slice looks like a
 * Purple/Red deck — which is the same idea the leader avatars use, so the two
 * read as the same vocabulary.
 */
export function sliceFill(colors: readonly string[], gradientId: string): string {
  if (colors.length === 0) return 'var(--chart-neutral)';
  if (colors.length === 1) return chartColorVar(colors[0]);
  return `url(#${gradientId})`;
}

/**
 * The paint for a row that has no colours of its own — a meta, a tournament type.
 *
 * A sequential ramp rather than invented categorical hues. Those dimensions have
 * no inherent colour, and minting eight arbitrary ones would imply a meaning the
 * data does not carry; a single hue stepped light-to-dark says only "more games,
 * darker", which is exactly what the slice already says.
 *
 * Mixed from `--primary`, so it follows whichever accent the player chose in
 * Settings instead of pinning a colour they did not pick.
 */
export function rampColorVar(index: number, count: number): string {
  // Darkest first: rows arrive ordered by games, so the biggest slice is the
  // strongest. Floor at 30% so the last step is still visibly the accent and not
  // indistinguishable from the card behind it.
  const strength = count <= 1 ? 85 : 85 - (index / (count - 1)) * 55;
  return `color-mix(in oklab, var(--primary) ${strength.toFixed(0)}%, var(--card))`;
}
