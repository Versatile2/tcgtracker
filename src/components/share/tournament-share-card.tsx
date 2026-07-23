import { Badge } from '@/components/ui/badge';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { cn } from '@/lib/utils';
import { formatRecord, computeRecord } from '@/lib/record';
import { tournamentTypeLabel, roundKindLabel } from '@/lib/labels';
import type { TournamentDetailDTO, RoundDTO, LeaderDTO, MetaDTO } from '@/lib/dto';

// Rows tint by result; the badge uses the stronger fill. Both read in light and dark.
const rowTint: Record<RoundDTO['result'], string> = {
  win: 'bg-green-500/10',
  loss: 'bg-red-500/10',
  draw: 'bg-yellow-500/10',
};
const resultBadge: Record<RoundDTO['result'], string> = {
  win: 'bg-green-600 text-white',
  loss: 'bg-red-600 text-white',
  draw: 'bg-yellow-500 text-black',
};

// Beyond this many rounds, switch to a compact row so a full Swiss stays on one PNG.
const CONDENSE_AT = 6;

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium tabular-nums">
      {children}
    </Badge>
  );
}

function MatchRow({
  round,
  opponent,
  metaName,
  condensed,
}: {
  round: RoundDTO;
  opponent: LeaderDTO | undefined;
  metaName: string | null;
  condensed: boolean;
}) {
  const hasOpponent = round.opponentLeaderId !== null;
  const name = hasOpponent ? (opponent?.name ?? '—') : roundKindLabel(round.kind);
  const order = round.playOrder ? (round.playOrder === 'first' ? '1st' : '2nd') : null;

  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg', rowTint[round.result], condensed ? 'p-1.5' : 'p-2.5')}>
      <span className="w-4 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
        {round.roundNumber}
      </span>
      {!condensed && hasOpponent && <LeaderAvatar name={opponent?.name ?? '—'} colors={opponent?.colors} size="sm" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name}
          {hasOpponent && opponent?.setCode && (
            <span className="font-normal text-muted-foreground"> {opponent.setCode}</span>
          )}
          {!condensed && metaName && <span className="font-normal text-muted-foreground"> · {metaName}</span>}
        </p>
        {!condensed && round.notes && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{round.notes}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!condensed && round.wonDieRoll !== null && <Pill>{round.wonDieRoll ? '🎲 Won' : '🎲 Lost'}</Pill>}
        {order && <Pill>{order}</Pill>}
        <Badge className={cn('h-5', resultBadge[round.result])}>{round.result[0].toUpperCase()}</Badge>
      </div>
    </div>
  );
}

export function TournamentShareCard({
  tournament,
  leaders,
  metas,
}: {
  tournament: TournamentDetailDTO;
  leaders: LeaderDTO[];
  metas: MetaDTO[];
}) {
  const leaderById = (id: string): LeaderDTO | undefined => leaders.find((l) => l.id === id);
  const metaById = (id: string): MetaDTO | undefined => metas.find((m) => m.id === id);

  const myLeader = leaderById(tournament.myLeaderId);
  const record = formatRecord(computeRecord(tournament.rounds));
  const eventName = tournament.name ?? tournamentTypeLabel(tournament.type);
  const eventMeta = tournament.metaId ? metaById(tournament.metaId) : undefined;
  const condensed = tournament.rounds.length > CONDENSE_AT;

  return (
    <div className="w-[380px] space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
      {/* Header: leader (left), record, event tags (right) */}
      <div className="flex items-start gap-3">
        <LeaderAvatar name={myLeader?.name ?? '—'} colors={myLeader?.colors} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight">{myLeader?.name ?? '—'}</p>
          {myLeader?.setCode && <p className="text-xs text-muted-foreground">{myLeader.setCode}</p>}
          <p className="mt-1 text-3xl font-bold leading-none tabular-nums">{record}</p>
        </div>
        <div className="min-w-0 shrink-0 text-right">
          <p className="truncate text-sm font-semibold">{eventName}</p>
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            <Badge variant="secondary">{tournamentTypeLabel(tournament.type)}</Badge>
            {eventMeta && <Badge variant="outline">{eventMeta.code ?? eventMeta.name}</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{tournament.playedOn}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Made with Grand Line TCG</p>
        </div>
      </div>

      {/* Match rows */}
      <div className={cn(condensed ? 'space-y-1' : 'space-y-1.5')}>
        {tournament.rounds.map((r) => (
          <MatchRow
            key={r.id}
            round={r}
            opponent={r.opponentLeaderId ? leaderById(r.opponentLeaderId) : undefined}
            metaName={r.opponentMetaId ? (metaById(r.opponentMetaId)?.name ?? null) : null}
            condensed={condensed}
          />
        ))}
        {tournament.rounds.length === 0 && <p className="text-sm text-muted-foreground">No rounds logged</p>}
      </div>

      {/* Footer brand */}
      <div className="border-t pt-3 text-center">
        <p className="text-sm font-bold tracking-tight">Grand Line TCG</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">tcgtracker-three.vercel.app</p>
      </div>
    </div>
  );
}
