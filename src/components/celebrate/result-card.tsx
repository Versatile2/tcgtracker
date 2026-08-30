'use client';
import { Trophy, Flame, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { leaderImageUrl } from '@/lib/leader-visual';
import { useLeaderArt } from '@/components/leaders/leader-art-provider';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { CountUp } from './count-up';
import { rankTier } from '@/lib/rank';
import { RankBadge } from '@/components/rank/rank-badge';
import { placementLabel } from '@/lib/placement';
import type { Celebration } from './celebration';

/**
 * The milestone moment: a card turns over, the way the last life card turns at
 * the end of a real match.
 *
 * Built from the game's own material rather than confetti — the app already
 * holds 285 real printings, including whichever one the player chose for their
 * own leader, so the reward shows them their card. Confetti would say nothing
 * about One Piece, this deck, or this win.
 *
 * A loss lands too. It settles on the opponent's card and still shows the XP
 * and the streak, because the habit being rewarded is logging, not winning.
 */
export function ResultCard({ c, onDismiss }: { c: Celebration; onDismiss: () => void }) {
  const { imageIdFor } = useLeaderArt();
  const won = c.result === 'win';
  const tier = rankTier(c.placement, c.fieldSize);
  // The winner faces up. On a draw, and when no game was played at all, the
  // player's own card leads — nobody lost.
  const mineLeads = c.result !== 'loss';
  const front = mineLeads ? c.myLeader : c.opponentLeader;
  // Starting an event has no opponent; the card still turns, onto itself.
  const back = (mineLeads ? c.opponentLeader : c.myLeader) ?? front;
  const src = (l: typeof front) => leaderImageUrl(imageIdFor(l?.id));

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={c.headline}
      onClick={onDismiss}
      className="celebrate-veil fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/88 p-6 backdrop-blur-sm"
    >
      <div className="celebrate-scene relative flex items-center justify-center">
        {/* Light behind the card: the accent for a win, the metal itself when
            the event was won. A loss gets dignity, not applause. */}
        {(won || tier) && (
          <span
            aria-hidden
            className={cn(
              'celebrate-bloom absolute size-56 rounded-full blur-2xl',
              tier ? `rank-${tier}` : 'bg-primary/40',
            )}
            style={tier ? { backgroundImage: 'var(--rank-metal)', opacity: 0.5 } : undefined}
          />
        )}
        <div className="celebrate-card relative h-[15.4rem] w-44">
          <Face leader={front} src={src(front)} className="celebrate-face" />
          <Face leader={back} src={src(back)} className="celebrate-face celebrate-face-back absolute inset-0" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="celebrate-rise celebrate-rise-1 text-2xl font-bold tracking-tight">{c.headline}</p>

        {tier && (
          <p className="celebrate-rise celebrate-rise-2">
            <RankBadge tier={tier} placement={placementLabel(c.placement, c.fieldSize)} />
          </p>
        )}

        <div className="celebrate-rise celebrate-rise-2 flex flex-wrap items-center justify-center gap-2">
          {/* Starting an event pays nothing, and "+0 XP" on the very first
              thing a new player sees reads as a system that owes them. */}
          {c.xpGained > 0 && (
            <Pill icon={Sparkles}>
              +<CountUp value={c.xpGained} duration={520} /> XP
            </Pill>
          )}
          {c.leveledTo !== null && <Pill icon={Trophy} accent>Level {c.leveledTo}</Pill>}
          {c.streakExtended && c.streakWeeks > 1 && (
            <Pill icon={Flame} accent>{c.streakWeeks} weeks</Pill>
          )}
        </div>

        {c.unlocked.length > 0 && (
          <ul className="celebrate-rise celebrate-rise-3 mt-1 space-y-1">
            {c.unlocked.map((a) => (
              <li key={a.key} className="text-sm">
                <span className="font-semibold text-primary-ink">{a.name}</span>
                <span className="text-muted-foreground"> — {a.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="celebrate-rise celebrate-rise-3 text-xs text-muted-foreground">Tap to continue</p>
    </div>
  );
}

function Face({
  leader, src, className,
}: {
  leader: Celebration['myLeader'];
  src: string | null;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/15', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-[15.4rem] w-44 object-cover" />
      ) : (
        // A custom leader has no card; its colour field stands in, at the size
        // the moment needs rather than the avatar's usual thumbnail.
        <LeaderAvatar
          name={leader?.name ?? '—'}
          colors={leader?.colors}
          leaderId={leader?.id}
          size="lg"
          className="h-[15.4rem] w-44 rounded-2xl text-5xl"
        />
      )}
    </div>
  );
}

function Pill({
  icon: Icon, accent = false, children,
}: {
  icon: typeof Trophy;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums',
        accent ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </span>
  );
}
