'use client';
import Link from 'next/link';
import { CloudOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { cn } from '@/lib/utils';
import { useLongPress } from '@/lib/use-long-press';
import { formatPlayedOn } from '@/lib/format-date';
import type { TournamentSummaryDTO, LeaderDTO } from '@/lib/dto';

const resultPill: Record<'win' | 'loss' | 'draw', { label: string; className: string }> = {
  win: { label: 'Win', className: 'bg-emerald-600 text-white' },
  loss: { label: 'Lose', className: 'bg-red-600 text-white' },
  draw: { label: 'Draw', className: 'bg-yellow-500 text-black' },
};

/**
 * A single game, in one row. Deliberately not the tournament card: a match has
 * no record to total, no rounds to expand and no draft/locked state, so the
 * pieces that card exists to show would all be empty furniture here.
 *
 * What it does show is the only thing a match is: which two decks met, and who
 * won.
 */
export function MatchCard({
  t,
  resolveLeader,
  unsynced = false,
  onQuickActions,
}: {
  t: TournamentSummaryDTO;
  resolveLeader: (id: string) => LeaderDTO | undefined;
  /** Has changes still waiting in the offline queue. */
  unsynced?: boolean;
  /** Press and hold, or right-click, to act on this match without opening it. */
  onQuickActions?: () => void;
}) {
  const press = useLongPress(() => onQuickActions?.(), Boolean(onQuickActions));
  const mine = t.myLeaderId ? resolveLeader(t.myLeaderId) : undefined;
  // A match holds exactly one round; until the outbox has applied it there is
  // none, and the card still has a date and a deck worth showing.
  const game = t.matches[0];
  const opponent = game?.opponentLeaderId ? resolveLeader(game.opponentLeaderId) : undefined;
  const pill = game ? resultPill[game.result] : null;

  return (
    <Card className="[--card-spacing:0px]">
      <Link
        href={`/matches/${t.id}`}
        {...press}
        className="flex items-center gap-3 rounded-xl p-3 outline-none transition-transform select-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] [-webkit-touch-callout:none]"
      >
        <LeaderAvatar name={mine?.name ?? '—'} colors={mine?.colors} setCode={mine?.setCode} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{mine?.name ?? '—'}</p>
          <p className="truncate text-sm text-muted-foreground">
            vs <span className="font-medium text-foreground">{opponent?.name ?? '—'}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {formatPlayedOn(t.playedOn)}
            {unsynced && <CloudOff className="size-3.5" aria-label="Not synced yet" />}
          </p>
        </div>
        <LeaderAvatar name={opponent?.name ?? '—'} colors={opponent?.colors} setCode={opponent?.setCode} size="md" />
        {pill && (
          <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-semibold', pill.className)}>
            {pill.label}
          </span>
        )}
      </Link>
    </Card>
  );
}
