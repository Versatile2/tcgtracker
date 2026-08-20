'use client';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { LeaderPicker } from '@/components/leaders/leader-picker';
import { useLeaders, useStats, useTournamentWrites } from '@/components/query-hooks';
import { tournamentTypeLabel } from '@/lib/labels';
import { FREEPLAY_TYPES, TOURNAMENT_TYPES, isFreeplay } from '@/lib/tournament-kinds';
import { cn } from '@/lib/utils';
import type { TournamentType, TournamentSummaryDTO } from '@/lib/dto';

/**
 * Confirms a conversion across the tournament/session boundary.
 *
 * A confirm step, not a form: the row already has a name, a date, a meta —
 * everything but the one or two things that change. The only real decisions
 * are the destination type and, rarely, the leader the new tournament will
 * carry, so that is all this asks.
 */
export function ConvertSheet({
  open, onOpenChange, tournament, onConverted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being converted, or null while the sheet is closed/animating out. */
  tournament: TournamentSummaryDTO | null;
  onConverted?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <div className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        {/* Keyed by tournament id, same reason as the action sheet's own Body:
            a remount is the reset, so a leftover pick can never leak onto the
            next card this sheet opens for. */}
        {tournament && (
          <Body key={tournament.id} t={tournament} close={() => onOpenChange(false)} onConverted={onConverted} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({ t, close, onConverted }: {
  t: TournamentSummaryDTO;
  close: () => void;
  onConverted?: () => void;
}) {
  const writes = useTournamentWrites();
  const { data: leaders } = useLeaders();
  const { data: stats } = useStats();
  const myDeckIds = (stats?.playedLeaders ?? []).map((l) => l.id);

  // The direction is a fact about the row, not a choice — a session converts
  // to a tournament and a tournament to a session, never sideways.
  const toTournament = isFreeplay(t.type);
  const offered = toTournament ? TOURNAMENT_TYPES : FREEPLAY_TYPES;
  const [pickedType, setPickedType] = useState<TournamentType>(offered[0]);

  // Zero decks means no round carries a leader to promote, and the tournament
  // this becomes needs one. At one deck the write (mirroring the server)
  // promotes it automatically, so asking again here would just repeat a fact
  // the player already gave when they logged the rounds.
  const needsLeader = toTournament && t.deckCount === 0;
  const [pickedLeaderId, setPickedLeaderId] = useState<string | null>(null);

  function confirm() {
    writes.convert(t.id, {
      type: pickedType,
      ...(needsLeader ? { myLeaderId: pickedLeaderId! } : {}),
    });
    close();
    onConverted?.();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{toTournament ? 'Convert to a tournament?' : 'Convert to a session?'}</SheetTitle>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-6">
        <p className="text-sm text-muted-foreground">
          {toTournament
            ? 'This moves it into your competitive record — it will count toward your win rate, tournament count and achievements.'
            : "This moves it out of your competitive record — it won't count toward your win rate, tournament count or achievements."}
        </p>

        <div className="space-y-2">
          <span className="text-sm font-medium">Type</span>
          {/* Same chip markup and ARIA as the Type strip in tournament-form.tsx,
              so choosing a destination type reads as the same control as
              choosing one when you first log the event. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Type">
            {offered.map((ty) => (
              <button
                key={ty}
                type="button"
                role="radio"
                aria-checked={pickedType === ty}
                onClick={() => setPickedType(ty)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  pickedType === ty
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md',
                )}
              >
                {tournamentTypeLabel(ty)}
              </button>
            ))}
          </div>
        </div>

        {needsLeader && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Leader</span>
            <LeaderPicker
              suggested={myDeckIds}
              recentKey="my-deck"
              suggestionsPending={stats === undefined}
              options={leaders ?? []} value={pickedLeaderId} onChange={setPickedLeaderId} />
          </div>
        )}

        <Button onClick={confirm} disabled={needsLeader && !pickedLeaderId} className="h-12 w-full text-base">
          {toTournament ? 'Convert to tournament' : 'Convert to session'}
        </Button>
      </div>
    </>
  );
}
