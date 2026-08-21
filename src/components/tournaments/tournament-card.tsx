'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Lock, ChevronDown, CloudOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { TypeGlyph } from './type-glyph';
import { TypeBadge } from './type-badge';
import { cn } from '@/lib/utils';
import { useLongPress } from '@/lib/use-long-press';
import { formatPlayedOn } from '@/lib/format-date';
import { formatRecord } from '@/lib/record';
import { roundKindLabel, deckCountLabel } from '@/lib/labels';
import { placementLabel } from '@/lib/placement';
import { rankTier } from '@/lib/rank';
import { RankBadge, rankSkin } from '@/components/rank/rank-badge';
import type { TournamentSummaryDTO, LeaderDTO } from '@/lib/dto';
import { isSession } from '@/lib/tournament-kinds';

const resultPill: Record<'win' | 'loss' | 'draw', { label: string; className: string }> = {
  win: { label: 'Win', className: 'bg-emerald-600 text-white' },
  loss: { label: 'Lose', className: 'bg-red-600 text-white' },
  draw: { label: 'Draw', className: 'bg-yellow-500 text-black' },
};

export function TournamentCard({
  t,
  resolveLeader,
  unsynced = false,
  onQuickActions,
}: {
  t: TournamentSummaryDTO;
  resolveLeader: (id: string) => LeaderDTO | undefined;
  /** Has changes still waiting in the offline queue. */
  unsynced?: boolean;
  /** Press and hold, or right-click, to act on this event without opening it. */
  onQuickActions?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => onQuickActions?.(), Boolean(onQuickActions));
  const leader = t.myLeaderId ? resolveLeader(t.myLeaderId) : undefined;
  const leaderName = leader?.name ?? '—';
  const hasName = Boolean(t.name);
  const isDraft = t.status === 'draft';
  const tier = rankTier(t.placement, t.fieldSize);
  const placed = placementLabel(t.placement, t.fieldSize);

  return (
    <Card className={cn('[--card-spacing:0px]', rankSkin(tier))}>
      <div className="flex items-center gap-2 p-3">
        <Link
          href={`/tournaments/${t.id}`}
          {...press}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none transition-transform select-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] [-webkit-touch-callout:none]"
        >
          {isSession(t.type)
            ? <TypeGlyph type={t.type} size="md" />
            : <LeaderAvatar name={leaderName} colors={leader?.colors} setCode={leader?.setCode} size="md" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <TypeBadge type={t.type} />
              {isDraft ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Logging
                </span>
              ) : (
                <Lock className="size-3.5 text-muted-foreground" aria-label="Locked" />
              )}
              {unsynced && <CloudOff className="size-3.5 text-muted-foreground" aria-label="Not synced yet" />}
            </div>
            {hasName && <p className="mt-1 truncate font-semibold">{t.name}</p>}
            {placed && (
              tier
                ? <p className="mt-1"><RankBadge tier={tier} placement={placed} /></p>
                : <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{placed}</p>
            )}
            <div className={cn('flex items-baseline gap-1.5 text-sm text-muted-foreground', hasName ? 'mt-0.5' : 'mt-1')}>
              {!isSession(t.type) && (
                // No set code here, unlike the leader picker and the opponent
                // breakdown. Those exist to tell 15 same-named printings apart;
                // this is a list of your own events, where you know which deck you
                // play and scan by name and date. Keeping all three fields on one
                // line squeezed the name down to a single letter.
                <span className="truncate text-foreground">{leaderName}</span>
              )}
              {/* Never truncated: the date is short and was the thing being
                  silently dropped when everything shared one truncating line. */}
              <span className="shrink-0">{formatPlayedOn(t.playedOn)}</span>
              {isSession(t.type) && t.deckCount > 0 && (
                <span className="shrink-0">· {deckCountLabel(t.deckCount)}</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-2xl font-bold leading-none tabular-nums">{formatRecord(t.record)}</div>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Hide opponents' : 'Show opponents'}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn('size-5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-3">
          {t.matches.length === 0 ? (
            <span className="text-sm text-muted-foreground">No rounds yet</span>
          ) : (
            t.matches.map((m, i) => {
              const opp = m.opponentLeaderId ? resolveLeader(m.opponentLeaderId) : undefined;
              const label = opp?.name ?? roundKindLabel(m.kind);
              const pill = resultPill[m.result];
              return (
                <div key={i} className="flex items-center gap-2">
                  <LeaderAvatar name={label} colors={opp?.colors} setCode={opp?.setCode} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {label}
                    {opp?.setCode && <span className="text-muted-foreground"> {opp.setCode}</span>}
                  </span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', pill.className)}>{pill.label}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}
