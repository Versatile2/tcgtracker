// Visual helpers for leader avatars. Real card art is bundled in public/leaders/
// (see getLeaderImage); custom user-created leaders have no card art and fall
// back to a color-tinted initial derived from their OPTCG colors.
import { LEADER_IMAGE_CODES } from './leader-images';

export const LEADER_COLOR_HEX: Record<string, string> = {
  red: '#d92b3f',
  green: '#1f9d57',
  blue: '#2f6fed',
  yellow: '#e6b325',
  purple: '#7c3aed',
  black: '#2b2f36',
};

const NEUTRAL = '#6b7280';

/** CSS background for a leader avatar: solid for mono-color, split gradient for dual. */
export function leaderBackground(colors: string[] | undefined): string {
  const cs = (colors ?? []).map((c) => LEADER_COLOR_HEX[c] ?? NEUTRAL);
  if (cs.length === 0) return NEUTRAL;
  if (cs.length === 1) return cs[0];
  return `linear-gradient(135deg, ${cs[0]} 0%, ${cs[0]} 46%, ${cs[1]} 54%, ${cs[1]} 100%)`;
}

/** Legible initial color for the given background (dark on yellow, white otherwise). */
export function leaderTextColor(colors: string[] | undefined): string {
  return (colors ?? [])[0] === 'yellow' ? '#1c1917' : '#ffffff';
}

export function leaderInitial(name: string): string {
  const m = name.match(/[A-Za-z0-9]/);
  return (m ? m[0] : '?').toUpperCase();
}

/**
 * Resolve a leader's bundled card art, keyed by set code — names are not unique
 * (there are 15 distinct Monkey D. Luffy printings) but set codes are, and they
 * are stable across DB reseeds where row ids are not. Returns null for custom
 * leaders, which have no card and fall back to the initial placeholder.
 *
 * Refresh the files with `npm run data:leaders`.
 */
export function getLeaderImage(setCode: string | null | undefined): string | null {
  return setCode && LEADER_IMAGE_CODES.has(setCode) ? `/leaders/${setCode}.webp` : null;
}
