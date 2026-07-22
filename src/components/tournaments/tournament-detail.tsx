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
import { RoundFormSheet } from './round-form-sheet';
import { RoundItem } from './round-item';
import { ReferenceCombobox } from './reference-combobox';
import {
  useTournament, useLeaders, useUpdateTournament, useAddRound, useUpdateRound, useDeleteRound,
  useFinishTournament, useReopenTournament, useDeleteTournament,
} from '@/components/query-hooks';
import { formatRecord, computeRecord } from '@/lib/record';
import { tournamentTypeLabel } from '@/lib/labels';
import type { RoundDTO } from '@/lib/dto';
import { useOnlineStatus } from '@/lib/use-online-status';
import { ShareDialog } from '@/components/share/share-dialog';
import { TournamentShareCard } from '@/components/share/tournament-share-card';
import { shareFilename } from '@/lib/share-image';

export function TournamentDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: t, isLoading, isError } = useTournament(id);
  const { data: leaders } = useLeaders();
  const updateTournament = useUpdateTournament(id);
  const addRound = useAddRound(id);
  const updateRound = useUpdateRound(id);
  const deleteRound = useDeleteRound(id);
  const finish = useFinishTournament(id);
  const reopen = useReopenTournament(id);
  const removeTournament = useDeleteTournament();
  const online = useOnlineStatus();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RoundDTO | undefined>();
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) return <main className="mx-auto max-w-xl p-4"><Skeleton className="h-24 w-full" /></main>;
  if (isError || !t) return <main className="mx-auto max-w-xl p-4"><p className="text-destructive">Couldn&apos;t load this tournament.</p></main>;

  const editable = t.status === 'draft';
  const leaderName = (lid: string) => leaders?.find((l) => l.id === lid)?.name ?? '—';
  const record = computeRecord(t.rounds);

  async function handleDeleteRound(r: RoundDTO) {
    if (!online) { toast.error("You're offline — reconnect to save"); return; }
    await deleteRound.mutateAsync(r.id);
    toast('Round deleted', {
      action: {
        label: 'Undo',
        onClick: () => addRound.mutate({
          opponentLeaderId: r.opponentLeaderId,
          result: r.result, playOrder: r.playOrder, notes: r.notes,
        }),
      },
    });
  }

  return (
    <main className="mx-auto max-w-xl p-4 pb-28">
      <button onClick={() => router.push('/')} className="mb-2 text-sm text-muted-foreground">← All tournaments</button>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tournamentTypeLabel(t.type)}</Badge>
            <Badge variant={editable ? 'outline' : 'default'}>{editable ? 'Draft' : 'Locked'}</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold">{t.name ?? tournamentTypeLabel(t.type)}</h1>
          <p className="text-sm text-muted-foreground">{t.playedOn}</p>
          <div className="mt-2 max-w-[16rem]">
            {editable ? (
              <ReferenceCombobox
                options={leaders ?? []}
                value={t.myLeaderId}
                onChange={(lid) => { if (lid && lid !== t.myLeaderId) updateTournament.mutate({ myLeaderId: lid }); }}
                onAddCustom={async () => ({ id: t.myLeaderId, name: leaderName(t.myLeaderId) })}
                placeholder="Leader" />
            ) : (
              <p className="text-sm">Leader: <span className="font-medium">{leaderName(t.myLeaderId)}</span></p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-3xl font-bold tabular-nums">{formatRecord(record)}</div>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>Share</Button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {t.rounds.length === 0 && <p className="text-sm text-muted-foreground">No rounds yet.</p>}
        {t.rounds.map((r) => (
          <RoundItem key={r.id} round={r} leaderName={leaderName} editable={editable}
            onEdit={() => { setEditing(r); setSheetOpen(true); }}
            onDelete={() => handleDeleteRound(r)} />
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {editable ? (
          <Dialog>
            <DialogTrigger render={<Button variant="outline" className="h-12 flex-1">Finish</Button>} />
            <DialogContent>
              <DialogHeader><DialogTitle>Finish tournament?</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">This locks the tournament. You can reopen it later to make changes.</p>
              <DialogFooter>
                <Button onClick={() => {
                  if (!online) { toast.error("You're offline — reconnect to save"); return; }
                  finish.mutate();
                }}>Finish & Lock</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button variant="outline" className="h-12 flex-1" onClick={() => {
            if (!online) { toast.error("You're offline — reconnect to save"); return; }
            reopen.mutate();
          }}>Reopen</Button>
        )}
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" className="h-12">Delete</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Delete tournament?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This permanently removes the tournament and all its rounds.</p>
            <DialogFooter>
              <Button variant="destructive" onClick={async () => {
                if (!online) { toast.error("You're offline — reconnect to save"); return; }
                await removeTournament.mutateAsync(t.id);
                router.push('/');
              }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editable && (
        <div className="fixed inset-x-0 bottom-4 mx-auto w-[calc(100%-2rem)] max-w-xl">
          <Button className="h-14 w-full text-base shadow-lg" onClick={() => { setEditing(undefined); setSheetOpen(true); }}>+ Add Round</Button>
        </div>
      )}

      <RoundFormSheet open={sheetOpen} onOpenChange={setSheetOpen} initial={editing}
        onSubmit={async (data) => {
          if (!online) { toast.error("You're offline — reconnect to save"); return; }
          try {
            if (editing) await updateRound.mutateAsync({ id: editing.id, body: data });
            else await addRound.mutateAsync(data);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not save round');
            throw e;
          }
        }} />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Share tournament"
        filename={shareFilename('tournament', t.name ?? tournamentTypeLabel(t.type))}
      >
        <TournamentShareCard tournament={t} leaderName={leaderName} />
      </ShareDialog>
    </main>
  );
}
