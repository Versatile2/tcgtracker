/**
 * One-time hints: shown until the thing they teach has been done, then never
 * again.
 *
 * A gesture nobody knows about is not a shortcut, but a permanent instruction
 * is furniture on a screen whose job is logging. This is the middle: teach
 * once, then leave.
 *
 * The `crewstat-` prefix is fixed by PRODUCT.md. These are new keys, not
 * renames, and losing one only costs a hint being shown a second time.
 */
const KEY = (name: string) => `crewstat-hint-${name}-seen`;

export function hintSeen(name: string): boolean {
  if (typeof window === 'undefined') return true; // never flash a hint during SSR
  try {
    return window.localStorage.getItem(KEY(name)) === '1';
  } catch {
    // A locked-down browser simply never shows hints, which is the safe failure.
    return true;
  }
}

export function markHintSeen(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY(name), '1');
  } catch {
    // Costs a repeated hint, never the action that triggered it.
  }
}
