'use client';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Card } from '@/components/ui/card';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { AccentPicker } from '@/components/theme/accent-picker';

export function SettingsView() {
  return (
    <LargeTitleScreen title="Settings">
      <Card className="mt-4 space-y-5 p-4">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <div className="space-y-2">
          <p className="text-sm font-medium">Theme</p>
          <ModeToggle />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Accent</p>
          <AccentPicker />
        </div>
      </Card>
    </LargeTitleScreen>
  );
}
