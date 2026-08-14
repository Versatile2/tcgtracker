import { cn } from '@/lib/utils';

// Matches LeaderAvatar's 5:7 card footprint so a freeplay card sits flush in a
// list beside normal leader avatars.
const SIZES = {
  sm: 'w-6 h-[2.1rem] rounded-[0.2rem] text-xs',
  md: 'w-11 h-[3.85rem] rounded-[0.35rem] text-xl',
  lg: 'w-16 h-[5.6rem] rounded-lg text-3xl',
} as const;

/** Stands in for the leader avatar on a freeplay session, which has no single leader. */
export function FreeplayGlyph({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        // Semantic tokens, like every other surface in the app — the glyph should
        // recede beside real card art, and the emoji carries its own colour.
        'flex shrink-0 items-center justify-center border border-border/60 bg-muted',
        SIZES[size], className,
      )}
    >
      🎴
    </div>
  );
}
