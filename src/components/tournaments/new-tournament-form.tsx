'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NavBar } from '@/components/nav/nav-bar';
import { LeaderCarousel } from '@/components/leaders/leader-carousel';
import { ReferenceCombobox } from './reference-combobox';
import { useLeaders, useAddCustomLeader, useMetas, useAddCustomMeta, useTournamentWrites } from '@/components/query-hooks';
import { tournamentTypeLabel, metaLabel } from '@/lib/labels';
import { pickDefaultMetaId } from '@/lib/meta-selection';
import type { TournamentType } from '@/lib/dto';
import { useOnlineStatus } from '@/lib/use-online-status';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing', 'freeplay'];

export function NewTournamentForm() {
  const router = useRouter();
  const { data: leaders } = useLeaders();
  const addLeader = useAddCustomLeader();
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();
  const tournaments = useTournamentWrites();
  const online = useOnlineStatus();

  const [type, setType] = useState<TournamentType>('local');
  const [myLeaderId, setMyLeaderId] = useState<string | null>(null);
  const [metaId, setMetaId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const isFreeplay = type === 'freeplay';

  // Metas load asynchronously, so the default is applied on arrival. The ref
  // makes it fire exactly once: a refetch must never overwrite a choice the
  // user has already made.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || !metas?.length) return;
    defaultApplied.current = true;
    setMetaId((current) => current ?? pickDefaultMetaId(metas));
  }, [metas]);

  function submit() {
    if (!isFreeplay && !myLeaderId) { toast.error('Choose your leader first'); return; }
    // The id is generated here, so logging can start immediately whether or not
    // the venue has signal — the outbox delivers the tournament when it can.
    const id = tournaments.create({
      type,
      myLeaderId: isFreeplay ? undefined : myLeaderId!,
      metaId: metaId ?? undefined, name: name.trim() || undefined, playedOn,
    });
    router.push(`/tournaments/${id}`);
  }

  return (
    <>
    <NavBar backLabel="Back" onBack={() => router.back()} />
    <main className="mx-auto max-w-xl space-y-5 p-4 pb-6">
      <h1 className="text-3xl font-bold tracking-tight">New Tournament</h1>

      <div className="space-y-2">
        <label htmlFor="nt-name" className="text-sm font-medium">Name (optional)</label>
        <Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Regional" className="h-12 text-base" />
      </div>

      <div className="space-y-2">
        <label htmlFor="nt-type" className="text-sm font-medium">Type</label>
        <Select value={type} onValueChange={(v) => setType(v as TournamentType)}>
          <SelectTrigger id="nt-type" className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{tournamentTypeLabel(ty)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isFreeplay && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Leader</span>
          <LeaderCarousel
            options={leaders ?? []} value={myLeaderId} onChange={setMyLeaderId}
            onAddCustom={async (n) => {
              if (!online) { toast.error('Adding a leader needs a connection — pick one from the list for now'); return null; }
              const l = await addLeader.mutateAsync({ name: n, colors: [] });
              return { id: l.id, name: l.name };
            }} />
        </div>
      )}

      {isFreeplay && (
        <p className="text-sm text-muted-foreground">
          You’ll pick a deck on each round — a freeplay session has no fixed leader.
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="nt-meta" className="text-sm font-medium">Meta (optional)</label>
        <ReferenceCombobox
          id="nt-meta"
          options={metas ?? []} value={metaId} onChange={setMetaId}
          getLabel={metaLabel}
          onAddCustom={async (n) => {
            if (!online) { toast.error('Adding a meta needs a connection — pick one from the list for now'); return null; }
            const m = await addMeta.mutateAsync({ name: n });
            return { id: m.id, name: m.name };
          }}
          placeholder="e.g. OP16" />
      </div>

      <div className="space-y-2">
        <label htmlFor="nt-date" className="text-sm font-medium">Date</label>
        <Input id="nt-date" type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} className="h-12 text-base" />
      </div>

      <Button onClick={submit} disabled={!isFreeplay && !myLeaderId} className="h-14 w-full text-base">
        Create &amp; Start Logging
      </Button>
    </main>
    </>
  );
}
