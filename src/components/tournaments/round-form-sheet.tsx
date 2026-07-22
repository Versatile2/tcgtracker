'use client';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ReferenceCombobox } from './reference-combobox';
import { useLeaders, useAddCustomLeader, useMetas, useAddCustomMeta } from '@/components/query-hooks';
import type { RoundDTO } from '@/lib/dto';
import type { CreateRoundInput } from '@/lib/validation/round';

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
        {/* Keyed by open+initial so form state re-initializes fresh each time the sheet opens,
            without needing an effect to sync state from props. */}
        <RoundFormBody key={open ? (initial?.id ?? 'new') : 'closed'} onOpenChange={onOpenChange} initial={initial} onSubmit={onSubmit} />
      </SheetContent>
    </Sheet>
  );
}

function RoundFormBody({
  onOpenChange, initial, onSubmit,
}: {
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
  const [result, setResult] = useState<Result | null>(initial?.result ?? null);
  const [playOrder, setPlayOrder] = useState<PlayOrder | null>(initial?.playOrder ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const valid = oppLeaderId && result;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await onSubmit({ opponentLeaderId: oppLeaderId, opponentMetaId: oppMetaId, result, playOrder, notes: notes.trim() || null });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const addLeaderCustom = async (n: string) => {
    const l = await addLeader.mutateAsync({ name: n, colors: [] });
    return { id: l.id, name: l.name };
  };

  return (
    <>
      <SheetHeader><SheetTitle>{initial ? 'Edit Round' : 'Add Round'}</SheetTitle></SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Opponent deck</label>
          <ReferenceCombobox options={leaders ?? []} value={oppLeaderId} onChange={setOppLeaderId} onAddCustom={addLeaderCustom} placeholder="Opponent's leader" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Opponent meta (optional)</label>
          <ReferenceCombobox
            options={metas ?? []} value={oppMetaId} onChange={setOppMetaId}
            onAddCustom={async (n) => { const m = await addMeta.mutateAsync({ name: n }); return { id: m.id, name: m.name }; }}
            placeholder="e.g. OP16" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Result</label>
          <div className="grid grid-cols-3 gap-2">
            {(['win', 'loss', 'draw'] as Result[]).map((r) => (
              <Button key={r} type="button" variant={result === r ? 'default' : 'outline'} className="h-12 capitalize" onClick={() => setResult(r)}>{r}</Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Play order</label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={playOrder === 'first' ? 'default' : 'outline'} className="h-12" onClick={() => setPlayOrder(playOrder === 'first' ? null : 'first')}>Went 1st</Button>
            <Button type="button" variant={playOrder === 'second' ? 'default' : 'outline'} className="h-12" onClick={() => setPlayOrder(playOrder === 'second' ? null : 'second')}>Went 2nd</Button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Opening hand, key turns…" />
        </div>
        <Button onClick={save} disabled={!valid || saving} className="h-14 w-full text-base">{saving ? 'Saving…' : 'Save Round'}</Button>
      </div>
    </>
  );
}
