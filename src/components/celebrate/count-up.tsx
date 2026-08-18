'use client';
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

/**
 * A number that arrives rather than appears.
 *
 * With no sound and unreliable haptics, motion is the reward channel — and a
 * record that counts up is the cheapest honest way to say "that did something".
 *
 * Eases out, so it lands rather than stops. Reduced motion sets the value
 * instantly; the number is the information, the movement is only the applause.
 */
export function CountUp({
  value,
  duration = 620,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    if (reduced || from.current === value) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic: fast enough to feel responsive, slow enough at the end to
      // let the eye read the final digits.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + delta * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else from.current = value;
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration, reduced]);

  return <span className={className}>{shown}</span>;
}
