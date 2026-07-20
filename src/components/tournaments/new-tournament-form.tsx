'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReferenceCombobox } from './reference-combobox';
import { useSets, useAddCustomSet, useCreateTournament } from '@/components/query-hooks';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentType } from '@/lib/dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

export function NewTournamentForm() {
  const router = useRouter();
  const { data: sets } = useSets();
  const addSet = useAddCustomSet();
  const create = useCreateTournament();

  const [type, setType] = useState<TournamentType>('local');
  const [setId, setSetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));

  async function submit() {
    try {
      const t = await create.mutateAsync({
        type, setId: setId ?? undefined, name: name.trim() || undefined, playedOn,
      });
      router.push(`/tournaments/${t.id}`);
    } catch {
      toast.error('Could not create tournament');
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 p-4">
      <h1 className="text-2xl font-bold">New Tournament</h1>

      <div className="space-y-2">
        <label className="text-sm font-medium">Type</label>
        <Select value={type} onValueChange={(v) => setType(v as TournamentType)}>
          <SelectTrigger className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{tournamentTypeLabel(ty)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Set</label>
        <ReferenceCombobox
          options={sets ?? []} value={setId} onChange={setSetId}
          onAddCustom={async (n) => { const s = await addSet.mutateAsync({ name: n }); return { id: s.id, name: s.name }; }}
          placeholder="Choose a set" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Name (optional)</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Regional" className="h-12 text-base" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Date</label>
        <Input type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} className="h-12 text-base" />
      </div>

      <Button onClick={submit} disabled={create.isPending} className="h-14 w-full text-base">
        {create.isPending ? 'Creating…' : 'Create & Start Logging'}
      </Button>
    </main>
  );
}
