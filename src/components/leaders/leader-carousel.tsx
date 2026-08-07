'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { leaderBackground, leaderTextColor, leaderInitial, getLeaderImage } from '@/lib/leader-visual';

type Option = { id: string; name: string; colors?: string[]; setCode?: string | null };

/**
 * Visual opponent-leader picker: a search box over a horizontal row of portrait
 * leader cards (real card art + name/set-code caption). The selected card gets
 * an accent ring. A trailing "add" card creates a custom leader from the current
 * search text.
 *
 * Search matches the set code as well as the name, because names are not unique
 * — typing "ST13" is the only way to pick one of the 15 Monkey D. Luffy cards.
 */
export function LeaderCarousel({
  options, value, onChange, onAddCustom, disabled,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  /** Resolves to null when the leader could not be created (e.g. offline). */
  onAddCustom?: (name: string) => Promise<{ id: string; name: string } | null>;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = q
    ? options.filter((o) => `${o.name} ${o.setCode ?? ''}`.toLowerCase().includes(q))
    : options;
  const canAdd = Boolean(onAddCustom) && q.length > 0 && !options.some((o) => o.name.toLowerCase() === q);

  async function add() {
    if (!onAddCustom) return;
    const created = await onAddCustom(search.trim());
    if (!created) return;
    onChange(created.id);
    setSearch('');
  }

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search leaders…"
        className="h-11 text-base"
        disabled={disabled}
      />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {shown.map((o) => {
          const selected = value === o.id;
          const src = getLeaderImage(o.setCode);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(o.id)}
              disabled={disabled}
              className={cn(
                'w-24 shrink-0 overflow-hidden rounded-xl outline-none ring-2 transition focus-visible:ring-ring',
                selected ? 'ring-primary' : 'ring-transparent opacity-75 hover:opacity-100',
              )}
            >
              {/* 5:7 card aspect, matching the 600x838 source art. */}
              <div
                className="flex h-[8.4rem] items-center justify-center text-3xl font-bold"
                style={src ? undefined : { background: leaderBackground(o.colors), color: leaderTextColor(o.colors) }}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  leaderInitial(o.name)
                )}
              </div>
              <div className="bg-white px-1.5 py-1 text-left text-black">
                <div className="truncate text-xs font-bold leading-tight">{o.name}</div>
                <div className="truncate text-[0.625rem] text-neutral-500">{o.setCode ?? '—'}</div>
              </div>
            </button>
          );
        })}
        {canAdd && (
          <button
            type="button"
            onClick={add}
            disabled={disabled}
            className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 text-muted-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring hover:text-foreground"
            style={{ height: '11.15rem' }}
          >
            <Plus className="size-6" />
            <span className="px-1 text-center text-xs">Add “{search.trim()}”</span>
          </button>
        )}
        {shown.length === 0 && !canAdd && (
          <p className="px-1 py-8 text-sm text-muted-foreground">No leaders match.</p>
        )}
      </div>
    </div>
  );
}
