'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { useLeaderArt } from '@/components/leaders/leader-art-provider';
import type { LeaderImageDTO } from '@/lib/dto';
import { cn } from '@/lib/utils';
import { recentLeaders, pushRecentLeader, RECENT_LIMIT } from '@/lib/recent-leaders';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  leaderBackground, leaderTextColor, leaderInitial, leaderImageUrl, leaderSearchText,
} from '@/lib/leader-visual';

/*
 * THESIS: a leader is chosen by recognising its card, and at an event you reach
 * for the same few all day. So one shelf, in reaching order: what you last
 * picked, then the whole catalog in the only sequence a player knows by heart —
 * set code. No tiers, no gate, nothing behind a tap.
 * OWN-WORLD: the app's own tokens, indigo accent, no new palette. Cards are
 * framed objects captioned on a scrim.
 * STORY: "it's probably in the first few — and if not, I know roughly where it is."
 * FIRST VIEWPORT: the search field, then four cards at a size where the art
 * identifies them, the first of which is usually the answer.
 * FORM: a single horizontal strip. It replaced a two-tier suggest/browse split
 * whose colour-banded grid meant scrolling past Red to reach Yellow; colour was
 * the wrong axis, because a player looking for a card knows its set, not the
 * band it was filed under. Search is the escape hatch for distance — it matches
 * name, set code and starter-deck code — and the run label above the strip says
 * where a swipe has landed, since 132 card backs look much alike in motion.
 * NOTE: the strip owns the horizontal gesture. Nothing inside a card may answer
 * to a horizontal drag; that mistake once put the leader being logged one
 * misread swipe from changing. Choosing a printing is taps, on the settled
 * selection, and stays that way.
 */

type Option = { id: string; name: string; colors?: string[]; setCode?: string | null; images: LeaderImageDTO[] };

/** The head of the strip, before the run of set codes begins. */
const RECENT_LABEL = 'Recent';

/** "OP09-061" → "OP09": the run of cards a swipe is currently inside. */
const SET_RUN = /^[A-Z]+\d+/;

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
function LeaderCard({ leader, selected, imageId }: { leader: Option; selected: boolean; imageId?: string | null }) {
  const src = leaderImageUrl(imageId);
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
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent px-1.5 pt-6 pb-1 text-left">
        <div className="truncate text-xs font-semibold leading-tight text-white">{leader.name}</div>
        <div className="truncate text-[0.6875rem] font-medium leading-tight text-white/90 tabular-nums">
          {leader.setCode ?? 'Custom'}
        </div>
      </div>
    </div>
  );
}

/**
 * Opens the printing picker: the chosen leader's own thumbnail, made tappable.
 *
 * Rendered only for a card that was actually printed more than once. A bare
 * thumbnail says nothing about being tappable, so it carries a small stacked-
 * card marker — the one piece of furniture that turns "tap things and find out"
 * into "there is something here", at no cost in layout.
 */
function ArtTrigger({
  leader, count, open, disabled, onToggle,
}: {
  leader: Option;
  count: number;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={open}
      aria-label={`Artwork for ${leader.name}, ${count} available`}
      className="relative shrink-0 rounded-[0.35rem] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
    >
      <LeaderAvatar name={leader.name} colors={leader.colors} leaderId={leader.id} size="md" />
      <span
        aria-hidden
        // Top corner, not bottom: the printings open directly beneath this
        // thumbnail, and a marker down there collides with the first of them.
        className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-background text-foreground ring-1 ring-border"
      >
        <Layers className="size-2.5" />
      </span>
    </button>
  );
}

/**
 * The printings themselves, at the size the picker already uses for a leader
 * thumbnail — big enough to tell a base scan from a full-art parallel, which is
 * the whole reason this replaced a row of dots. Cycling through dots meant
 * choosing an art you could not see until you had already chosen it.
 *
 * The current printing carries the same 2px primary ring the catalog tiles use
 * for selection, so there is no second visual language to learn.
 */
function ArtRow({
  leader, current, disabled, onPick,
}: {
  leader: Option;
  current: string | null;
  disabled?: boolean;
  onPick: (imageId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Artwork for ${leader.name}`}
      className="mt-2 flex flex-wrap gap-2 duration-200 ease-out animate-in fade-in slide-in-from-top-1"
    >
      {leader.images.map((img, i) => {
        const isCurrent = img.id === current;
        return (
          <button
            key={img.id}
            type="button"
            onClick={() => onPick(img.id)}
            disabled={disabled}
            aria-pressed={isCurrent}
            aria-label={`Artwork ${i + 1} of ${leader.images.length}`}
            className={cn(
              'overflow-hidden rounded-[0.35rem] outline-none transition-[transform,box-shadow] duration-150 ease-out',
              'focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:opacity-50',
              isCurrent ? 'ring-2 ring-primary' : 'ring-1 ring-border/70 hover:-translate-y-px',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={leaderImageUrl(img.id) ?? ''} alt="" loading="lazy" className="h-[3.85rem] w-11 object-cover" />
          </button>
        );
      })}
    </div>
  );
}

/** One card in the strip. Fixed width, because the strip scrolls sideways. */
const CARD_W = 'w-24';

function StripCard({
  leader, band, selected, disabled, onSelect,
}: {
  leader: Option;
  /** The run this card belongs to — read back off the DOM to label the strip. */
  band: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  // Reads the chosen printing so the strip shows the art you settled on, but
  // offers no way to change it: a card here is for picking a leader, nothing
  // else. Choosing the printing belongs to the settled selection.
  const { imageIdFor } = useLeaderArt();
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-band={band}
      data-id={leader.id}
      aria-label={`${leader.name}${leader.setCode ? `, ${leader.setCode}` : ''}`}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        CARD_W,
        'shrink-0 snap-start rounded-lg outline-none transition-[transform,box-shadow] duration-150 ease-out',
        // Focus must not read as selection: both would otherwise be a 2px indigo
        // ring, since --ring and --primary are the same accent.
        'focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50',
        selected
          ? '-translate-y-0.5 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.45)] ring-2 ring-primary'
          : 'hover:-translate-y-px hover:shadow-[0_3px_10px_-5px_rgb(0_0_0/0.35)] active:scale-[0.97]',
      )}
    >
      <LeaderCard leader={leader} selected={selected} imageId={imageIdFor(leader.id)} />
    </button>
  );
}

function SkeletonTile() {
  return <div className={cn(CARD_W, 'aspect-[5/7] shrink-0 animate-pulse rounded-lg bg-muted')} />;
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
  options, value, onChange,
  suggested, recentKey, suggestionsPending = false,
  selectedLabel, collapsible = true, disabled,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  /** Ordered ids to offer first. Unknown ids are ignored. */
  suggested?: string[];
  /**
   * Scopes the remembered "last picked" list, e.g. 'my-deck' / 'opponent'. Two
   * pickers share a screen, and choosing an opponent must not reorder your own
   * decks. Omit to remember nothing.
   */
  recentKey?: string;
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
   * "change" control — the session "Playing as" header does. Without this the
   * picker collapses onto the same leader the parent is already showing, and
   * switching decks costs two taps instead of one.
   */
  collapsible?: boolean;
  disabled?: boolean;
}) {
  const [changing, setChanging] = useState(false);
  const [search, setSearch] = useState('');
  const [artOpen, setArtOpen] = useState(false);
  // Empty until hydration has matched the server HTML, then the stored list —
  // the app's existing rule for anything read out of localStorage. Memoised
  // rather than read every render, because this sits inside a sheet that
  // re-renders on every keystroke in the search box; `bump` re-reads it after a
  // pick without reaching for an effect.
  const mounted = useIsMounted();
  const [bump, setBump] = useState(0);
  const recentIds = useMemo(
    () => (mounted ? recentLeaders(recentKey) : []),
    // `bump` is the re-read token, not an input: localStorage is outside React,
    // so nothing else tells this memo the list changed. Removing it — which is
    // what the rule suggests — freezes the head at whatever it was on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounted, recentKey, bump],
  );

  /** Which run of set codes the strip is currently showing, e.g. "OP09". */
  const [marker, setMarker] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tick = useRef(0);

  /**
   * Open the strip where the current leader is, not at EB01. Tapping "Change"
   * on an OP09 deck and landing eleven sets away would be worse than the grid
   * this replaced.
   *
   * Sets scrollLeft directly rather than calling scrollIntoView, which walks up
   * and scrolls every ancestor — here that means the bottom sheet and the page
   * behind it.
   */
  useEffect(() => {
    const el = stripRef.current;
    if (!el || !value) return;
    const card = (Array.from(el.children) as HTMLElement[]).find((c) => c.dataset.id === value);
    if (!card) return;
    el.scrollLeft = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
    onStripScroll();
    // Only when the strip is (re)opened, never while the player is scrolling it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changing, collapsible]);

  const selected = options.find((o) => o.id === value);
  const collapsed = collapsible && Boolean(selected) && !changing;
  const q = search.trim().toLowerCase();

  // Which printing of the chosen leader is on show. Empty for a custom leader,
  // which has no card art to choose between.
  // `chooseArt`, not `choose`: this picker's own `choose` settles which leader
  // you are on, which is the decision this one dresses afterwards.
  const { imageIdFor, choose: chooseArt } = useLeaderArt();
  // The provider already falls back to the leader's default when the stored
  // choice is not one of this card's printings, so there is nothing to reconcile
  // here — it answers with an image this leader actually has, or null.
  const selectedImageId = imageIdFor(selected?.id);
  const pickArt = (imageId: string) => {
    if (selected) chooseArt(selected.id, imageId);
    // The row answered the question it was opened to ask.
    setArtOpen(false);
  };

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const matches = useMemo(
    () => (q ? options.filter((o) => leaderSearchText(o.name, o.setCode).includes(q)) : options),
    [options, q],
  );

  /**
   * The strip, in the order a player reaches for: the leaders they last picked,
   * then the whole catalog by set code.
   *
   * Recency is the head because it is where nearly every pick lands — you are on
   * one deck all day at an event, and facing the same few decks. Set code orders
   * the tail because it is the only ordering a player already knows by heart;
   * name order puts three unrelated Luffys together and hides which set they are
   * from.
   *
   * A search replaces the whole thing with its hits: asking for "op09" is a
   * statement about where you want to be, so a recents head would only push the
   * answer off-screen.
   */
  const strip = useMemo(() => {
    const byCode = [...matches].sort((a, b) => {
      // Custom leaders have no set code and no place in the run; they trail it.
      if (!a.setCode || !b.setCode) return Number(Boolean(b.setCode)) - Number(Boolean(a.setCode)) || a.name.localeCompare(b.name);
      return a.setCode.localeCompare(b.setCode);
    });
    if (q) return { recent: [] as Option[], rest: byCode };
    const seen = new Set<string>();
    const recent: Option[] = [];
    // Local recency first, then most-played from history to fill the head out —
    // a player on their first round has no recents but does have a deck list.
    for (const id of [...recentIds, ...(suggested ?? [])]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const o = byId.get(id);
      if (o) recent.push(o);
      if (recent.length === RECENT_LIMIT) break;
    }
    return { recent, rest: byCode.filter((o) => !seen.has(o.id)) };
  }, [matches, q, recentIds, suggested, byId]);


  function choose(id: string) {
    onChange(id);
    setChanging(false);
    setSearch('');
    // The open row belonged to the leader being replaced, and the new one may
    // have a different number of printings — or none.
    setArtOpen(false);
    pushRecentLeader(recentKey, id);
    setBump((n) => n + 1);
  }

  /**
   * Names the run of set codes at the left edge of the strip, so a swipe through
   * 132 near-identical card backs still tells you where you are. Read off the
   * DOM rather than computed from scrollLeft: the head holds a variable number
   * of recents and a divider, so there is no single item width to divide by.
   *
   * Throttled to one read per frame — the handler fires on every scroll event.
   */
  function onStripScroll() {
    if (tick.current) return;
    tick.current = requestAnimationFrame(() => {
      tick.current = 0;
      const el = stripRef.current;
      if (!el) return;
      const edge = el.scrollLeft;
      for (const child of Array.from(el.children) as HTMLElement[]) {
        if (child.offsetLeft + child.offsetWidth > edge && child.dataset.band) {
          setMarker(child.dataset.band);
          return;
        }
      }
    });
  }

  // One presentation for a chosen leader, wherever the choice was made: the
  // compact row the session "Playing as" header used to hand-roll. Selection is
  // a settled fact, so it reads as a tidy line rather than a card on display.
  if (collapsed && selected) {
    // Only a card printed more than once has anything to choose between; every
    // other leader, custom ones included, keeps the plain thumbnail.
    const hasAlternates = (selected?.images.length ?? 0) > 1;
    return (
      <div className="rounded-xl border border-primary/35 bg-primary/8 p-2">
        <div className="flex items-center gap-2.5">
          {hasAlternates ? (
            <ArtTrigger
              leader={selected}
              count={selected?.images.length ?? 0}
              open={artOpen}
              disabled={disabled}
              onToggle={() => setArtOpen((o) => !o)} />
          ) : (
            <LeaderAvatar name={selected.name} colors={selected.colors} leaderId={selected.id} size="md" />
          )}
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
            className="min-h-11 shrink-0 rounded-md px-3 text-sm font-semibold text-primary-ink outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Change
          </button>
        </div>
        {hasAlternates && artOpen && (
          <ArtRow
            leader={selected}
            current={selectedImageId}
            disabled={disabled}
            onPick={pickArt} />
        )}
      </div>
    );
  }

  const empty = strip.recent.length === 0 && strip.rest.length === 0;

  return (
    <div className="space-y-2 duration-200 ease-out animate-in fade-in">
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

      {/* An empty catalog means the leaders query has not resolved yet — saying
          "no leaders match" there would blame the search for a loading state. */}
      {options.length === 0 ? (
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => <SkeletonTile key={i} />)}
        </div>
      ) : empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No leaders match “{search.trim()}”.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between px-0.5">
            <span className="text-xs font-bold tracking-tight tabular-nums">
              {marker ?? (strip.recent.length > 0 ? RECENT_LABEL : (strip.rest[0]?.setCode?.match(SET_RUN)?.[0] ?? ''))}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {strip.recent.length + strip.rest.length}
            </span>
          </div>
          <div
            ref={stripRef}
            onScroll={onStripScroll}
            role="listbox"
            aria-label="Leaders"
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2"
          >
            {strip.recent.map((o) => (
              <StripCard key={o.id} leader={o} band={RECENT_LABEL} selected={value === o.id}
                disabled={disabled} onSelect={() => choose(o.id)} />
            ))}
            {/* Marks where recency stops and the run of set codes begins, so the
                head does not read as the start of OP01. */}
            {strip.recent.length > 0 && strip.rest.length > 0 && (
              <div aria-hidden className="my-1 w-px shrink-0 self-stretch bg-border" />
            )}
            {strip.rest.map((o) => (
              <StripCard key={o.id} leader={o} band={o.setCode?.match(SET_RUN)?.[0] ?? 'Custom'}
                selected={value === o.id} disabled={disabled} onSelect={() => choose(o.id)} />
            ))}
            {/* Held open while history loads, so recents arriving late widen the
                head instead of shoving the run of set codes sideways. */}
            {suggestionsPending && strip.recent.length === 0 && !q && (
              <SkeletonTile />
            )}
          </div>
        </>
      )}
    </div>
  );
}
