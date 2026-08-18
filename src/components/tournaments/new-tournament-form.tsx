'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NavBar } from '@/components/nav/nav-bar';
import { LeaderPicker } from '@/components/leaders/leader-picker';
import { ReferenceCombobox } from './reference-combobox';
import { useLeaders, useAddCustomLeader, useMetas, useAddCustomMeta, useTournamentWrites, useStats } from '@/components/query-hooks';
import { tournamentTypeLabel, metaLabel } from '@/lib/labels';
import { pickDefaultMetaId } from '@/lib/meta-selection';
import { recentLeaders } from '@/lib/recent-leaders';
import { useIsMounted } from '@/lib/use-is-mounted';
import type { TournamentType } from '@/lib/dto';
import { useOnlineStatus } from '@/lib/use-online-status';

// Freeplay and match are reached through their own tabs, not chosen here: a
// freeplay session has no leader of its own and a match is a single game, so
// neither fits the fields this form shows.
const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

/**
 * Creates a tournament, or a freeplay session — the same fields either way bar
 * two, so one form rather than a near-duplicate that drifts.
 *
 * Freeplay differs in exactly what the product says it differs in: it records
 * the leader per round instead of per session, so it has no leader picker and
 * no type to choose. The name, meta and date are shared, and both are named the
 * same way.
 */
export function NewTournamentForm({ kind = 'tournament' }: { kind?: 'tournament' | 'freeplay' }) {
  const isFreeplay = kind === 'freeplay';
  const router = useRouter();
  const { data: leaders } = useLeaders();
  // Decks you have actually played head the strip; a new account has none and it
  // opens on the run of set codes instead.
  const { data: stats } = useStats();
  const myDeckIds = (stats?.playedLeaders ?? []).map((l) => l.id);
  const addLeader = useAddCustomLeader();
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();
  const tournaments = useTournamentWrites();
  const online = useOnlineStatus();

  const [type, setType] = useState<TournamentType>(isFreeplay ? 'freeplay' : 'local');
  const [pickedLeaderId, setPickedLeaderId] = useState<string | null>(null);
  const [metaId, setMetaId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));

  // Metas load asynchronously, so the default is applied on arrival. The ref
  // makes it fire exactly once: a refetch must never overwrite a choice the
  // user has already made.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || !metas?.length) return;
    defaultApplied.current = true;
    setMetaId((current) => current ?? pickDefaultMetaId(metas));
  }, [metas]);

  /*
   * Open on the deck you last played. Players arrive at an event on one deck and
   * log several tournaments with it, so the common case should cost no taps —
   * and the leader is the only field that blocks the submit button.
   *
   * Derived rather than stored: the default is a fact about history, not a
   * decision, so there is nothing to copy into state and no ordering hazard
   * between the leaders query landing and the player choosing. A pick simply
   * takes precedence over it.
   *
   * Behind `useIsMounted` because localStorage is client-only and this page is
   * prerendered. Checked against the catalog before use: a leader can be
   * deleted, and defaulting to a dead id would arm the submit button with a
   * tournament the server will reject.
   */
  const mounted = useIsMounted();
  const defaultLeaderId = useMemo(() => {
    if (!mounted || !leaders?.length) return null;
    return recentLeaders('my-deck').find((id) => leaders.some((l) => l.id === id)) ?? null;
  }, [mounted, leaders]);
  const myLeaderId = pickedLeaderId ?? defaultLeaderId;

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
      <h1 className="text-3xl font-bold tracking-tight">{isFreeplay ? 'New Freeplay Session' : 'New Tournament'}</h1>

      <div className="space-y-2">
        <label htmlFor="nt-name" className="text-sm font-medium">Name (optional)</label>
        <Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={isFreeplay ? 'e.g. Thursday testing' : 'e.g. Spring Regional'} className="h-12 text-base" />
      </div>

      {!isFreeplay && (
        <div className="space-y-2">
          <label htmlFor="nt-type" className="text-sm font-medium">Type</label>
          <Select value={type} onValueChange={(v) => setType(v as TournamentType)}>
            <SelectTrigger id="nt-type" className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{tournamentTypeLabel(ty)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {!isFreeplay && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Leader</span>
          <LeaderPicker
            suggested={myDeckIds}
            recentKey="my-deck"
            suggestionsPending={stats === undefined}
            options={leaders ?? []} value={myLeaderId} onChange={setPickedLeaderId}
            onAddCustom={async (n) => {
              if (!online) { toast.error('Adding a leader needs a connection — pick one from the list for now'); return null; }
              try {
                const l = await addLeader.mutateAsync({ name: n, colors: [] });
                return { id: l.id, name: l.name };
              } catch {
                toast.error('Could not add that leader');
                return null;
              }
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
