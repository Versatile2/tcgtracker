'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Lock, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { cn } from '@/lib/utils';
import { formatRecord } from '@/lib/record';
import { tournamentTypeLabel, roundKindLabel } from '@/lib/labels';
import type { TournamentSummaryDTO, LeaderDTO } from '@/lib/dto';

const resultPill: Record<'win' | 'loss' | 'draw', { label: string; className: string }> = {
  win: { label: 'Win', className: 'bg-emerald-600 text-white' },
  loss: { label: 'Lose', className: 'bg-red-600 text-white' },
  draw: { label: 'Draw', className: 'bg-yellow-500 text-black' },
};

export function TournamentCard({
  t,
  resolveLeader,
}: {
  t: TournamentSummaryDTO;
  resolveLeader: (id: string) => LeaderDTO | undefined;
}) {
  const [open, setOpen] = useState(false);
  const leader = resolveLeader(t.myLeaderId);
  const leaderName = leader?.name ?? '—';
  const hasName = Boolean(t.name);
  const isDraft = t.status === 'draft';

  return (
    <Card className="[--card-spacing:0px]">
      <div className="flex items-center gap-2 p-3">
        <Link
          href={`/tournaments/${t.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
        >
          <LeaderAvatar name={leaderName} colors={leader?.colors} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{tournamentTypeLabel(t.type)}</Badge>
              {isDraft ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Logging
                </span>
              ) : (
                <Lock className="size-3.5 text-muted-foreground" aria-label="Locked" />
              )}
            </div>
            {hasName && <p className="mt-1 truncate font-semibold">{t.name}</p>}
            <p className={cn('truncate text-sm text-muted-foreground', hasName ? 'mt-0.5' : 'mt-1')}>
              <span className="text-foreground">{leaderName}</span>
              <span> · {t.playedOn}</span>
            </p>
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
                  <LeaderAvatar name={label} colors={opp?.colors} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
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
