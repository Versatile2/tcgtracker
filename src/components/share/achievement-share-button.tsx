'use client';
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { ShareDialog } from './share-dialog';
import { AchievementShareCard } from './achievement-share-card';
import { shareFilename } from '@/lib/share-image';
import type { AchievementDTO } from '@/lib/dto';

export function AchievementShareButton({ achievement }: { achievement: AchievementDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Share ${achievement.name}`}
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Share2 className="h-4 w-4" />
      </button>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        title="Share achievement"
        filename={shareFilename('achievement', achievement.name)}
      >
        <AchievementShareCard achievement={achievement} />
      </ShareDialog>
    </>
  );
}
