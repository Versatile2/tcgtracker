'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { roundKindLabel } from '@/lib/labels';
import type { RoundDTO, LeaderDTO } from '@/lib/dto';

const resultStyle: Record<RoundDTO['result'], string> = {
  win: 'bg-green-600 text-white',
  loss: 'bg-red-600 text-white',
  draw: 'bg-yellow-500 text-black',
};

function gameScore(games: RoundDTO['games']): string | null {
  if (!games || games.length === 0) return null;
  const myWins = games.filter((g) => g.result === 'win').length;
  return `${myWins}–${games.length - myWins}`;
}

export function RoundItem({
  round, myLeader, resolveLeader, metaName, onEdit, onDelete, editable,
}: {
  round: RoundDTO;
  myLeader?: { name: string; colors: string[] };
  resolveLeader: (id: string) => LeaderDTO | undefined;
  metaName: (id: string) => string;
  onEdit: () => void;
  onDelete: () => void;
  editable: boolean;
}) {
  const opponent = round.opponentLeaderId ? resolveLeader(round.opponentLeaderId) : undefined;
  const hasOpponent = round.opponentLeaderId !== null;
  const canEdit = editable && hasOpponent; // bye / no_show are delete-only
  const score = gameScore(round.games);

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <LeaderAvatar name={myLeader?.name ?? '—'} colors={myLeader?.colors} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge className={resultStyle[round.result]}>{round.result[0].toUpperCase()}</Badge>
          <span className="text-xs text-muted-foreground">Round {round.roundNumber}</span>
          {round.kind === 'top_cut' && score && <span className="text-xs font-medium">Top Cut · {score}</span>}
        </div>
        {hasOpponent ? (
          <p className="mt-0.5 truncate text-sm">
            vs <span className="text-foreground">{opponent?.name ?? '—'}</span>
            {round.opponentMetaId && <span className="text-muted-foreground"> · {metaName(round.opponentMetaId)}</span>}
          </p>
        ) : (
          <p className="mt-0.5 truncate text-sm font-medium">{roundKindLabel(round.kind)}</p>
        )}
        {round.kind === 'swiss' && round.playOrder && (
          <p className="text-xs text-muted-foreground">Went {round.playOrder === 'first' ? '1st' : '2nd'}</p>
        )}
        {round.notes && <p className="truncate text-xs text-muted-foreground">{round.notes}</p>}
      </div>

      {hasOpponent && <LeaderAvatar name={opponent?.name ?? '—'} colors={opponent?.colors} size="md" />}

      {editable && (
        <div className="flex shrink-0 flex-col gap-1">
          {canEdit && <Button variant="ghost" onClick={onEdit} className="h-9 px-2 text-xs text-muted-foreground">Edit</Button>}
          <Button variant="ghost" onClick={onDelete} className="h-9 px-2 text-xs text-destructive hover:text-destructive">Delete</Button>
        </div>
      )}
    </div>
  );
}
