'use client';
import { Check } from 'lucide-react';
import { ACCENTS } from '@/lib/accents';
import { useAccent } from '@/components/theme/accent-provider';
import { cn } from '@/lib/utils';

export function AccentPicker() {
  const { accent, setAccent } = useAccent();
  return (
    <div className="flex flex-wrap gap-3">
      {ACCENTS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => setAccent(a.key)}
          aria-label={a.name}
          title={a.name}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition',
            accent === a.key ? 'ring-foreground' : 'ring-transparent'
          )}
          style={{ backgroundColor: a.color }}
        >
          {accent === a.key && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
