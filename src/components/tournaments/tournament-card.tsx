'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Lock, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { cn } from '@/lib/utils';
import { formatRecord } from '@/lib/record';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentSummaryDTO, LeaderDTO } from '@/lib/dto';

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
  const opponents = t.opponentLeaderIds.map(resolveLeader).filter((l): l is LeaderDTO => Boolean(l));

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
        <div className="flex items-start justify-between gap-3 border-t border-border/60 px-3 py-3">
          <span className="mt-1 shrink-0 text-xs font-medium text-muted-foreground">Opponents</span>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {opponents.length === 0 ? (
              <span className="text-sm text-muted-foreground">No rounds yet</span>
            ) : (
              opponents.map((o) => (
                <span key={o.id} className="flex items-center gap-1.5 rounded-full border border-border/60 py-1 pl-1 pr-2.5">
                  <LeaderAvatar name={o.name} colors={o.colors} size="sm" />
                  <span className="max-w-[7rem] truncate text-xs font-medium">{o.name}</span>
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
