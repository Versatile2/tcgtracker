/**
 * How a finish is written down.
 *
 * "2nd of 14" is the single most quotable fact about an event — more than the
 * round record — so it gets a helper rather than being formatted inline at each
 * of the four places it appears.
 */

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  // 11th, 12th and 13th are the exceptions the naive rule gets wrong.
  const teens = abs % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** "2nd of 14", or "2nd" when the field size was never learned. Null if unplaced. */
export function placementLabel(placement: number | null, fieldSize: number | null): string | null {
  if (placement == null) return null;
  return fieldSize == null ? ordinal(placement) : `${ordinal(placement)} of ${fieldSize}`;
}

/** Won it outright. */
export const isWin = (placement: number | null) => placement === 1;

/** Top three — the shape of a podium, whatever the field size. */
export const isPodium = (placement: number | null) => placement != null && placement <= 3;

/**
 * Made the cut. Top 8 only counts as a cut when there was a field to cut from:
 * finishing 8th of 8 is last place, not a top cut.
 */
export const MIN_CUT_FIELD = 16;
export const isTopCut = (placement: number | null, fieldSize: number | null) =>
  placement != null && placement <= 8 && fieldSize != null && fieldSize >= MIN_CUT_FIELD;
