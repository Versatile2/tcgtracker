import { Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Matches LeaderAvatar's 5:7 card footprint so a freeplay card sits flush in a
// list beside normal leader avatars.
const SIZES = {
  sm: 'w-6 h-[2.1rem] rounded-[0.2rem]',
  md: 'w-11 h-[3.85rem] rounded-[0.35rem]',
  lg: 'w-16 h-[5.6rem] rounded-lg',
} as const;

const ICON = { sm: 'size-3', md: 'size-5', lg: 'size-7' } as const;

/**
 * Stands in for the leader avatar on a freeplay session, which has no single
 * leader. An icon rather than an emoji: the previous 🎴 depended on the platform
 * having that codepoint and rendered as a blank box where it did not.
 */
export function FreeplayGlyph({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border border-border/60 bg-muted text-muted-foreground',
        SIZES[size], className,
      )}
    >
      <Shuffle className={ICON[size]} />
    </div>
  );
}
