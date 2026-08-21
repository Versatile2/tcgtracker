'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  NumberPicker, COMMON_FIELD_SIZES, placementOptions,
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
 * The turnout is asked here rather than at creation. You rarely know the real
 * number when you sign up, and asking twice for one fact meant the creation
 * form carried a question most people skipped. It is prefilled on a reopened
 * event from whatever was recorded the first time round.
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
  const issue = placementIssue({ placement: p, fieldSize: f });
  const preview = placementLabel(p, f);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" className="h-12 flex-1">Finish</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Finish tournament?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This locks the tournament. You can reopen it later to make changes.</p>

        <div className="mt-1 space-y-4">
          {/* Asked first, and it is not politeness: the turnout is what sizes
              the position chips below it. Answering it up front means the
              positions offered are the positions that existed. */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">How many played</span>
            <NumberPicker
              id="fin-players"
              value={players}
              onChange={setPlayers}
              options={COMMON_FIELD_SIZES}
              ariaLabel="How many played"
              placeholder="e.g. 47" />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Where you finished</span>
            {/* No large-field special case any more: the picker's own field is
                always present, so a 247th place is typed here exactly as it was
                when this branched, and the chips below stay a shortcut for the
                positions most people actually record. */}
            <NumberPicker
              id="fin-placement"
              value={placement}
              onChange={setPlacement}
              options={placementOptions(f)}
              ariaLabel="Where you finished"
              placeholder="e.g. 12" />
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
