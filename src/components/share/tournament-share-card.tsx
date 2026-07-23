import { Badge } from '@/components/ui/badge';
import { formatRecord, computeRecord } from '@/lib/record';
import { tournamentTypeLabel, roundKindLabel } from '@/lib/labels';
import type { TournamentDetailDTO } from '@/lib/dto';
import { Watermark } from './watermark';

const chip: Record<'win' | 'loss' | 'draw', string> = {
  win: 'bg-green-600 text-white',
  loss: 'bg-red-600 text-white',
  draw: 'bg-yellow-500 text-black',
};

export function TournamentShareCard({
  tournament,
  leaderName,
}: {
  tournament: TournamentDetailDTO;
  leaderName: (id: string) => string;
}) {
  const record = computeRecord(tournament.rounds);
  return (
    <div className="w-[380px] space-y-3 rounded-xl border bg-card p-5 text-card-foreground">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{tournamentTypeLabel(tournament.type)}</Badge>
        <span className="text-sm text-muted-foreground">{tournament.playedOn}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-lg font-bold leading-tight">{tournament.name ?? tournamentTypeLabel(tournament.type)}</p>
        <p className="shrink-0 text-3xl font-bold tabular-nums">{formatRecord(record)}</p>
      </div>
      <p className="text-sm text-muted-foreground">Leader: <span className="text-foreground">{leaderName(tournament.myLeaderId)}</span></p>
      <div className="space-y-1">
        {tournament.rounds.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-muted-foreground">{r.roundNumber}</span>
            <Badge className={chip[r.result]}>{r.result[0].toUpperCase()}</Badge>
            <span className="truncate">{r.opponentLeaderId ? leaderName(r.opponentLeaderId) : roundKindLabel(r.kind)}</span>
          </div>
        ))}
        {tournament.rounds.length === 0 && <p className="text-sm text-muted-foreground">No rounds logged</p>}
      </div>
      <Watermark />
    </div>
  );
}
