import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRecord } from '@/lib/record';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentSummaryDTO } from '@/lib/dto';

export function TournamentCard({ t }: { t: TournamentSummaryDTO }) {
  return (
    <Link href={`/tournaments/${t.id}`}>
      <Card className="p-4 flex items-center justify-between active:scale-[0.99] transition-transform">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tournamentTypeLabel(t.type)}</Badge>
            {t.status === 'locked' && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <p className="mt-1 truncate font-medium">{t.name ?? tournamentTypeLabel(t.type)}</p>
          <p className="text-sm text-muted-foreground">{t.playedOn}</p>
        </div>
        <div className="text-2xl font-bold tabular-nums">{formatRecord(t.record)}</div>
      </Card>
    </Link>
  );
}
