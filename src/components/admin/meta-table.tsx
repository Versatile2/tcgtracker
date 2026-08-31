'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { keys } from '@/lib/query-keys';
import type { MetaDTO } from '@/lib/dto';
import type { BulkStatusInput } from '@/lib/validation/admin-catalog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from './status-badge';
import { SelectionBar } from './selection-bar';
import { MetaPanel } from './meta-panel';
import { cn } from '@/lib/utils';

/** A table rather than a grid: metas have no artwork, so there is nothing to look at. */
export function MetaTable() {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: keys.adminMetas,
    queryFn: apiClient.adminListMetas,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<MetaDTO | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const rows = useMemo(() => data ?? [], [data]);

  const setStatusMutation = useMutation({
    mutationFn: (b: BulkStatusInput) => apiClient.adminSetMetaStatus(b),
    onSuccess: async () => {
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: keys.adminMetas });
      await qc.invalidateQueries({ queryKey: keys.metas });
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

  function openPanel(meta: MetaDTO | null) {
    setEditing(meta);
    setPanelOpen(true);
  }

  if (isError) return <p className="text-sm text-destructive">Could not load the metas.</p>;

  return (
    <div className="space-y-4 pb-40">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setSelected(new Set(rows.map((m) => m.id)))}
          disabled={rows.length === 0}
        >
          Select all {rows.length}
        </Button>
        <Button onClick={() => openPanel(null)}>New meta</Button>
        <span className="ml-auto text-sm text-muted-foreground">{rows.length} metas</span>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((m) => {
            const on = selected.has(m.id);
            return (
              <li key={m.id} className={cn('flex items-center gap-3 p-3', on && 'bg-muted/50')}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Select ${m.name}`}
                  onClick={() => toggle(m.id)}
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded border-2',
                    on ? 'border-primary bg-primary' : 'border-border',
                  )}
                >
                  {on ? <Check className="size-4 text-primary-foreground" /> : null}
                </button>

                <button
                  type="button"
                  onClick={() => openPanel(m)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-label={`Edit ${m.name}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{m.code ?? '—'}</span>
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{m.releasedAt ?? 'No date'}</span>
                  <StatusBadge status={m.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SelectionBar
        count={selected.size}
        withoutArt={0}
        pending={setStatusMutation.isPending}
        onPublish={() => apply('published')}
        onHide={() => apply('hidden')}
        onDraft={() => apply('draft')}
        onClear={() => setSelected(new Set())}
      />

      {panelOpen && (
        <MetaPanel
          key={editing?.id ?? 'new'}
          meta={editing}
          open
          onOpenChange={setPanelOpen}
        />
      )}
    </div>
  );
}
