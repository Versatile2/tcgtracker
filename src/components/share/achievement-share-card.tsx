import { Check } from 'lucide-react';
import type { AchievementDTO } from '@/lib/dto';
import { Watermark } from './watermark';

export function AchievementShareCard({ achievement }: { achievement: AchievementDTO }) {
  return (
    <div className="w-[380px] space-y-3 rounded-xl border bg-card p-6 text-center text-card-foreground">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-7 w-7" />
      </div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Achievement unlocked</p>
      <p className="text-xl font-bold">{achievement.name}</p>
      <p className="text-sm text-muted-foreground">{achievement.description}</p>
      <Watermark />
    </div>
  );
}
