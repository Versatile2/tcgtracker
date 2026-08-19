'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberPicker, COMMON_FIELD_SIZES } from '@/components/ui/number-picker';
import { Textarea } from '@/components/ui/textarea';
import { NavBar } from '@/components/nav/nav-bar';
import { LeaderPicker } from '@/components/leaders/leader-picker';
import { ReferenceCombobox } from './reference-combobox';
import { useLeaders, useMetas, useTournamentWrites, useStats } from '@/components/query-hooks';
import { tournamentTypeLabel, metaLabel } from '@/lib/labels';
import { pickDefaultMetaId } from '@/lib/meta-selection';
import { recentLeaders } from '@/lib/recent-leaders';
import { lastTournamentType, rememberTournamentType, orderTypes } from '@/lib/last-tournament-type';
import { useIsMounted } from '@/lib/use-is-mounted';
import { useLogCelebration } from '@/components/celebrate/use-log-celebration';
import type { TournamentType, TournamentDetailDTO } from '@/lib/dto';
import { cn } from '@/lib/utils';
import { isFreeplay, FREEPLAY_TYPES, TOURNAMENT_TYPES } from '@/lib/tournament-kinds';

// A match is reached through its own tab — it is a single game, not an event.
// Freeplay is no longer a single type but a segment with its own two choices,
// because the same simulator session can be logged either way and it is the
// segment, not the label, that decides whether it counts competitively.

/**
 * Creates a tournament, or a freeplay session — the same fields either way bar
 * two, so one form rather than a near-duplicate that drifts.
 *
 * Freeplay differs in exactly what the product says it differs in: it records
 * the leader per round instead of per session, so it has no leader picker and
 * no type to choose. The name, meta and date are shared, and both are named the
 * same way.
 */
export function TournamentForm({ kind = 'tournament', initial }: {
  kind?: 'tournament' | 'freeplay';
  /** Present when editing; its values win over every remembered default. */
  initial?: TournamentDetailDTO;
}) {
  const editing = Boolean(initial);
  const freeplayMode = (initial ? isFreeplay(initial.type) : kind === 'freeplay');
  const router = useRouter();
  const { data: leaders } = useLeaders();
  // Decks you have actually played head the strip; a new account has none and it
  // opens on the run of set codes instead.
  const { data: stats } = useStats();
  const myDeckIds = (stats?.playedLeaders ?? []).map((l) => l.id);
  const { data: metas } = useMetas();
  const tournaments = useTournamentWrites();
  const logCelebration = useLogCelebration();

  const [pickedType, setPickedType] = useState<TournamentType | null>(initial?.type ?? null);
  const [pickedLeaderId, setPickedLeaderId] = useState<string | null>(initial?.myLeaderId ?? null);
  const [metaId, setMetaId] = useState<string | null>(initial?.metaId ?? null);
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [players, setPlayers] = useState<number | null>(initial?.fieldSize ?? null);
  const [playedOn, setPlayedOn] = useState(initial?.playedOn ?? new Date().toISOString().slice(0, 10));

  // Metas load asynchronously, so the default is applied on arrival. The ref
  // makes it fire exactly once: a refetch must never overwrite a choice the
  // user has already made.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (editing || defaultApplied.current || !metas?.length) return;
    defaultApplied.current = true;
    setMetaId((current) => current ?? pickDefaultMetaId(metas));
  }, [editing, metas]);

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

  /*
   * Open on the type you last created, and lead the strip with it. Same rule as
   * the leader default: derived, not stored, so a pick simply takes precedence
   * and there is no effect to sequence against.
   */
  const lastType = useMemo(() => (mounted && !editing ? lastTournamentType() : null), [mounted, editing]);
  const offered = freeplayMode ? FREEPLAY_TYPES : TOURNAMENT_TYPES;
  // A freeplay session always leads with plain Freeplay: the remembered type is
  // the tournament one, and carrying it across segments would open the session
  // form on Ranked Simulator because of a Regional logged last week.
  const orderedTypes = useMemo(
    () => (freeplayMode ? offered : orderTypes(offered, lastType)),
    [freeplayMode, offered, lastType],
  );
  const type: TournamentType = pickedType ?? orderedTypes[0];

  const defaultLeaderId = useMemo(() => {
    if (editing || !mounted || !leaders?.length) return null;
    return recentLeaders('my-deck').find((id) => leaders.some((l) => l.id === id)) ?? null;
  }, [editing, mounted, leaders]);
  const myLeaderId = pickedLeaderId ?? defaultLeaderId;

  function submit() {
    if (!freeplayMode && !myLeaderId) { toast.error('Choose your leader first'); return; }
    if (editing) {
      // Type and leader are omitted for freeplay: the service rejects both on a
      // session that records its leader per round.
      tournaments.update(initial!.id, {
        type,
        ...(freeplayMode ? {} : { myLeaderId: myLeaderId! }),
        metaId: metaId ?? null,
        name: name.trim() || null,
        notes: notes.trim() || null,
        fieldSize: players,
        playedOn,
      });
      router.push(`/tournaments/${initial!.id}`);
      return;
    }
    // The id is generated here, so logging can start immediately whether or not
    // the venue has signal — the outbox delivers the tournament when it can.
    // Editing deliberately does not move the remembered type: changing an
    // event's type after the fact says nothing about what will be logged next.
    if (!freeplayMode) rememberTournamentType(type);
    // Starting an event is a logging act too, and it can cross a milestone —
    // "Log your first tournament" is earned here, not by the first round. Left
    // uncelebrated, a brand-new player's very first act would pass in silence,
    // which is the exact failure this layer exists to fix.
    const id = crypto.randomUUID();
    logCelebration(() => {
      tournaments.create({
        id,
        type,
        myLeaderId: freeplayMode ? undefined : myLeaderId!,
        metaId: metaId ?? undefined,
        name: name.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(players != null ? { fieldSize: players } : {}),
        playedOn,
      });
    }, { result: null, myLeaderId: freeplayMode ? null : myLeaderId, opponentLeaderId: null });
    router.push(`/tournaments/${id}`);
  }

  return (
    <>
    <NavBar backLabel="Back" onBack={() => router.back()} />
    <main className="mx-auto max-w-xl space-y-5 p-4 pb-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {editing
          ? (freeplayMode ? 'Edit Session' : 'Edit Tournament')
          : (freeplayMode ? 'New Freeplay Session' : 'New Tournament')}
      </h1>

      <div className="space-y-2">
        <label htmlFor="nt-name" className="text-sm font-medium">Name (optional)</label>
        <Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={freeplayMode ? 'e.g. Thursday testing' : 'e.g. Spring Regional'} className="h-12 text-base" />
      </div>

      <div className="space-y-2">
          <span className="text-sm font-medium">Type</span>
          {/* A strip rather than a dropdown: a handful of choices, all of them
              short, and the one you want is almost always the one you used last
              — which leads it. A dropdown hid every option behind a tap.

              Freeplay gets the same strip with its own two options, so a
              simulator session is chosen exactly the way a Regional is. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Type">
            {orderedTypes.map((ty) => (
              <button
                key={ty}
                type="button"
                role="radio"
                aria-checked={type === ty}
                onClick={() => setPickedType(ty)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  type === ty
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md',
                )}
              >
                {tournamentTypeLabel(ty)}
              </button>
            ))}
          </div>
      </div>

      {!freeplayMode && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Leader</span>
          <LeaderPicker
            suggested={myDeckIds}
            recentKey="my-deck"
            suggestionsPending={stats === undefined}
            options={leaders ?? []} value={myLeaderId} onChange={setPickedLeaderId} />
        </div>
      )}

      {freeplayMode && (
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
          placeholder="e.g. OP16" />
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Players (optional)</span>
        {/* Captured here because the turnout is known on the day. Finishing then
            asks only where you placed, instead of two numbers at the moment you
            are packing up to leave. Same control as the finish dialog uses for
            the same value. */}
        <NumberPicker
          id="nt-players"
          value={players}
          onChange={setPlayers}
          options={COMMON_FIELD_SIZES}
          ariaLabel="How many played"
          placeholder="e.g. 47" />
      </div>

      <div className="space-y-2">
        <label htmlFor="nt-date" className="text-sm font-medium">Date</label>
        <Input id="nt-date" type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} className="h-12 text-base" />
      </div>

      <div className="space-y-2">
        <label htmlFor="nt-notes" className="text-sm font-medium">Note (optional)</label>
        {/* About the event, not the games — rounds keep their own notes. */}
        <Textarea id="nt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder={freeplayMode ? 'Who you tested with, what you were trying…' : 'Venue, who you went with, how it went…'} />
      </div>

      <Button onClick={submit} disabled={!freeplayMode && !myLeaderId} className="h-14 w-full text-base">
        {editing ? 'Save Changes' : 'Create & Start Logging'}
      </Button>
    </main>
    </>
  );
}
