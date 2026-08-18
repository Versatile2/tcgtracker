'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { NavBar } from '@/components/nav/nav-bar';
import { RoundFormSheet } from './round-form-sheet';
import { RoundItem } from './round-item';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { FreeplayGlyph } from './freeplay-glyph';
import {
  useTournament, useLeaders, useMetas, useTournamentWrites, useRoundWrites,
} from '@/components/query-hooks';
import { useOutbox, pendingRoundIds } from '@/lib/outbox/use-outbox';
import { useLogCelebration } from '@/components/celebrate/use-log-celebration';
import { matchResultFromGames } from '@/lib/validation/round';
import { formatRecord, computeRecord } from '@/lib/record';
import { tournamentTypeLabel } from '@/lib/labels';
import { formatPlayedOn } from '@/lib/format-date';
import type { RoundDTO } from '@/lib/dto';
import type { CreateRoundInput } from '@/lib/validation/round';
import { ShareDialog } from '@/components/share/share-dialog';
import { TournamentShareCard } from '@/components/share/tournament-share-card';
import { shareFilename } from '@/lib/share-image';

/** Reconstruct a create payload from an existing round (for the delete → Undo action). */
function roundToInput(r: RoundDTO): CreateRoundInput {
  switch (r.kind) {
    case 'swiss':
      return { kind: 'swiss', opponentLeaderId: r.opponentLeaderId!, opponentMetaId: r.opponentMetaId, result: r.result, playOrder: r.playOrder, wonDieRoll: r.wonDieRoll, notes: r.notes, myLeaderId: r.myLeaderId };
    case 'top_cut':
      return { kind: 'top_cut', opponentLeaderId: r.opponentLeaderId!, opponentMetaId: r.opponentMetaId, games: r.games ?? [], notes: r.notes, myLeaderId: r.myLeaderId };
    case 'bye':
      return { kind: 'bye', notes: r.notes };
    case 'no_show':
      return { kind: 'no_show', notes: r.notes };
  }
}

export function TournamentDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: t, isLoading, isError } = useTournament(id);
  const { data: leaders } = useLeaders();
  const { data: metas } = useMetas();
  const tournamentWrites = useTournamentWrites();
  const roundWrites = useRoundWrites(id);
  const { entries } = useOutbox();
  const logCelebration = useLogCelebration();
  const unsyncedRounds = pendingRoundIds(entries);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RoundDTO | undefined>();
  const [shareOpen, setShareOpen] = useState(false);

  // Back to the segment this came from, not always Tournaments — a freeplay
  // session lives under its own tab now.
  const backToList = () => router.push(t?.type === 'freeplay' ? '/?tab=freeplay' : '/');

  if (isLoading) return <><NavBar backLabel="Tournaments" onBack={backToList} /><main className="mx-auto max-w-xl p-4"><Skeleton className="h-24 w-full" /></main></>;
  if (isError || !t) return <><NavBar backLabel="Tournaments" onBack={backToList} /><main className="mx-auto max-w-xl p-4"><p className="text-destructive">Couldn&apos;t load this tournament.</p></main></>;

  const editable = t.status === 'draft';
  const leaderName = (lid: string) => leaders?.find((l) => l.id === lid)?.name ?? '—';
  const record = computeRecord(t.rounds);
  const myLeader = t.myLeaderId ? leaders?.find((l) => l.id === t.myLeaderId) : undefined;
  // Freeplay rounds each record their own deck; classic tournaments fall back
  // to the session leader.
  // Freeplay records a deck per round, so each row names its own. Every other
  // type has one leader for the whole event: repeating it on every row costs
  // height on the densest screen and says nothing the header has not said.
  const leaderForRound = (r: RoundDTO) => {
    if (t.type !== 'freeplay') return undefined;
    const l = r.myLeaderId ? leaders?.find((x) => x.id === r.myLeaderId) : undefined;
    return l ? { name: l.name, colors: l.colors, setCode: l.setCode } : undefined;
  };

  function handleDeleteRound(r: RoundDTO) {
    roundWrites.remove(r.id);
    toast('Round deleted', {
      action: {
        // Re-adding under the original id lets the outbox cancel the queued
        // delete outright when neither has been sent yet.
        label: 'Undo',
        onClick: () => roundWrites.add({ ...roundToInput(r), id: r.id }),
      },
    });
  }

  return (
    <>
    <NavBar backLabel={t.type === 'freeplay' ? 'Freeplay' : 'Tournaments'} onBack={backToList} />
    <main className="mx-auto max-w-xl p-4 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {t.type === 'freeplay'
            ? <FreeplayGlyph size="lg" />
            : <LeaderAvatar name={myLeader?.name ?? '—'} colors={myLeader?.colors} setCode={myLeader?.setCode} size="lg" />}
          <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tournamentTypeLabel(t.type)}</Badge>
            <Badge variant={editable ? 'outline' : 'default'}>{editable ? 'Draft' : 'Locked'}</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold">{t.name ?? tournamentTypeLabel(t.type)}</h1>
          <p className="text-sm text-muted-foreground">{formatPlayedOn(t.playedOn)}</p>
          {/* Text, never a control. The leader is what every statistic for this
              event hangs off, and it used to be an inline combobox sitting in
              the header — the one field you could change by accident while
              reading the page. It is changed on the edit screen now. */}
          {t.type !== 'freeplay' && t.myLeaderId && (
            <p className="mt-2 text-sm">Leader: <span className="font-medium">{leaderName(t.myLeaderId)}</span></p>
          )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-3xl font-bold tabular-nums">{formatRecord(record)}</div>
          <Button variant="outline" onClick={() => setShareOpen(true)} className="h-11 px-4">Share</Button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {t.rounds.length === 0 && <p className="text-sm text-muted-foreground">No rounds yet.</p>}
        {t.rounds.map((r) => (
          <RoundItem key={r.id} round={r}
            myLeader={leaderForRound(r)}
            resolveLeader={(id) => leaders?.find((l) => l.id === id)}
            editable={editable}
            unsynced={unsyncedRounds.has(r.id)}
            onEdit={() => { setEditing(r); setSheetOpen(true); }}
            onDelete={() => handleDeleteRound(r)} />
        ))}
      </div>

      {t.notes && (
        <p className="mt-5 rounded-xl border border-border/60 p-3 text-sm whitespace-pre-wrap text-muted-foreground">
          {t.notes}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        {editable && (
          <Button variant="outline" className="h-12 flex-1" onClick={() => router.push(`/tournaments/${id}/edit`)}>
            Edit
          </Button>
        )}
        {editable ? (
          <Dialog>
            <DialogTrigger render={<Button variant="outline" className="h-12 flex-1">Finish</Button>} />
            <DialogContent>
              <DialogHeader><DialogTitle>Finish tournament?</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">This locks the tournament. You can reopen it later to make changes.</p>
              <DialogFooter>
                <Button onClick={() => tournamentWrites.finish(id)}>Finish &amp; Lock</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button variant="outline" className="h-12 flex-1" onClick={() => tournamentWrites.reopen(id)}>Reopen</Button>
        )}
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" className="h-12">Delete</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Delete tournament?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This permanently removes the tournament and all its rounds.</p>
            <DialogFooter>
              <Button variant="destructive" onClick={() => {
                tournamentWrites.remove(id);
                router.push('/');
              }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editable && (
        <div className="fixed inset-x-0 bottom-[calc(1rem+3.25rem+env(safe-area-inset-bottom))] mx-auto w-[calc(100%-2rem)] max-w-xl">
          <Button className="h-14 w-full text-base shadow-lg" onClick={() => { setEditing(undefined); setSheetOpen(true); }}>New Round</Button>
        </div>
      )}

      <RoundFormSheet open={sheetOpen} onOpenChange={setSheetOpen} initial={editing}
        isFreeplay={t.type === 'freeplay'}
        defaultMyLeaderId={t.rounds.length > 0 ? (t.rounds[t.rounds.length - 1].myLeaderId ?? null) : null}
        onDelete={editing ? () => handleDeleteRound(editing) : undefined}
        onSubmit={async (data) => {
          if (editing) { roundWrites.update(editing.id, data); return; }
          // Only a new round is celebrated. Correcting an existing one is
          // bookkeeping, and a fanfare for fixing a typo would cheapen the real
          // ones — byes and no-shows are not games and pay nothing either.
          if (data.kind === 'bye' || data.kind === 'no_show') { roundWrites.add(data); return; }
          logCelebration(() => roundWrites.add(data), {
            result: data.kind === 'top_cut' ? matchResultFromGames(data.games) : data.result,
            myLeaderId: t.type === 'freeplay' ? (data.myLeaderId ?? null) : t.myLeaderId,
            opponentLeaderId: data.opponentLeaderId,
          });
        }} />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Share tournament"
        filename={shareFilename('tournament', t.name ?? tournamentTypeLabel(t.type))}
      >
        <TournamentShareCard tournament={t} leaders={leaders ?? []} metas={metas ?? []} />
      </ShareDialog>
    </main>
    </>
  );
}
