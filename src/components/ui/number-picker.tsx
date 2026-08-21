'use client';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Type a number, or tap one of the likely answers.
 *
 * The field comes first and is always there. Chips sit under it as a shortcut,
 * not as the way in: a strip cannot enumerate every turnout, and hiding the
 * keyboard behind an "Other" chip made the common real answer — 47 players —
 * the slowest one to give.
 *
 * That "Other" chip is gone, and with it the mode it implied. A chip is simply
 * lit when it matches what the field holds, so tapping 16 and typing 16 leave
 * the control in the same state instead of two states that merely look alike.
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
  const set = (raw: string) =>
    onChange(raw.trim() === '' ? null : Math.max(1, Number.parseInt(raw, 10) || 1));

  return (
    <div className="space-y-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        value={value ?? ''}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-12 text-base" />

      {/* Bleeds past the p-4 both hosts share, so chips scroll to the edge of
          the screen rather than stopping short of it — the same treatment the
          leader and type strips get. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label={`${ariaLabel} — common answers`}>
        {options.map((n) => {
          // Derived from the value, not from which control was last touched, so
          // typing 16 lights the 16 chip exactly as tapping it would.
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(n)}
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
      </div>
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
