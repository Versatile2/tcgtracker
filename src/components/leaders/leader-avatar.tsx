import { cn } from '@/lib/utils';
import { leaderBackground, leaderTextColor, leaderInitial, getLeaderImage } from '@/lib/leader-visual';

const SIZES = {
  sm: 'size-6 rounded-md text-[0.7rem]',
  md: 'size-11 rounded-[0.7rem] text-lg',
  lg: 'size-16 rounded-2xl text-2xl',
} as const;

/**
 * Leader artwork thumbnail. Shows the bundled card art when available, otherwise
 * a color-tinted initial placeholder. Decorative (aria-hidden) — the leader's
 * name is always shown as text alongside it.
 */
export function LeaderAvatar({
  name,
  colors,
  size = 'md',
  className,
}: {
  name: string;
  colors?: string[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const src = getLeaderImage(name);
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
