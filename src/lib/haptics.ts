/**
 * A tap you can feel, where the platform allows one.
 *
 * Bluntly: iOS Safari and iOS PWAs do not implement the Vibration API, so for a
 * large share of this app's users these calls do nothing. That is why motion
 * carries the reward and haptics only ever sharpen it — nothing in the design
 * may depend on being felt.
 *
 * Silent no-op everywhere it is unavailable, and never throws: a blocked or
 * missing API must not take down the write that triggered it.
 */
type Pattern = 'tick' | 'win' | 'milestone';

const PATTERNS: Record<Pattern, number | number[]> = {
  /** One round logged, the routine case. Short enough to feel incidental. */
  tick: 12,
  /** A win, still routine, but worth a fuller note. */
  win: 22,
  /** Something was actually earned: two beats, so it reads as different. */
  milestone: [18, 60, 34],
};

export function haptic(pattern: Pattern): void {
  if (typeof window === 'undefined') return;
  const vibrate = window.navigator?.vibrate?.bind(window.navigator);
  if (!vibrate) return;
  // Respect the same preference motion does — someone who has asked for less
  // movement has not asked to be buzzed instead.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  try {
    vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw when the document is not focused or the gesture
    // requirement is unmet. Losing the buzz is never worth losing the round.
  }
}
