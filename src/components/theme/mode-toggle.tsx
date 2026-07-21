'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

const MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as const;

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
