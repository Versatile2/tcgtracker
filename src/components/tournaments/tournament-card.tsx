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
        <div className="shrink-0 text-right leading-none">
          <div className="text-2xl font-bold tabular-nums">{formatRecord(t.record)}</div>
          <div className="mt-1.5 text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t.record.draws > 0 ? 'W–L–D' : 'W–L'}
          </div>
        </div>
      </Card>
    </Link>
  );
}
