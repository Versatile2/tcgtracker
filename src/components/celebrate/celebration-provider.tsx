'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { haptic } from '@/lib/haptics';
import { ResultCard } from './result-card';
import { isMilestone, type Celebration } from './celebration';

/*
 * Owns what happens the instant a game is logged.
 *
 * Two tiers, deliberately: a routine save gets a haptic and nothing else, so
 * logging stays as fast as it is today; a save that earned something gets the
 * card moment. See `isMilestone`.
 *
 * The overlay is always dismissible and never blocks a write — the write has
 * already happened by the time this is called, through the outbox. Nothing here
 * can fail in a way that costs a player their round.
 */

type CelebrateContext = { celebrate: (c: Celebration) => void };

const Ctx = createContext<CelebrateContext>({ celebrate: () => {} });

/** No-op outside the provider, so a component can always ask to celebrate. */
export const useCelebrate = () => useContext(Ctx);

/** Long enough to read the deltas, short enough not to be in the way. */
const DISMISS_AFTER = 3400;

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Celebration | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const celebrate = useCallback((c: Celebration) => {
    if (!isMilestone(c)) {
      // The routine case: felt, not watched. The record counting up and the new
      // round appearing are the visible acknowledgement, and they are already
      // on screen.
      haptic(c.result === 'win' ? 'win' : 'tick');
      return;
    }
    haptic('milestone');
    clearTimeout(timer.current);
    // A second milestone replaces the first rather than queueing behind it:
    // this is triggered by a deliberate tap, so two cannot arrive at once, and
    // a queue would only risk showing a stale one over the current screen.
    setCurrent(c);
    timer.current = setTimeout(() => setCurrent(null), DISMISS_AFTER);
  }, []);

  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {current && <ResultCard c={current} onDismiss={dismiss} />}
    </Ctx.Provider>
  );
}
