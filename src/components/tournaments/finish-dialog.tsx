'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { placementLabel } from '@/lib/placement';
import { placementIssue } from '@/lib/validation/tournament';
import type { TournamentDetailDTO } from '@/lib/dto';

/**
 * Finishing an event, and saying where you came.
 *
 * The placement is optional and stays optional: standings are often posted long
 * after you have left the hall, and refusing to lock a tournament over a number
 * nobody has told you yet would break the log-first principle for the sake of
 * tidier data.
 *
 * The field size is prefilled from what was recorded when the event was
 * created, so the common case asks for one number rather than two.
 */
export function FinishDialog({
  tournament,
  onFinish,
}: {
  tournament: TournamentDetailDTO;
  onFinish: (placement: number | null, fieldSize: number | null) => void;
}) {
  const [placement, setPlacement] = useState('');
  const [players, setPlayers] = useState(tournament.fieldSize != null ? String(tournament.fieldSize) : '');

  const num = (v: string) => (v.trim() === '' ? null : Math.max(1, Number.parseInt(v, 10) || 1));
  const p = num(placement);
  const f = num(players);
  const issue = placementIssue({ placement: p, fieldSize: f });
  const preview = placementLabel(p, f);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" className="h-12 flex-1">Finish</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Finish tournament?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This locks the tournament. You can reopen it later to make changes.</p>

        <div className="mt-1 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="fin-placement" className="text-sm font-medium">You finished</label>
            <Input
              id="fin-placement"
              type="number"
              inputMode="numeric"
              min={1}
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              placeholder="e.g. 2"
              className="h-12 text-base" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fin-players" className="text-sm font-medium">Out of</label>
            <Input
              id="fin-players"
              type="number"
              inputMode="numeric"
              min={1}
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
              placeholder="e.g. 14"
              className="h-12 text-base" />
          </div>
        </div>

        {issue ? (
          <p className="text-sm text-destructive">{issue}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {preview
              ? <>Recorded as <span className="font-semibold text-foreground">{preview}</span>.</>
              : 'Leave blank if you don’t know yet — you can add it later.'}
          </p>
        )}

        <DialogFooter>
          <Button disabled={Boolean(issue)} onClick={() => onFinish(p, f)}>Finish &amp; Lock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
