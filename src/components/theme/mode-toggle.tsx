'use client';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useIsMounted } from '@/lib/use-is-mounted';

const MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as const;

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();

  return (
    <div className="grid grid-cols-3 gap-2">
      {MODES.map(([value, label]) => (
        <Button
          key={value}
          type="button"
          variant={mounted && theme === value ? 'default' : 'outline'}
          className="h-11"
          onClick={() => setTheme(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
