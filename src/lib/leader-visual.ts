// Visual helpers for leader avatars. Real card art is bundled in public/leaders/
// (see getLeaderImage); custom user-created leaders have no card art and fall
// back to a color-tinted initial derived from their OPTCG colors.
import { LEADER_DECK_CODES } from './leader-images';

export const LEADER_COLOR_HEX: Record<string, string> = {
  red: '#d92b3f',
  green: '#1f9d57',
  blue: '#2f6fed',
  yellow: '#e6b325',
  purple: '#7c3aed',
  black: '#2b2f36',
};

const NEUTRAL = '#6b7280';

/**
 * CSS background for a leader avatar: solid for mono-colour, a split gradient
 * for everything else.
 *
 * The two-colour case keeps its soft 8% seam, which is what 130-odd dual-colour
 * leaders already look like. Three or more get even hard-edged bands instead:
 * the promo Release Event leaders carry all six colours, and this previously
 * read `cs[0]` and `cs[1]` alone — so a six-colour Luffy drew as plain
 * blue-and-green and threw the other four away.
 *
 * Hard stops rather than a blend, because six colours blended across one square
 * is brown.
 */
export function leaderBackground(colors: string[] | undefined): string {
  const cs = (colors ?? []).map((c) => LEADER_COLOR_HEX[c] ?? NEUTRAL);
  if (cs.length === 0) return NEUTRAL;
  if (cs.length === 1) return cs[0];
  if (cs.length === 2) return `linear-gradient(135deg, ${cs[0]} 0%, ${cs[0]} 46%, ${cs[1]} 54%, ${cs[1]} 100%)`;
  const band = 100 / cs.length;
  const stops = cs.flatMap((c, i) => [`${c} ${(i * band).toFixed(2)}%`, `${c} ${((i + 1) * band).toFixed(2)}%`]);
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

/** Legible initial color for the given background (dark on yellow, white otherwise). */
export function leaderTextColor(colors: string[] | undefined): string {
  return (colors ?? [])[0] === 'yellow' ? '#1c1917' : '#ffffff';
}

export function leaderInitial(name: string): string {
  const m = name.match(/[A-Za-z0-9]/);
  return (m ? m[0] : '?').toUpperCase();
}

/** The URL an image id is served from. Null in, null out, so callers can pass a miss straight through. */
export function leaderImageUrl(imageId: string | null | undefined): string | null {
  return imageId ? `/api/leader-images/${imageId}` : null;
}

/**
 * Haystack for the leader pickers: the name, the card's own set code, and the
 * codes of any starter deck that reprints it. The single-colour starter decks
 * ship an existing booster leader under its original code, so without the last
 * part a player searching for their "ST17" deck would find nothing.
 */
export function leaderSearchText(name: string, setCode: string | null | undefined): string {
  const decks = setCode ? (LEADER_DECK_CODES[setCode] ?? []) : [];
  return [name, setCode, ...decks].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Colour is how players actually name decks ("I'm on red Zoro"), so it is the
 * organising axis of the leader picker. Every leader falls in exactly one band:
 * its colour when mono, Multicolor when it has two, Other for custom leaders
 * that were created without any.
 */
export type ColorBand = 'red' | 'green' | 'blue' | 'purple' | 'black' | 'yellow' | 'multi' | 'other';

/** Display order: the six game colours in their usual sequence, then the catch-alls. */
export const COLOR_BANDS: { key: ColorBand; label: string }[] = [
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'blue', label: 'Blue' },
  { key: 'purple', label: 'Purple' },
  { key: 'black', label: 'Black' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'multi', label: 'Multicolor' },
  { key: 'other', label: 'Other' },
];

export function leaderColorBand(colors: string[] | undefined): ColorBand {
  const cs = (colors ?? []).filter((c) => c in LEADER_COLOR_HEX);
  if (cs.length === 0) return 'other';
  if (cs.length > 1) return 'multi';
  return cs[0] as ColorBand;
}

/** Swatch fill for a band chip — the colour itself, or a spectrum for the catch-alls. */
export function bandSwatch(band: ColorBand): string {
  if (band === 'multi') {
    const [r, g, b, p] = ['red', 'green', 'blue', 'purple'].map((c) => LEADER_COLOR_HEX[c]);
    return `conic-gradient(${r}, ${g}, ${b}, ${p}, ${r})`;
  }
  return LEADER_COLOR_HEX[band] ?? NEUTRAL;
}

/**
 * Background for a band's header: the colour mixed toward the current surface,
 * so the band reads as a real field of its colour in both themes while the label
 * stays plain `foreground` text.
 *
 * Deliberately not a solid fill. White on the red (#d92b3f ≈ 4.0:1) and green
 * (#1f9d57 ≈ 3.4:1) swatches fails AA for a 16px bold label, so a saturated bar
 * would force per-colour text juggling and still leave two colours short. Mixing
 * toward the surface keeps every band contrast-safe by construction.
 */
export function bandField(band: ColorBand): string {
  const base = band === 'multi' || band === 'other' ? NEUTRAL : (LEADER_COLOR_HEX[band] ?? NEUTRAL);
  return `color-mix(in oklab, ${base} 22%, var(--background))`;
}
