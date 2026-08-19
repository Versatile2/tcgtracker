'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Pick a number by tapping rather than typing.
 *
 * A phone keyboard for "2" is a poor trade at a venue, so the likely answers are
 * offered as chips in a strip — the same idiom the leader and type strips
 * already use, so there is one way to choose things in this app rather than
 * three.
 *
 * The strip cannot enumerate everything, so it carries an "Other" chip that
 * reveals a plain field. Without it a 47-player turnout would simply be
 * unrecordable, and a picker that cannot express a real answer is worse than
 * the keyboard it replaced.
 */
export function NumberPicker({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
}: {
  id?: string;
  value: number | null;
  onChange: (n: number | null) => void;
  /** The offered answers, in the order they should read. */
  options: number[];
  ariaLabel: string;
  placeholder?: string;
}) {
  const inList = value != null && options.includes(value);
  const [other, setOther] = useState(value != null && !inList);

  return (
    <div className="space-y-2">
      {/* Bleeds past the p-4 both hosts share, so chips scroll to the edge of
          the screen rather than stopping short of it — the same treatment the
          leader and type strips get. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label={ariaLabel}>
        {options.map((n) => {
          const active = !other && value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { setOther(false); onChange(n); }}
              className={cn(
                'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-3 text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md',
              )}
            >
              {n}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={other}
          onClick={() => { setOther(true); }}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            other
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md',
          )}
        >
          Other
        </button>
      </div>

      {other && (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.trim() === '' ? null : Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
          placeholder={placeholder}
          className="h-12 text-base" />
      )}
    </div>
  );
}

/** Turnouts a real event actually has, for picking a field size. */
export const COMMON_FIELD_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 48, 64];

/**
 * Above this many players, tapping stops being the faster way: finding 247 in a
 * strip of 300 is worse than typing it, so the placement falls back to a field.
 */
export const MAX_PICKABLE_PLACEMENT = 32;

/** 1…n, the positions a field of that size can produce. */
export function placementOptions(fieldSize: number | null): number[] {
  // With no field size recorded there is no range to offer, so this is a guess
  // at the useful part of one — "Other" covers the rest.
  const n = fieldSize ?? 16;
  return Array.from({ length: Math.min(n, MAX_PICKABLE_PLACEMENT) }, (_, i) => i + 1);
}
