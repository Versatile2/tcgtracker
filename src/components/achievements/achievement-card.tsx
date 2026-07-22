import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AchievementShareButton } from '@/components/share/achievement-share-button';
import type { AchievementDTO } from '@/lib/dto';

export function AchievementCard({ a }: { a: AchievementDTO }) {
  return (
    <Card className={`p-4 ${a.unlocked ? 'border-primary' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-tight">{a.name}</p>
        {a.unlocked && (
          <span className="flex shrink-0 items-center gap-2">
            <AchievementShareButton achievement={a} />
            <span className="rounded-full bg-primary p-1 text-primary-foreground"><Check className="h-3 w-3" /></span>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
      {!a.unlocked && a.progress && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((a.progress.current / a.progress.target) * 100)}%` }} />
          </div>
          <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">{a.progress.current}/{a.progress.target}</p>
        </div>
      )}
    </Card>
  );
}
