'use client';
import { cn } from '@/lib/utils';

/**
 * A row of mutually exclusive choices, sized for a thumb. Extracted from the
 * round form when the match form needed the same control — two copies of a
 * chooser is exactly the thing that drifts.
 *
 * `value` may be null: the round form starts with no die roll and no play order
 * recorded, and null is a real state there rather than a missing one.
 */
export function Segmented<T extends string | boolean>({
  value, options, onChange, activeClass = 'bg-primary text-primary-foreground',
}: {
  value: T | null;
  options: { value: T; label: string; activeClass?: string }[];
  onChange: (v: T) => void;
  activeClass?: string;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-lg px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? (o.activeClass ?? activeClass) : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
