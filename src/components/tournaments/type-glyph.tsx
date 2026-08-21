import { cn } from '@/lib/utils';
import { TYPE_ICONS } from '@/lib/type-glyph';
import type { TournamentType } from '@/lib/dto';

// Matches LeaderAvatar's 5:7 card footprint so a session card sits flush in a
// list beside normal leader avatars.
const SIZES = {
  sm: 'w-6 h-[2.1rem] rounded-[0.2rem]',
  md: 'w-11 h-[3.85rem] rounded-[0.35rem]',
  lg: 'w-16 h-[5.6rem] rounded-lg',
} as const;

const ICON = { sm: 'size-3', md: 'size-5', lg: 'size-7' } as const;

/**
 * Stands in for the leader avatar on a session, which has no single
 * leader. It draws the session's own type rather than one shared symbol: at
 * eight session types, a list of identical shuffle icons said only "not a
 * tournament", which the reader already knew from the tab they were on.
 *
 * An icon rather than an emoji: the original 🎴 depended on the platform having
 * that codepoint and rendered as a blank box where it did not.
 */
export function TypeGlyph({ type, size = 'md', className }: {
  type: TournamentType;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // Indexing the Record directly rather than calling typeIcon(): the React
  // Compiler lint rule cannot prove a function call returns a stable
  // component across renders and flags it as created-during-render, even
  // though this lookup is deterministic.
  const Icon = TYPE_ICONS[type];
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border border-border/60 bg-muted text-muted-foreground',
        SIZES[size], className,
      )}
    >
      <Icon className={ICON[size]} />
    </div>
  );
}
