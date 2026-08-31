'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { keys } from '@/lib/query-keys';
import type { MetaDTO } from '@/lib/dto';
import type { MetaInput } from '@/lib/validation/admin-catalog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const STATUS_LABEL = { draft: 'Draft', published: 'Published', hidden: 'Hidden' } as const;
type Status = keyof typeof STATUS_LABEL;

export function MetaPanel({
  meta, open, onOpenChange,
}: { meta: MetaDTO | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  // Seeded once; the caller mounts this under a key per row. See LeaderPanel.
  const [name, setName] = useState(meta?.name ?? '');
  const [code, setCode] = useState(meta?.code ?? '');
  const [releasedAt, setReleasedAt] = useState(meta?.releasedAt ?? '');
  const [status, setStatus] = useState<Status>(meta?.status ?? 'draft');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (values: MetaInput) =>
      meta ? apiClient.adminUpdateMeta(meta.id, values) : apiClient.adminCreateMeta(values),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.adminMetas });
      // The tournament form reads this list, and pickDefaultMetaId reads the
      // release date off it.
      await qc.invalidateQueries({ queryKey: keys.metas });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    setError(null);
    save.mutate({
      name: name.trim(),
      code: code.trim() || null,
      releasedAt: releasedAt.trim() || null,
      status,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle>{meta ? meta.name : 'New meta'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Code</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="OP16" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Release date</span>
            <Input type="date" value={releasedAt} onChange={(e) => setReleasedAt(e.target.value)} />
            <span className="text-xs text-muted-foreground">
              Once any official meta has one, the newest dated set becomes the default for a new tournament.
            </span>
          </label>

          <div className="space-y-1">
            <span className="text-sm font-medium">Status</span>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger className="min-h-10 w-full">
                <SelectValue>{(v) => STATUS_LABEL[v as Status]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter className="p-0">
          <Button onClick={submit} disabled={save.isPending || name.trim() === ''}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
