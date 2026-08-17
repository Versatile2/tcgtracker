'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { cn } from '@/lib/utils';
import {
  leaderBackground, leaderTextColor, leaderInitial, getLeaderImage, leaderSearchText,
  leaderColorBand, bandSwatch, bandField, COLOR_BANDS, type ColorBand,
} from '@/lib/leader-visual';

/*
 * THESIS: a leader is chosen by recognising its card, not by scrolling a shelf of
 * 132 of them. The picker refuses the undifferentiated carousel: it shows the few
 * decks you actually meet, and puts the whole catalog behind one tap, organised by
 * the axis players already think in — colour.
 * OWN-WORLD: the app's own tokens, indigo accent, no new palette. The six OPTCG
 * colours are the only chromatic system: each band is headed by a field of its own
 * colour, mixed toward the surface so it reads in either theme. Cards are framed
 * objects captioned on a scrim.
 * STORY: "the deck I want is probably right here — and if not, it's under its colour."
 * FIRST VIEWPORT: three likely leaders at a size where the art identifies them, over
 * one full-width control that opens the catalog.
 * FORM: two-tier suggest/browse, top of the ordered structure list; browse expands
 * in place rather than in a nested overlay, because this component renders inside a
 * bottom sheet and nesting overlays there is fragile. The expansion is the one
 * authored motion moment.
 */

type Option = { id: string; name: string; colors?: string[]; setCode?: string | null };

/** Kept short on purpose: this tier sits inline inside a bottom sheet, where height is scarce. */
const SUGGEST_LIMIT = 3;

/**
 * The card face: art (or a colour field for custom leaders with no card), with the
 * name and set code on a scrim at its foot. The scrim replaces the old opaque white
 * caption strip, which ignored the theme and sat on the art like a price sticker.
 *
 * The scrim is black in both themes by design — it sits over card art, not over the
 * page, so it takes its contrast from the artwork rather than from the theme.
 *
 * Set code carries real weight because names are not unique: there are 15 Monkey D.
 * Luffy printings and the code is the only thing separating them.
 */
function LeaderCard({ leader, selected }: { leader: Option; selected: boolean }) {
  const src = getLeaderImage(leader.setCode);
  return (
    <div
      className={cn(
        'relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-muted',
        // Dropped when selected so the accent ring is not doubled by an inner edge.
        !selected && 'ring-1 ring-border/70',
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div
          className="flex size-full items-center justify-center text-2xl font-bold"
          style={{ background: leaderBackground(leader.colors), color: leaderTextColor(leader.colors) }}
        >
          {leaderInitial(leader.name)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-1.5 pt-4 pb-1 text-left">
        <div className="truncate text-xs font-semibold leading-tight text-white">{leader.name}</div>
        <div className="truncate text-[0.6875rem] font-medium leading-tight text-white/90 tabular-nums">
          {leader.setCode ?? 'Custom'}
        </div>
      </div>
    </div>
  );
}

function LeaderTile({
  leader, selected, disabled, onSelect,
}: {
  leader: Option;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${leader.name}${leader.setCode ? `, ${leader.setCode}` : ''}`}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'rounded-lg outline-none transition-[transform,box-shadow] duration-150 ease-out',
        // Focus must not read as selection: both would otherwise be a 2px indigo
        // ring, since --ring and --primary are the same accent.
        'focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50',
        selected
          ? '-translate-y-0.5 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.45)] ring-2 ring-primary'
          : 'hover:-translate-y-px hover:shadow-[0_3px_10px_-5px_rgb(0_0_0/0.35)] active:scale-[0.97]',
      )}
    >
      <LeaderCard leader={leader} selected={selected} />
    </button>
  );
}

function SkeletonTile() {
  return <div className="aspect-[5/7] w-full animate-pulse rounded-lg bg-muted" />;
}

/**
 * Leader picker. Three states: collapsed onto the chosen leader, a short list of
 * likely leaders, and the full catalog banded by colour.
 *
 * `suggested` is an ordered list of ids the caller believes are likely — decks you
 * have played, or opponents you have actually faced. It degrades to nothing for a
 * brand-new account, which is why the empty case falls through to the catalog
 * rather than showing a hole.
 */
export function LeaderPicker({
  options, value, onChange, onAddCustom,
  suggested, suggestLabel, suggestionsPending = false,
  selectedLabel, collapsible = true, disabled,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  /** Resolves to null when the leader could not be created (e.g. offline). */
  onAddCustom?: (name: string) => Promise<{ id: string; name: string } | null>;
  /** Ordered ids to offer first. Unknown ids are ignored. */
  suggested?: string[];
  /** Names why these leaders are being offered, e.g. "Your decks". */
  suggestLabel?: string;
  /** Kicker over the chosen leader, e.g. "Playing as". Omit where the surrounding
   *  form already labels the field. */
  selectedLabel?: string;
  /**
   * True while the history behind `suggested` is still loading. Without it the
   * picker would open on the full catalog and then swap to the suggest tier when
   * history lands, moving the layout under the user — and unmounting the search
   * box they may already be typing into.
   */
  suggestionsPending?: boolean;
  /**
   * Set false where the parent already renders the current choice and its own
   * "change" control — the freeplay "Playing as" header does. Without this the
   * picker collapses onto the same leader the parent is already showing, and
   * switching decks costs two taps instead of one.
   */
  collapsible?: boolean;
  disabled?: boolean;
}) {
  const [browsing, setBrowsing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const selected = options.find((o) => o.id === value);
  const collapsed = collapsible && Boolean(selected) && !changing;
  const q = search.trim().toLowerCase();

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  /**
   * The current selection always leads. A leader picked out of the catalog is by
   * definition not in your history, so without this the suggest tier would show
   * three unringed cards while something else was selected — and the ring is the
   * whole state language.
   */
  const suggestions = useMemo(() => {
    const ids = [...(value ? [value] : []), ...(suggested ?? [])];
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const o = byId.get(id);
      if (o) out.push(o);
      if (out.length === SUGGEST_LIMIT) break;
    }
    return out;
  }, [value, suggested, byId]);

  const matches = useMemo(
    () => (q ? options.filter((o) => leaderSearchText(o.name, o.setCode).includes(q)) : options),
    [options, q],
  );

  /** Grouped for the catalog; a search still groups, so a hit's colour stays legible. */
  const bands = useMemo(() => {
    const groups = new Map<ColorBand, Option[]>();
    for (const o of matches) {
      const band = leaderColorBand(o.colors);
      const list = groups.get(band) ?? [];
      list.push(o);
      groups.set(band, list);
    }
    return COLOR_BANDS.map((b) => ({ ...b, leaders: groups.get(b.key) ?? [] })).filter((b) => b.leaders.length > 0);
  }, [matches]);

  // Only offered once the catalog has nothing to give: otherwise typing "Luffy"
  // would offer to create a custom leader above 15 genuine matches.
  const canAdd = Boolean(onAddCustom) && q.length > 0 && matches.length === 0;

  function choose(id: string) {
    onChange(id);
    setBrowsing(false);
    setChanging(false);
    setSearch('');
  }

  async function add() {
    if (!onAddCustom || adding) return;
    setAdding(true);
    try {
      const created = await onAddCustom(search.trim());
      if (created) choose(created.id);
    } catch {
      // The caller owns user-facing feedback; swallowing here only stops an
      // unhandled rejection escaping a click handler.
    } finally {
      setAdding(false);
    }
  }

  // One presentation for a chosen leader, wherever the choice was made: the
  // compact row the freeplay "Playing as" header used to hand-roll. Selection is
  // a settled fact, so it reads as a tidy line rather than a card on display.
  if (collapsed && selected) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-primary/35 bg-primary/8 p-2">
        <LeaderAvatar name={selected.name} colors={selected.colors} setCode={selected.setCode} size="md" />
        <div className="min-w-0 flex-1">
          {selectedLabel && (
            <div className="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">{selectedLabel}</div>
          )}
          <div className="truncate text-sm font-bold">{selected.name}</div>
          <div className="truncate text-xs text-muted-foreground tabular-nums">{selected.setCode ?? 'Custom'}</div>
        </div>
        <button
          type="button"
          onClick={() => setChanging(true)}
          disabled={disabled}
          aria-label={`Change leader, currently ${selected.name}`}
          className="min-h-11 shrink-0 rounded-md px-3 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Change
        </button>
      </div>
    );
  }

  // Hold the suggest-shaped layout while history loads, rather than showing the
  // catalog and then rearranging under the user.
  if (!browsing && (suggestionsPending || suggestions.length > 0)) {
    return (
      <div className="space-y-2">
        {suggestLabel && (
          <p className="text-xs font-medium text-muted-foreground">{suggestLabel}</p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {suggestionsPending && suggestions.length === 0
            ? Array.from({ length: SUGGEST_LIMIT }, (_, i) => <SkeletonTile key={i} />)
            : suggestions.map((o) => (
              <LeaderTile key={o.id} leader={o} selected={value === o.id} disabled={disabled} onSelect={() => choose(o.id)} />
            ))}
        </div>
        <button
          type="button"
          onClick={() => setBrowsing(true)}
          disabled={disabled}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/70 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Search className="size-4" />
          Browse all {options.length || ''} leaders
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-3 duration-200 ease-out">
      <div className="flex items-center gap-2">
        {(suggestions.length > 0 || suggestionsPending) && (
          <button
            type="button"
            onClick={() => { setBrowsing(false); setSearch(''); }}
            aria-label="Back to suggested leaders"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/70 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or set code…"
          aria-label="Search leaders by name or set code"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 text-base"
          disabled={disabled}
        />
      </div>

      {canAdd && (
        <button
          type="button"
          onClick={add}
          disabled={disabled || adding}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Plus className="size-4" />
          {adding ? 'Adding…' : `Add “${search.trim()}” as a custom leader`}
        </button>
      )}

      {/* An empty catalog means the leaders query has not resolved yet — saying
          "no leaders match" there would blame the search for a loading state. */}
      {options.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <SkeletonTile key={i} />)}
        </div>
      ) : bands.length === 0 && !canAdd ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No leaders match “{search.trim()}”.</p>
      ) : (
        <div className="max-h-[22rem] space-y-3 overflow-y-auto overscroll-contain">
          {bands.map((band) => (
            <section key={band.key}>
              {/* The band's own colour, mixed toward the surface so it reads as a
                  field in either theme while the label stays plain foreground text. */}
              <div
                className="sticky top-0 z-10 flex items-center gap-2 rounded-lg px-2.5 py-2 backdrop-blur-sm"
                style={{ background: bandField(band.key) }}
              >
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full ring-1 ring-inset ring-border"
                  style={{ background: bandSwatch(band.key) }}
                />
                <h3 className="text-sm font-bold tracking-tight">{band.label}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">{band.leaders.length}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {band.leaders.map((o) => (
                  <LeaderTile key={o.id} leader={o} selected={value === o.id} disabled={disabled} onSelect={() => choose(o.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
