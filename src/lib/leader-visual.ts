// Visual helpers for leader avatars. Real card art gets bundled later (see
// getLeaderImage); until then leaders render a color-tinted initial placeholder
// derived from their OPTCG colors.

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
 * Resolve a leader's bundled art. Returns null for now, so avatars fall back to
 * the color-tinted initial. Later: drop files in public/leaders/ and map them
 * here (keyed by leader name, which is stable across DB reseeds — ids are not).
 */
export function getLeaderImage(_name: string): string | null {
  return null;
}
