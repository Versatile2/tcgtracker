'use client';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Card } from '@/components/ui/card';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { AccentPicker } from '@/components/theme/accent-picker';
import { ExportCard } from './export-card';
import { KindsHelpButton } from '@/components/nav/kinds-sheet';

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
      {/* Findable months later, when the question is no longer "which do I
          pick?" but "why isn't this match in my win rate?". */}
      <Card className="mt-4 space-y-3 p-4">
        <h2 className="text-lg font-semibold">Logging</h2>
        <p className="text-sm text-muted-foreground">
          Tournaments, sessions and matches count toward different statistics.
        </p>
        <KindsHelpButton />
      </Card>
      <ExportCard />
    </LargeTitleScreen>
  );
}
