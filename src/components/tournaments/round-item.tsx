'use client';
import { Badge } from '@/components/ui/badge';
import type { RoundDTO } from '@/lib/dto';

const resultStyle: Record<RoundDTO['result'], string> = {
  win: 'bg-green-600 text-white',
  loss: 'bg-red-600 text-white',
  draw: 'bg-yellow-500 text-black',
};

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
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="w-6 text-center text-sm text-muted-foreground">{round.roundNumber}</div>
      <Badge className={resultStyle[round.result]}>{round.result[0].toUpperCase()}</Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          vs <span className="text-foreground">{leaderName(round.opponentLeaderId)}</span>
          {round.opponentMetaId && <span className="text-muted-foreground"> · {metaName(round.opponentMetaId)}</span>}
        </p>
        {round.playOrder && <p className="text-xs text-muted-foreground">Went {round.playOrder === 'first' ? '1st' : '2nd'}</p>}
        {round.notes && <p className="truncate text-xs text-muted-foreground">{round.notes}</p>}
      </div>
      {editable && (
        <div className="flex gap-1">
          <button onClick={onEdit} className="px-2 py-1 text-xs text-muted-foreground">Edit</button>
          <button onClick={onDelete} className="px-2 py-1 text-xs text-destructive">Delete</button>
        </div>
      )}
    </div>
  );
}
