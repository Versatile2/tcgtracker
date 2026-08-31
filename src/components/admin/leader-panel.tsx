'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { keys } from '@/lib/query-keys';
import type { LeaderDTO } from '@/lib/dto';
import type { LeaderInput } from '@/lib/validation/admin-catalog';
import { LEADER_COLOR_HEX, leaderImageUrl } from '@/lib/leader-visual';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ImageCropper } from './image-cropper';
import { cn } from '@/lib/utils';

const COLORS = ['red', 'green', 'blue', 'purple', 'black', 'yellow'] as const;
type Colour = (typeof COLORS)[number];

const STATUS_LABEL = { draft: 'Draft', published: 'Published', hidden: 'Hidden' } as const;
type Status = keyof typeof STATUS_LABEL;

/** Comma-separated in the field, an array on the wire. */
const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function LeaderPanel({
  leader, open, onOpenChange,
}: { leader: LeaderDTO | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  // Seeded once from the row this panel was opened on. The caller mounts it
  // under a key per row, which is how React resets a form — an effect that
  // copied props into state would run after the first paint and is what the
  // compiler's set-state-in-effect rule exists to stop.
  const [name, setName] = useState(leader?.name ?? '');
  const [colors, setColors] = useState<Colour[]>(
    (leader?.colors ?? []).filter((c): c is Colour => (COLORS as readonly string[]).includes(c)),
  );
  const [setCode, setSetCode] = useState(leader?.setCode ?? '');
  const [aliases, setAliases] = useState((leader?.aliases ?? []).join(', '));
  const [deckCodes, setDeckCodes] = useState((leader?.deckCodes ?? []).join(', '));
  const [status, setStatus] = useState<Status>(leader?.status ?? 'draft');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (values: LeaderInput) =>
      leader ? apiClient.adminUpdateLeader(leader.id, values) : apiClient.adminCreateLeader(values),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.adminLeaders });
      // Without this the player-facing picker keeps serving the pre-edit catalog
      // from cache until its staleTime expires.
      await qc.invalidateQueries({ queryKey: keys.leaders });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const refreshCatalog = async () => {
    await qc.invalidateQueries({ queryKey: keys.adminLeaders });
    await qc.invalidateQueries({ queryKey: keys.leaders });
  };

  const patchImage = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { label?: string; isDefault?: boolean } }) =>
      apiClient.adminUpdateImage(id, body),
    onSuccess: refreshCatalog,
    onError: (e: Error) => setError(e.message),
  });

  const removeImage = useMutation({
    mutationFn: (id: string) => apiClient.adminDeleteImage(id),
    onSuccess: refreshCatalog,
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    setError(null);
    save.mutate({
      name: name.trim(),
      colors,
      setCode: setCode.trim() || null,
      aliases: splitList(aliases),
      deckCodes: splitList(deckCodes),
      status,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle>{leader ? leader.name : 'New leader'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="space-y-1">
            <span className="text-sm font-medium">Colours</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => {
                const on = colors.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={c}
                    onClick={() => setColors((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                    className={cn(
                      'size-9 rounded-full border-2 transition-transform',
                      on ? 'border-foreground scale-110' : 'border-border opacity-50',
                    )}
                    style={{ background: LEADER_COLOR_HEX[c] }}
                  />
                );
              })}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Set code</span>
            <Input value={setCode} onChange={(e) => setSetCode(e.target.value)} placeholder="OP01-001" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Aliases</span>
            <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="gear 5, whitebeard" />
            <span className="text-xs text-muted-foreground">Comma separated. Players search on these.</span>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Deck codes</span>
            <Input value={deckCodes} onChange={(e) => setDeckCodes(e.target.value)} placeholder="ST17" />
            <span className="text-xs text-muted-foreground">Starter decks that reprint this leader.</span>
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

          {/* Only for a row that exists: artwork hangs off a leader id, so a
              leader being created has nothing to attach it to yet. */}
          {leader && (
            <div className="space-y-3 border-t border-border pt-4">
              <span className="text-sm font-medium">Artwork</span>

              {/* Above the thumbnails, not below them: a leader with four
                  printings pushed this button off the bottom of a phone screen,
                  which is the same as not having one. */}
              <ImageCropper leaderId={leader.id} />

              {leader.images.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No artwork. This leader renders as a coloured initial.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-3">
                  {leader.images.map((img) => (
                    <li key={img.id} className="w-24 space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={leaderImageUrl(img.id) ?? ''}
                        alt={img.label}
                        className={cn(
                          'aspect-[5/7] w-full rounded object-cover ring-1',
                          img.id === leader.defaultImageId ? 'ring-2 ring-primary' : 'ring-border',
                        )}
                      />
                      <Input
                        defaultValue={img.label}
                        aria-label={`Label for ${img.label}`}
                        className="h-7 text-xs"
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== img.label) patchImage.mutate({ id: img.id, body: { label: next } });
                        }}
                      />
                      {/* Stacked, not side by side: two buttons will not fit
                          across a thumbnail this narrow and were overlapping. */}
                      <div className="flex flex-col gap-1">
                        <Button
                          size="xs"
                          className="w-full"
                          variant={img.id === leader.defaultImageId ? 'default' : 'outline'}
                          disabled={img.id === leader.defaultImageId || patchImage.isPending}
                          onClick={() => patchImage.mutate({ id: img.id, body: { isDefault: true } })}
                        >
                          {img.id === leader.defaultImageId ? 'Default' : 'Make default'}
                        </Button>
                        <Button
                          size="xs"
                          className="w-full"
                          variant="destructive"
                          disabled={removeImage.isPending}
                          onClick={() => removeImage.mutate(img.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

            </div>
          )}
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
