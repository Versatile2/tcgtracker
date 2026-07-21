'use client';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { AccentPicker } from '@/components/theme/accent-picker';

export function SettingsView() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/" className="text-sm text-muted-foreground">← Home</Link>
      </div>
      <Card className="space-y-5 p-4">
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
    </main>
  );
}
