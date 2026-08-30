'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Share2, Lock, LockOpen, Trash2, Shuffle, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { TypeGlyph } from './type-glyph';
import { TypeBadge } from './type-badge';
import { ConvertSheet } from './convert-sheet';
import { useTournamentWrites } from '@/components/query-hooks';
import { tournamentTypeLabel } from '@/lib/labels';
import { formatPlayedOn } from '@/lib/format-date';
import { placementLabel } from '@/lib/placement';
import { MATCH_TYPE } from '@/lib/tournament-kinds';
import { cn } from '@/lib/utils';
import type { LeaderDTO, TournamentSummaryDTO } from '@/lib/dto';
import { isSession } from '@/lib/tournament-kinds';

/**
 * What you can do to an event without opening it.
 *
 * A bottom sheet rather than a floating context menu: it is within one-handed
 * reach on a phone, and the `+` chooser already established the idiom here.
 *
 * One of these is mounted for the whole list rather than one per card, on a
 * list that can run to dozens.
 */
export function CardActionsSheet({
  target,
  onOpenChange,
  resolveLeader,
}: {
  /** The card being acted on, or null when the sheet is closed. */
  target: TournamentSummaryDTO | null;
  onOpenChange: (open: boolean) => void;
  resolveLeader: (id: string) => LeaderDTO | undefined;
}) {
  // Lives here, not inside Body: running the convert action closes the
  // actions sheet, which unmounts Body immediately — a state that must
  // outlive that close belongs to the component that doesn't unmount.
  const [converting, setConverting] = useState<TournamentSummaryDTO | null>(null);

  return (
    <>
      <Sheet open={Boolean(target)} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <div className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          {/* Keyed by target, so a new card always opens on the actions and never
              on a confirmation left over from the last one. A remount rather than
              an effect that resets it. */}
          {target && (
            <Body
              key={target.id}
              t={target}
              close={() => onOpenChange(false)}
              resolveLeader={resolveLeader}
              onConvert={() => { onOpenChange(false); setConverting(target); }}
            />
          )}
        </SheetContent>
      </Sheet>
      <ConvertSheet
        open={Boolean(converting)}
        onOpenChange={(open) => { if (!open) setConverting(null); }}
        tournament={converting}
      />
    </>
  );
}

type Action = { key: string; icon: LucideIcon; label: string; run: () => void; danger?: boolean };

function Body({
  t,
  close,
  resolveLeader,
  onConvert,
}: {
  t: TournamentSummaryDTO;
  close: () => void;
  resolveLeader: (id: string) => LeaderDTO | undefined;
  onConvert: () => void;
}) {
  const router = useRouter();
  const writes = useTournamentWrites();
  const [confirming, setConfirming] = useState(false);

  const isMatch = t.type === MATCH_TYPE;
  const session = isSession(t.type);
  const drafting = t.status === 'draft';
  const leader = t.myLeaderId ? resolveLeader(t.myLeaderId) : undefined;
  const noun = isMatch ? 'free play' : session ? 'session' : 'tournament';

  const actions: Action[] = [
    // Absent on a finished tournament: /tournaments/[id]/edit refuses one, and
    // a menu should not offer a door that is locked.
    ...(isMatch || drafting ? [{
      key: 'edit', icon: Pencil, label: 'Edit',
      run: () => { close(); router.push(isMatch ? `/matches/${t.id}` : `/tournaments/${t.id}/edit`); },
    } as Action] : []),
    {
      // The share card needs full rounds, which the list does not hold, so this
      // opens the existing dialog on the detail screen rather than duplicating it.
      key: 'share', icon: Share2, label: 'Share',
      run: () => { close(); router.push(isMatch ? `/matches/${t.id}` : `/tournaments/${t.id}?share=1`); },
    },
    // A match cannot be converted — it is a single game, not an event with a
    // segment to move between. A session offers the reverse only when it has
    // at most one distinct deck across its rounds: with two or more, no single
    // leader exists for the tournament this would become, and a menu should
    // not offer a door that is locked.
    ...(isMatch ? [] : session
      ? (t.deckCount <= 1 ? [{
          key: 'convert', icon: Trophy, label: 'Convert to tournament',
          run: () => onConvert(),
        } as Action] : [])
      : [{
          key: 'convert', icon: Shuffle, label: 'Convert to session',
          run: () => onConvert(),
        } as Action]),
    // A match is a single game with no draft state worth toggling.
    ...(isMatch ? [] : [drafting
      ? {
        key: 'finish', icon: Lock, label: session ? 'Finish session' : 'Finish',
        run: () => { close(); writes.finish(t.id); },
      } as Action
      : {
        key: 'reopen', icon: LockOpen, label: 'Reopen',
        run: () => { close(); writes.reopen(t.id); },
      } as Action]),
    { key: 'delete', icon: Trash2, label: 'Delete', danger: true, run: () => setConfirming(true) },
  ];

  return (
    <>
      <SheetHeader>
        <SheetTitle className="sr-only">Actions for this {noun}</SheetTitle>
      </SheetHeader>

      {/* Identity first: it must be obvious which event is about to change. */}
      <div className="flex items-center gap-3 px-4 pb-3">
        {session
          ? <TypeGlyph type={t.type} size="md" />
          : <LeaderAvatar name={leader?.name ?? '—'} colors={leader?.colors} leaderId={leader?.id} size="md" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">{t.name ?? tournamentTypeLabel(t.type)}</p>
          {/* TypeGlyph above is aria-hidden, and a named session states its type
              nowhere else in the accessible tree — the badge is what the card and
              detail header already use to say it in text. Only when named: unnamed
              falls back to the type label as the title above, and the badge would
              repeat the exact same word a line down. */}
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            {t.name && <TypeBadge type={t.type} />}
            <span className="min-w-0 truncate">
              {formatPlayedOn(t.playedOn)}
              {placementLabel(t.placement, t.fieldSize) && <> · {placementLabel(t.placement, t.fieldSize)}</>}
            </span>
          </p>
        </div>
      </div>

      {confirming ? (
        /* Confirming in place rather than opening a dialog over the sheet — the
           leader picker records why: nesting overlays here is fragile. */
        <div className="space-y-3 px-4 pb-6">
          <p className="text-sm text-muted-foreground">
            This permanently removes the {noun}{isMatch ? '' : ' and all its rounds'}.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="h-12 flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="h-12 flex-1"
              onClick={() => { close(); writes.remove(t.id); }}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 px-4 pb-6">
          {actions.map(({ key, icon: Icon, label, run, danger }) => (
            <button
              key={key}
              type="button"
              onClick={run}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-border/70 p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                danger && 'text-destructive',
              )}
            >
              <span className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                danger ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary-ink',
              )}>
                <Icon className="size-5" />
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
