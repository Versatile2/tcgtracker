'use client';
import { useState } from 'react';
import { Dices, Trophy, SkipForward, UserX, ChevronLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { ReferenceCombobox } from './reference-combobox';
import { useLeaders, useAddCustomLeader, useMetas, useAddCustomMeta } from '@/components/query-hooks';
import { roundKindLabel, ROUND_KIND_SUBTITLES } from '@/lib/labels';
import { isCompletedBo3, matchResultFromGames } from '@/lib/validation/round';
import type { CreateRoundInput } from '@/lib/validation/round';
import type { RoundDTO, RoundKind, GameLog } from '@/lib/dto';

type Result = 'win' | 'loss' | 'draw';
type PlayOrder = 'first' | 'second';

export function RoundFormSheet({
  open, onOpenChange, initial, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: RoundDTO;
  onSubmit: (data: CreateRoundInput) => Promise<void>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        {/* Keyed by open+initial so all step/form state re-initializes each time the sheet opens. */}
        <RoundSheetBody key={open ? (initial?.id ?? 'new') : 'closed'} onOpenChange={onOpenChange} initial={initial} onSubmit={onSubmit} />
      </SheetContent>
    </Sheet>
  );
}

function RoundSheetBody({
  onOpenChange, initial, onSubmit,
}: {
  onOpenChange: (o: boolean) => void;
  initial?: RoundDTO;
  onSubmit: (data: CreateRoundInput) => Promise<void>;
}) {
  const [step, setStep] = useState<'type' | 'form'>(initial ? 'form' : 'type');
  const [kind, setKind] = useState<RoundKind>(initial?.kind ?? 'swiss');
  const [busy, setBusy] = useState(false);

  async function pickKind(k: RoundKind) {
    if (k === 'swiss' || k === 'top_cut') { setKind(k); setStep('form'); return; }
    // bye / no_show: no opponent, create immediately.
    setBusy(true);
    try {
      await onSubmit({ kind: k, notes: null });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'type') {
    return <RoundTypePicker busy={busy} onPick={pickKind} onCancel={() => onOpenChange(false)} />;
  }
  return (
    <RoundFormBody
      kind={kind === 'top_cut' ? 'top_cut' : 'swiss'}
      initial={initial}
      onBack={initial ? undefined : () => setStep('type')}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  );
}

/* ── Step 1: choose the round type ─────────────────────────────── */

function RoundTypePicker({
  busy, onPick, onCancel,
}: {
  busy: boolean;
  onPick: (k: RoundKind) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>Select Round Type</SheetTitle>
        <p className="text-sm text-muted-foreground">Choose the type of round you played</p>
      </SheetHeader>
      <div className="space-y-3 px-4 pb-4">
        <TypeRow icon={Dices} kind="swiss" onPick={onPick} disabled={busy} />
        <TypeRow icon={Trophy} kind="top_cut" onPick={onPick} disabled={busy} />
        <div className="grid grid-cols-2 gap-3">
          <TypeCard icon={SkipForward} kind="bye" onPick={onPick} disabled={busy} />
          <TypeCard icon={UserX} kind="no_show" onPick={onPick} disabled={busy} />
        </div>
        <Button variant="outline" className="h-12 w-full" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </>
  );
}

function TypeRow({ icon: Icon, kind, onPick, disabled }: { icon: LucideIcon; kind: RoundKind; onPick: (k: RoundKind) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPick(kind)}
      disabled={disabled}
      className="glass-surface flex w-full items-center gap-3 rounded-2xl p-4 text-left outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:opacity-50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <span className="min-w-0">
        <span className="block font-semibold">{roundKindLabel(kind)}</span>
        <span className="block truncate text-sm text-muted-foreground">{ROUND_KIND_SUBTITLES[kind]}</span>
      </span>
    </button>
  );
}

function TypeCard({ icon: Icon, kind, onPick, disabled }: { icon: LucideIcon; kind: RoundKind; onPick: (k: RoundKind) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPick(kind)}
      disabled={disabled}
      className="glass-surface flex flex-col items-start gap-2 rounded-2xl p-4 text-left outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:opacity-50"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <span className="font-semibold">{roundKindLabel(kind)}</span>
      <span className="text-xs text-muted-foreground">{ROUND_KIND_SUBTITLES[kind]}</span>
    </button>
  );
}

/* ── Step 2: opponent + result (Swiss) or best-of-3 (Top Cut) ──── */

function RoundFormBody({
  kind, onBack, onOpenChange, initial, onSubmit,
}: {
  kind: 'swiss' | 'top_cut';
  onBack?: () => void;
  onOpenChange: (o: boolean) => void;
  initial?: RoundDTO;
  onSubmit: (data: CreateRoundInput) => Promise<void>;
}) {
  const { data: leaders } = useLeaders();
  const addLeader = useAddCustomLeader();
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();

  const [oppLeaderId, setOppLeaderId] = useState<string | null>(initial?.opponentLeaderId ?? null);
  const [oppMetaId, setOppMetaId] = useState<string | null>(initial?.opponentMetaId ?? null);
  const [result, setResult] = useState<Result | null>(kind === 'swiss' ? (initial?.result ?? null) : null);
  const [playOrder, setPlayOrder] = useState<PlayOrder | null>(kind === 'swiss' ? (initial?.playOrder ?? null) : null);
  const [games, setGames] = useState<GameLog[]>(kind === 'top_cut' ? (initial?.games ?? []) : []);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const valid = kind === 'swiss'
    ? Boolean(oppLeaderId && result)
    : Boolean(oppLeaderId && isCompletedBo3(games));

  const leaderIcon = (lid: string) => {
    const l = leaders?.find((x) => x.id === lid);
    return l ? <LeaderAvatar name={l.name} colors={l.colors} size="sm" /> : null;
  };
  const addLeaderCustom = async (n: string) => {
    const l = await addLeader.mutateAsync({ name: n, colors: [] });
    return { id: l.id, name: l.name };
  };

  async function save() {
    if (!valid || !oppLeaderId) return;
    setSaving(true);
    try {
      const payload: CreateRoundInput = kind === 'swiss'
        ? { kind: 'swiss', opponentLeaderId: oppLeaderId, opponentMetaId: oppMetaId, result: result!, playOrder, notes: notes.trim() || null }
        : { kind: 'top_cut', opponentLeaderId: oppLeaderId, opponentMetaId: oppMetaId, games, notes: notes.trim() || null };
      await onSubmit(payload);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Change round type" className="-ml-1 rounded-md p-1 text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronLeft className="size-5" />
            </button>
          )}
          <SheetTitle>{initial ? 'Edit Round' : `${roundKindLabel(kind)} Round`}</SheetTitle>
        </div>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        <div className="space-y-2">
          <label htmlFor="rf-oppleader" className="text-sm font-medium">Opponent deck</label>
          <ReferenceCombobox id="rf-oppleader" getIcon={leaderIcon}
            options={leaders ?? []} value={oppLeaderId} onChange={setOppLeaderId} onAddCustom={addLeaderCustom} placeholder="Opponent's leader" />
        </div>
        <div className="space-y-2">
          <label htmlFor="rf-oppmeta" className="text-sm font-medium">Opponent meta (optional)</label>
          <ReferenceCombobox id="rf-oppmeta"
            options={metas ?? []} value={oppMetaId} onChange={setOppMetaId}
            onAddCustom={async (n) => { const m = await addMeta.mutateAsync({ name: n }); return { id: m.id, name: m.name }; }}
            placeholder="e.g. OP16" />
        </div>

        {kind === 'swiss' ? (
          <>
            <div className="space-y-2">
              <span id="rf-result-label" className="block text-sm font-medium">Result</span>
              <div role="group" aria-labelledby="rf-result-label" className="grid grid-cols-3 gap-2">
                {(['win', 'loss', 'draw'] as Result[]).map((r) => (
                  <Button key={r} type="button" aria-pressed={result === r} variant={result === r ? 'default' : 'outline'} className="h-12 capitalize" onClick={() => setResult(r)}>{r}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span id="rf-playorder-label" className="block text-sm font-medium">Play order</span>
              <div role="group" aria-labelledby="rf-playorder-label" className="grid grid-cols-2 gap-2">
                <Button type="button" aria-pressed={playOrder === 'first'} variant={playOrder === 'first' ? 'default' : 'outline'} className="h-12" onClick={() => setPlayOrder(playOrder === 'first' ? null : 'first')}>Went 1st</Button>
                <Button type="button" aria-pressed={playOrder === 'second'} variant={playOrder === 'second' ? 'default' : 'outline'} className="h-12" onClick={() => setPlayOrder(playOrder === 'second' ? null : 'second')}>Went 2nd</Button>
              </div>
            </div>
          </>
        ) : (
          <Bo3Games games={games} onChange={setGames} />
        )}

        <div className="space-y-2">
          <label htmlFor="rf-notes" className="text-sm font-medium">Notes (optional)</label>
          <Textarea id="rf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Opening hand, key turns…" />
        </div>
        <Button onClick={save} disabled={!valid || saving} className="h-14 w-full text-base">{saving ? 'Saving…' : 'Save Round'}</Button>
      </div>
    </>
  );
}

/* ── Best-of-3 game log ────────────────────────────────────────── */

function decidedBefore(games: GameLog[], upto: number): boolean {
  const slice = games.slice(0, upto);
  const wins = slice.filter((g) => g.result === 'win').length;
  const losses = slice.length - wins;
  return wins >= 2 || losses >= 2;
}

function Bo3Games({ games, onChange }: { games: GameLog[]; onChange: (g: GameLog[]) => void }) {
  const myWins = games.filter((g) => g.result === 'win').length;
  const oppWins = games.length - myWins;

  function setGame(i: number, patch: Partial<GameLog>) {
    const next = games.slice(0, i + 1);
    while (next.length <= i) next.push({ result: 'win', playOrder: null });
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  // Rows to render: game 0 always; each next while the match isn't decided and < 3.
  const rows: number[] = [];
  for (let i = 0; i < 3; i++) {
    if (i === 0 || (games.length > i - 1 && !decidedBefore(games, i))) rows.push(i);
    else break;
  }

  const complete = isCompletedBo3(games);
  const status = complete
    ? `Match: ${myWins}–${oppWins} ${matchResultFromGames(games) === 'win' ? 'win' : 'loss'}`
    : games.length > 0 ? `${myWins}–${oppWins} so far` : 'Best of 3 — log each game';

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Games (best of 3)</span>
        <span className={`text-sm tabular-nums ${complete ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{status}</span>
      </div>
      {rows.map((i) => {
        const g = games[i];
        return (
          <div key={i} className="rounded-xl border border-border/60 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Game {i + 1}</div>
            <div className="grid grid-cols-2 gap-2">
              {(['win', 'loss'] as const).map((r) => (
                <Button key={r} type="button" aria-pressed={g?.result === r} variant={g?.result === r ? 'default' : 'outline'} className="h-11 capitalize" onClick={() => setGame(i, { result: r })}>{r}</Button>
              ))}
            </div>
            {g?.result && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['first', 'second'] as const).map((po) => (
                  <Button key={po} type="button" aria-pressed={g.playOrder === po} variant={g.playOrder === po ? 'secondary' : 'ghost'} className="h-9 text-xs"
                    onClick={() => setGame(i, { playOrder: g.playOrder === po ? null : po })}>
                    Went {po === 'first' ? '1st' : '2nd'}
                  </Button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
