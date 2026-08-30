'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { keys } from '@/lib/query-keys';
import type { LeaderDTO } from '@/lib/dto';
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
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'draft' | 'published' | 'hidden';
type ColorFilter = 'all' | (typeof COLOR_BANDS)[number]['key'];

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All statuses', draft: 'Draft', published: 'Published', hidden: 'Hidden',
};

/**
 * One card per leader.
 *
 * The artwork is the leader's own default, not `LeaderAvatar`'s — that reads the
 * signed-in player's printing preference from context, which is the wrong
 * question here: the admin is curating the catalog, not looking at their own
 * collection.
 */
function LeaderCard({ leader }: { leader: LeaderDTO }) {
  const src = leaderImageUrl(leader.defaultImageId);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2 text-left">
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
    </div>
  );
}

export function LeaderGrid() {
  const { data, isPending, isError } = useQuery({
    queryKey: keys.adminLeaders,
    queryFn: apiClient.adminListLeaders,
  });

  const [status, setStatus] = useState<StatusFilter>('all');
  const [color, setColor] = useState<ColorFilter>('all');
  const [q, setQ] = useState('');
  const [noImageOnly, setNoImageOnly] = useState(false);

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

  if (isError) return <p className="text-sm text-destructive">Could not load the catalog.</p>;

  return (
    <div className="space-y-4">
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
        <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6')}>
          {shown.map((l) => <LeaderCard key={l.id} leader={l} />)}
        </div>
      )}
    </div>
  );
}
