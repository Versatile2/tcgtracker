'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NavBar } from '@/components/nav/nav-bar';
import { LeaderCarousel } from '@/components/leaders/leader-carousel';
import { ReferenceCombobox } from './reference-combobox';
import { useLeaders, useAddCustomLeader, useMetas, useAddCustomMeta, useCreateTournament } from '@/components/query-hooks';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentType } from '@/lib/dto';
import { useOnlineStatus } from '@/lib/use-online-status';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

export function NewTournamentForm() {
  const router = useRouter();
  const { data: leaders } = useLeaders();
  const addLeader = useAddCustomLeader();
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();
  const create = useCreateTournament();
  const online = useOnlineStatus();

  const [type, setType] = useState<TournamentType>('local');
  const [myLeaderId, setMyLeaderId] = useState<string | null>(null);
  const [metaId, setMetaId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));

  async function submit() {
    if (!online) { toast.error("You're offline — reconnect to save"); return; }
    if (!myLeaderId) { toast.error('Choose your leader first'); return; }
    try {
      const t = await create.mutateAsync({
        type, myLeaderId, metaId: metaId ?? undefined, name: name.trim() || undefined, playedOn,
      });
      router.push(`/tournaments/${t.id}`);
    } catch {
      toast.error('Could not create tournament');
    }
  }

  return (
    <>
    <NavBar backLabel="Back" onBack={() => router.back()} />
    <main className="mx-auto max-w-xl space-y-5 p-4 pb-6">
      <h1 className="text-3xl font-bold tracking-tight">New Tournament</h1>

      <div className="space-y-2">
        <label htmlFor="nt-type" className="text-sm font-medium">Type</label>
        <Select value={type} onValueChange={(v) => setType(v as TournamentType)}>
          <SelectTrigger id="nt-type" className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{tournamentTypeLabel(ty)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Leader</span>
        <LeaderCarousel
          options={leaders ?? []} value={myLeaderId} onChange={setMyLeaderId}
          onAddCustom={async (n) => { const l = await addLeader.mutateAsync({ name: n, colors: [] }); return { id: l.id, name: l.name }; }} />
      </div>

      <div className="space-y-2">
        <label htmlFor="nt-meta" className="text-sm font-medium">Meta (optional)</label>
        <ReferenceCombobox
          id="nt-meta"
          options={metas ?? []} value={metaId} onChange={setMetaId}
          onAddCustom={async (n) => { const m = await addMeta.mutateAsync({ name: n }); return { id: m.id, name: m.name }; }}
          placeholder="e.g. OP16" />
      </div>

      <div className="space-y-2">
        <label htmlFor="nt-name" className="text-sm font-medium">Name (optional)</label>
        <Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Regional" className="h-12 text-base" />
      </div>

      <div className="space-y-2">
        <label htmlFor="nt-date" className="text-sm font-medium">Date</label>
        <Input id="nt-date" type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} className="h-12 text-base" />
      </div>

      <Button onClick={submit} disabled={create.isPending || !myLeaderId} className="h-14 w-full text-base">
        {create.isPending ? 'Creating…' : 'Create & Start Logging'}
      </Button>
    </main>
    </>
  );
}
