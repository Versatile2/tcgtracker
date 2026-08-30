'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { keys } from '@/lib/query-keys';
import type { LeaderDTO } from '@/lib/dto';
import type { BulkStatusInput } from '@/lib/validation/admin-catalog';
import {
  leaderBackground, leaderTextColor, leaderInitial, leaderImageUrl,
  leaderSearchText, leaderColorBand, COLOR_BANDS,
} from '@/lib/leader-visual';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from './status-badge';
import { SelectionBar } from './selection-bar';
import { LeaderPanel } from './leader-panel';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'draft' | 'published' | 'hidden';
type ColorFilter = 'all' | (typeof COLOR_BANDS)[number]['key'];

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All statuses', draft: 'Draft', published: 'Published', hidden: 'Hidden',
};

/**
 * There is no checkbox component in src/components/ui and this does not warrant
 * a dependency: a button carrying the checkbox role is accessible, keyboard
 * operable and costs nothing.
 */
function SelectToggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded border-2 bg-background/80 backdrop-blur',
        checked ? 'border-primary bg-primary' : 'border-border',
      )}
    >
      {checked ? <Check className="size-4 text-primary-foreground" /> : null}
    </button>
  );
}

/**
 * One card per leader.
 *
 * The artwork is the leader's own default, not `LeaderAvatar`'s — that reads the
 * signed-in player's printing preference from context, which is the wrong
 * question here: the admin is curating the catalog, not looking at their own
 * collection.
 */
function LeaderCard({
  leader, selected, onToggle, onOpen,
}: { leader: LeaderDTO; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const src = leaderImageUrl(leader.defaultImageId);
  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-lg border bg-card p-2 text-left transition-colors',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      <SelectToggle checked={selected} onChange={onToggle} label={`Select ${leader.name}`} />
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 text-left" aria-label={`Edit ${leader.name}`}>
      <div
        className="flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-md text-2xl font-bold leading-none ring-1 ring-black/10"
        style={src ? undefined : { background: leaderBackground(leader.colors), color: leaderTextColor(leader.colors) }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          leaderInitial(leader.name)
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium" title={leader.name}>{leader.name}</p>
        <p className="text-xs text-muted-foreground">{leader.setCode ?? 'No set code'}</p>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={leader.status} />
          {leader.images.length === 0 && (
            <span className="text-xs text-muted-foreground">no image</span>
          )}
        </div>
      </div>
      </button>
    </div>
  );
}

export function LeaderGrid() {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: keys.adminLeaders,
    queryFn: apiClient.adminListLeaders,
  });

  const [status, setStatus] = useState<StatusFilter>('all');
  const [color, setColor] = useState<ColorFilter>('all');
  const [q, setQ] = useState('');
  const [noImageOnly, setNoImageOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LeaderDTO | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  function openPanel(leader: LeaderDTO | null) {
    setEditing(leader);
    setPanelOpen(true);
  }

  // Client-side over the already-fetched list: the catalog is a few hundred rows
  // and a round trip per keystroke would be worse in every way.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((l) => {
      if (status !== 'all' && l.status !== status) return false;
      if (color !== 'all' && leaderColorBand(l.colors) !== color) return false;
      if (noImageOnly && l.images.length > 0) return false;
      if (needle && !leaderSearchText(l.name, l.setCode, l.aliases, l.deckCodes).includes(needle)) return false;
      return true;
    });
  }, [data, status, color, q, noImageOnly]);

  const selectedLeaders = useMemo(
    () => (data ?? []).filter((l) => selected.has(l.id)),
    [data, selected],
  );

  const setStatusMutation = useMutation({
    mutationFn: (b: BulkStatusInput) => apiClient.adminSetLeaderStatus(b),
    onSuccess: async () => {
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: keys.adminLeaders });
      // The player-facing list is derived from the same rows.
      await qc.invalidateQueries({ queryKey: keys.leaders });
    },
  });

  const apply = (next: BulkStatusInput['status']) =>
    setStatusMutation.mutate({ ids: [...selected], status: next });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Deliberately the current filter, never the whole catalog: selecting rows you
  // cannot see is a trap, so the label says exactly how many it will take.
  const selectAllShown = () => setSelected(new Set(shown.map((l) => l.id)));

  if (isError) return <p className="text-sm text-destructive">Could not load the catalog.</p>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="min-h-10 w-40">
            {/* Base UI renders the raw value unless given this function. */}
            <SelectValue>{(v) => STATUS_LABEL[v as StatusFilter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={color} onValueChange={(v) => setColor(v as ColorFilter)}>
          <SelectTrigger className="min-h-10 w-40">
            <SelectValue>
              {(v) => (v === 'all' ? 'All colours' : COLOR_BANDS.find((b) => b.key === v)?.label ?? 'All colours')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All colours</SelectItem>
            {COLOR_BANDS.map((b) => (
              <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, set code, alias, deck"
          className="min-h-10 w-56"
          aria-label="Search the catalog"
        />

        {/* A missing image is the one anomaly a grid of pictures cannot show you. */}
        <Button
          variant={noImageOnly ? 'default' : 'outline'}
          aria-pressed={noImageOnly}
          onClick={() => setNoImageOnly((v) => !v)}
        >
          No image
        </Button>

        <Button variant="outline" onClick={selectAllShown} disabled={shown.length === 0}>
          Select all {shown.length} shown
        </Button>

        <Button onClick={() => openPanel(null)}>New leader</Button>

        <span className="ml-auto text-sm text-muted-foreground">
          {isPending ? '—' : `${shown.length} of ${data?.length ?? 0}`}
        </span>
      </div>

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[5/7] w-full rounded-lg" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches those filters.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {shown.map((l) => (
            <LeaderCard
              key={l.id}
              leader={l}
              selected={selected.has(l.id)}
              onToggle={() => toggle(l.id)}
              onOpen={() => openPanel(l)}
            />
          ))}
        </div>
      )}

      <SelectionBar
        count={selected.size}
        withoutArt={selectedLeaders.filter((l) => l.images.length === 0).length}
        pending={setStatusMutation.isPending}
        onPublish={() => apply('published')}
        onHide={() => apply('hidden')}
        onDraft={() => apply('draft')}
        onClear={() => setSelected(new Set())}
      />

      {/* Keyed and mounted only while open: that is how the form resets to the
          row you just clicked, without an effect copying props into state. */}
      {panelOpen && (
        <LeaderPanel
          key={editing?.id ?? 'new'}
          leader={editing}
          open
          onOpenChange={setPanelOpen}
        />
      )}
    </div>
  );
}
