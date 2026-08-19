'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dices, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Segmented } from '@/components/ui/segmented';
import { NavBar } from '@/components/nav/nav-bar';
import { LeaderPicker } from '@/components/leaders/leader-picker';
import { ReferenceCombobox } from '@/components/tournaments/reference-combobox';
import {
  useLeaders, useAddCustomLeader, useStats, useTournamentWrites, useRoundWrites,
  useMetas, useAddCustomMeta,
} from '@/components/query-hooks';
import { metaLabel } from '@/lib/labels';
import { pickDefaultMetaId } from '@/lib/meta-selection';
import { recentLeaders } from '@/lib/recent-leaders';
import { useLogCelebration } from '@/components/celebrate/use-log-celebration';
import { useIsMounted } from '@/lib/use-is-mounted';
import { useOnlineStatus } from '@/lib/use-online-status';
import { cn } from '@/lib/utils';
import type { TournamentDetailDTO } from '@/lib/dto';

type PlayOrder = 'first' | 'second';

/**
 * One screen for one game. A match is a tournament row of type 'match' holding a
 * single round, so saving writes both — through the outbox, like every other
 * write on the logging path, which is what keeps it usable at a venue with no
 * signal.
 *
 * The id is generated here rather than by the server so the round can name its
 * match before either has been delivered. `createTournamentSchema` accepts a
 * client id for exactly this, and it also makes a replayed create idempotent.
 *
 * Result is Win/Lose only, matching the round form. Draws exist in the schema
 * and in `computeRecord`, but no logging surface offers them today; adding one
 * here alone would make the two forms disagree.
 */
export function MatchForm({ initial }: { initial?: TournamentDetailDTO }) {
  const router = useRouter();
  const { data: leaders } = useLeaders();
  const { data: stats } = useStats();
  const addLeader = useAddCustomLeader();
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();
  const online = useOnlineStatus();
  const mounted = useIsMounted();

  const editing = Boolean(initial);
  const [matchId] = useState(() => initial?.id ?? crypto.randomUUID());
  const tournaments = useTournamentWrites();
  const rounds = useRoundWrites(matchId);
  const logCelebration = useLogCelebration();

  const round = initial?.rounds[0];

  const myDeckIds = (stats?.playedLeaders ?? []).map((l) => l.id);
  const oppIds = (stats?.opponents ?? []).map((o) => o.leaderId);

  const [pickedMine, setPickedMine] = useState<string | null>(initial?.myLeaderId ?? null);
  const [oppLeaderId, setOppLeaderId] = useState<string | null>(round?.opponentLeaderId ?? null);
  const [result, setResult] = useState<'win' | 'loss'>(round?.result === 'loss' ? 'loss' : 'win');
  const [playOrder, setPlayOrder] = useState<PlayOrder | null>(round?.playOrder ?? null);
  const [wonDieRoll, setWonDieRoll] = useState<boolean | null>(round?.wonDieRoll ?? null);
  const [playedOn, setPlayedOn] = useState(initial?.playedOn ?? (() => new Date().toISOString().slice(0, 10))());
  const [notes, setNotes] = useState(round?.notes ?? '');
  const [metaId, setMetaId] = useState<string | null>(initial?.metaId ?? null);

  // Same rule as the tournament form: open on the deck you last played, derived
  // rather than stored, and only if that leader still exists.
  const defaultMine = useMemo(() => {
    if (editing || !mounted || !leaders?.length) return null;
    return recentLeaders('my-deck').find((id) => leaders.some((l) => l.id === id)) ?? null;
  }, [editing, mounted, leaders]);
  const myLeaderId = pickedMine ?? defaultMine;

  // Applied once on arrival and never over a choice already made — the same
  // rule the tournament form follows, so a match logged in a hurry still lands
  // in the current format.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (editing || defaultApplied.current || !metas?.length) return;
    defaultApplied.current = true;
    setMetaId((current) => current ?? pickDefaultMetaId(metas));
  }, [editing, metas]);

  const addLeaderCustom = async (name: string) => {
    if (!online) { toast.error('Adding a leader needs a connection — pick one from the list for now'); return null; }
    try {
      const l = await addLeader.mutateAsync({ name, colors: [] });
      return { id: l.id, name: l.name };
    } catch {
      toast.error('Could not add that leader');
      return null;
    }
  };

  const valid = Boolean(myLeaderId && oppLeaderId);

  function save() {
    if (!valid) return;
    const roundInput = {
      kind: 'swiss' as const,
      opponentLeaderId: oppLeaderId!,
      result,
      playOrder,
      wonDieRoll,
      notes: notes.trim() || null,
    };
    if (editing) {
      tournaments.update(matchId, { myLeaderId: myLeaderId!, metaId: metaId ?? null, playedOn });
      // A match always has its round; `round!` is safe because the page only
      // renders this form once the match has loaded.
      rounds.update(round!.id, roundInput);
    } else {
      // Both writes inside one celebration window: the match and its single
      // round are one act, and the reward belongs to the act.
      logCelebration(() => {
        tournaments.create({ id: matchId, type: 'match', myLeaderId: myLeaderId!, metaId: metaId ?? undefined, playedOn });
        rounds.add(roundInput);
      }, { result, myLeaderId, opponentLeaderId: oppLeaderId });
    }
    router.push('/?tab=matches');
  }

  function remove() {
    tournaments.remove(matchId);
    router.push('/?tab=matches');
  }

  return (
    <>
      <NavBar backLabel="Back" onBack={() => router.back()} />
      <main className="mx-auto max-w-xl space-y-5 p-4 pb-6">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{editing ? 'Edit Match' : 'New Match'}</h1>
          {editing && (
            <button type="button" onClick={remove} aria-label="Delete match"
              className="-mr-1 rounded-md p-2 text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">
              <Trash2 className="size-5" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Your Deck</span>
          <LeaderPicker
            options={leaders ?? []} value={myLeaderId} onChange={setPickedMine}
            suggested={myDeckIds} recentKey="my-deck"
            suggestionsPending={stats === undefined} onAddCustom={addLeaderCustom} />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Opponent’s Deck</span>
          <LeaderPicker
            options={leaders ?? []} value={oppLeaderId} onChange={setOppLeaderId}
            suggested={oppIds} recentKey="opponent"
            suggestionsPending={stats === undefined} onAddCustom={addLeaderCustom} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border/60 p-2" role="group" aria-label="Dice Roll">
            <span className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
              <Dices className="size-3.5" /> Dice Roll
            </span>
            <Segmented
              value={wonDieRoll}
              onChange={setWonDieRoll}
              options={[
                { value: true, label: 'Won', activeClass: 'bg-emerald-600 text-white' },
                { value: false, label: 'Lost', activeClass: 'bg-red-600 text-white' },
              ]} />
          </div>
          <div className="rounded-xl border border-border/60 p-2" role="group" aria-label="Start">
            <span className="mb-1 block px-1 text-xs font-medium text-muted-foreground">Start</span>
            <Segmented
              value={playOrder}
              onChange={setPlayOrder}
              options={[{ value: 'first' as PlayOrder, label: '1st' }, { value: 'second' as PlayOrder, label: '2nd' }]} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-emerald-600/12 p-2 pl-3" role="group" aria-label="Result">
          <span className="text-sm font-medium">Result</span>
          <div className="flex gap-1">
            <button type="button" aria-pressed={result === 'win'} onClick={() => setResult('win')}
              className={cn('h-9 rounded-lg px-5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                result === 'win' ? 'bg-emerald-600 text-white' : 'text-emerald-700 dark:text-emerald-300')}>Win</button>
            <button type="button" aria-pressed={result === 'loss'} onClick={() => setResult('loss')}
              className={cn('h-9 rounded-lg px-5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                result === 'loss' ? 'bg-red-600 text-white' : 'text-muted-foreground')}>Lose</button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="mf-meta" className="text-sm font-medium">Meta (optional)</label>
          {/* Matches feed opponent statistics, and that breakdown is per meta —
              so recording one here is what makes a casual game count toward the
              matchup intelligence the app exists for. */}
          <ReferenceCombobox
            id="mf-meta"
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
          <label htmlFor="mf-date" className="text-sm font-medium">Date</label>
          <Input id="mf-date" type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} className="h-12 text-base" />
        </div>

        <div className="space-y-2">
          <label htmlFor="mf-notes" className="text-sm font-medium">Note (optional)</label>
          <Textarea id="mf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add a note about this match…" />
        </div>

        <Button onClick={save} disabled={!valid} className="h-14 w-full text-base">
          {editing ? 'Save Match' : 'Log Match'}
        </Button>
      </main>
    </>
  );
}
