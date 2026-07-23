import Link from 'next/link';
import { Lock } from 'lucide-react';
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
  const leader = resolveLeader(t.myLeaderId);
  const leaderName = leader?.name ?? '—';
  const hasName = Boolean(t.name);
  const isDraft = t.status === 'draft';
  const opponents = t.opponentLeaderIds.map(resolveLeader).filter((l): l is LeaderDTO => Boolean(l));

  return (
    <Link href={`/tournaments/${t.id}`} className="block">
      <Card className="flex items-center gap-3 p-3 transition-transform active:scale-[0.99]">
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
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right leading-none">
          <div className="text-2xl font-bold tabular-nums">{formatRecord(t.record)}</div>
          {opponents.length > 0 && (
            <div className="flex items-center -space-x-1.5" aria-label="Opponents faced">
              {opponents.slice(0, 4).map((o) => (
                <LeaderAvatar key={o.id} name={o.name} colors={o.colors} size="sm" className="ring-2 ring-card" />
              ))}
              {opponents.length > 4 && (
                <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[0.625rem] font-semibold text-muted-foreground ring-2 ring-card">
                  +{opponents.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
