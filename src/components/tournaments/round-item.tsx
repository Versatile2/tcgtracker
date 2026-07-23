'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { roundKindLabel } from '@/lib/labels';
import type { RoundDTO } from '@/lib/dto';

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
  round, leaderName, metaName, onEdit, onDelete, editable,
}: {
  round: RoundDTO;
  leaderName: (id: string) => string;
  metaName: (id: string) => string;
  onEdit: () => void;
  onDelete: () => void;
  editable: boolean;
}) {
  const hasOpponent = round.opponentLeaderId !== null;
  const canEdit = editable && hasOpponent; // bye / no_show are delete-only
  const score = gameScore(round.games);

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="w-6 text-center text-sm text-muted-foreground">{round.roundNumber}</div>
      <Badge className={resultStyle[round.result]}>{round.result[0].toUpperCase()}</Badge>
      <div className="min-w-0 flex-1">
        {hasOpponent ? (
          <p className="truncate text-sm">
            vs <span className="text-foreground">{leaderName(round.opponentLeaderId!)}</span>
            {round.opponentMetaId && <span className="text-muted-foreground"> · {metaName(round.opponentMetaId)}</span>}
          </p>
        ) : (
          <p className="truncate text-sm font-medium">{roundKindLabel(round.kind)}</p>
        )}
        {round.kind === 'top_cut' && score && (
          <p className="text-xs text-muted-foreground">Top Cut · {score}</p>
        )}
        {round.kind === 'swiss' && round.playOrder && (
          <p className="text-xs text-muted-foreground">Went {round.playOrder === 'first' ? '1st' : '2nd'}</p>
        )}
        {round.notes && <p className="truncate text-xs text-muted-foreground">{round.notes}</p>}
      </div>
      {editable && (
        <div className="flex shrink-0 gap-1">
          {canEdit && <Button variant="ghost" onClick={onEdit} className="h-11 px-3 text-muted-foreground">Edit</Button>}
          <Button variant="ghost" onClick={onDelete} className="h-11 px-3 text-destructive hover:text-destructive">Delete</Button>
        </div>
      )}
    </div>
  );
}
