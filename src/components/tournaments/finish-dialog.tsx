'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NumberPicker, COMMON_FIELD_SIZES, MAX_PICKABLE_PLACEMENT, placementOptions,
} from '@/components/ui/number-picker';
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
  const [placement, setPlacement] = useState<number | null>(null);
  const [players, setPlayers] = useState<number | null>(tournament.fieldSize);

  const p = placement;
  const f = players;
  /** Empty means unknown, not zero — a placement is often learned later. */
  const toNum = (v: string) => (v.trim() === '' ? null : Math.max(1, Number.parseInt(v, 10) || 1));
  const issue = placementIssue({ placement: p, fieldSize: f });
  const preview = placementLabel(p, f);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" className="h-12 flex-1">Finish</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Finish tournament?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This locks the tournament. You can reopen it later to make changes.</p>

        <div className="mt-1 space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">You finished</span>
            {/* Above 32 players, finding your position in a strip is slower than
                typing it — so the picker gives way to a field. */}
            {f !== null && f > MAX_PICKABLE_PLACEMENT ? (
              <Input
                id="fin-placement"
                type="number"
                inputMode="numeric"
                min={1}
                value={placement ?? ''}
                onChange={(e) => setPlacement(toNum(e.target.value))}
                placeholder="e.g. 12"
                className="h-12 text-base" />
            ) : (
              <NumberPicker
                id="fin-placement"
                value={placement}
                onChange={setPlacement}
                options={placementOptions(f)}
                ariaLabel="Where you finished"
                placeholder="e.g. 12" />
            )}
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Out of</span>
            <NumberPicker
              id="fin-players"
              value={players}
              onChange={setPlayers}
              options={COMMON_FIELD_SIZES}
              ariaLabel="How many played"
              placeholder="e.g. 47" />
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
