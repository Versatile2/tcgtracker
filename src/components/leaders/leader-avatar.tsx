'use client';
import { cn } from '@/lib/utils';
import { leaderBackground, leaderTextColor, leaderInitial, leaderImageUrl } from '@/lib/leader-visual';
import { useLeaderArt } from './leader-art-provider';

// Card aspect (the source art is 600x838, ~5:7), so the whole card is visible
// rather than cropped — the art is Bandai's SAMPLE-watermarked promotional scan.
const SIZES = {
  sm: 'w-6 h-[2.1rem] rounded-[0.2rem] text-[0.7rem]',
  md: 'w-11 h-[3.85rem] rounded-[0.35rem] text-lg',
  lg: 'w-16 h-[5.6rem] rounded-lg text-2xl',
} as const;

/**
 * Leader artwork thumbnail. Shows the bundled card art when available, otherwise
 * a color-tinted initial placeholder. Decorative (aria-hidden) — the leader's
 * name is always shown as text alongside it.
 *
 * The printing comes from the player's own choice, read from context rather than
 * passed in: this renders in a dozen places and the alternative is threading the
 * same preference through every one of them.
 */
export function LeaderAvatar({
  name,
  colors,
  leaderId,
  size = 'md',
  className,
}: {
  name: string;
  colors?: string[];
  leaderId?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { imageIdFor } = useLeaderArt();
  const src = leaderImageUrl(imageIdFor(leaderId));
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-bold leading-none ring-1 ring-black/10',
        SIZES[size],
        className,
      )}
      style={src ? undefined : { background: leaderBackground(colors), color: leaderTextColor(colors) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        leaderInitial(name)
      )}
    </div>
  );
}
