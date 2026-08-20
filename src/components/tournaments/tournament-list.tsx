'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Flame, Hand } from 'lucide-react';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments, useLeaders } from '@/components/query-hooks';
import { useOutbox, pendingTournamentIds } from '@/lib/outbox/use-outbox';
import { TournamentCard } from './tournament-card';
import { MatchCard } from '@/components/matches/match-card';
import { CardActionsSheet } from './card-actions-sheet';
import { hintSeen, markHintSeen } from '@/lib/hint-seen';
import { tournamentTypeLabel } from '@/lib/labels';
import { formatRecord } from '@/lib/record';
import { MATCH_TYPE } from '@/lib/tournament-kinds';
import { useProgress } from '@/components/progress/use-progress';
import { useIsMounted } from '@/lib/use-is-mounted';
import { cn } from '@/lib/utils';
import type { TournamentType, TournamentSummaryDTO } from '@/lib/dto';
import { isFreeplay, TOURNAMENT_TYPES, FREEPLAY_TYPES } from '@/lib/tournament-kinds';
import { segmentFromTab, type Segment } from './segment';

// Sessions and matches are segments of their own, not filters within this one —
// but each segment filters within itself. A match has one type, so it has none.
const CHIP_TYPES: Record<Segment, TournamentType[]> = {
  tournaments: TOURNAMENT_TYPES,
  sessions: FREEPLAY_TYPES,
  matches: [],
};

/**
 * The three kinds of thing you can log, and what each segment says about itself.
 * Tournaments is the catch-all: anything that is not a session or a match.
 */
const SEGMENTS: { key: Segment; noun: string; plural: string; add: string; href: string }[] = [
  { key: 'tournaments', noun: 'tournament', plural: 'tournaments', add: 'New Tournament', href: '/tournaments/new' },
  { key: 'sessions', noun: 'session', plural: 'sessions', add: 'New Session', href: '/sessions/new' },
  { key: 'matches', noun: 'match', plural: 'matches', add: 'New Match', href: '/matches/new' },
];

export function TournamentList() {
  /*
   * The query cache is persisted to localStorage and restores synchronously, so
   * on any load with a warm cache the client's first render already has
   * tournaments while the server rendered none — and React throws the whole
   * tree away and rebuilds it.
   *
   * Holding the data back until mounted makes that first render match the
   * server. Nothing is lost visually: the server HTML never contained the list
   * either, so this only stops the mismatch, one tick earlier than the paint.
   */
  const mounted = useIsMounted();
  const query = useTournaments();
  const data = mounted ? query.data : undefined;
  const isLoading = mounted ? query.isLoading : true;
  const isError = mounted ? query.isError : false;
  const { data: leaders } = useLeaders();
  const [filter, setFilter] = useState<TournamentType | 'all'>('all');
  const { entries } = useOutbox();
  const { streak } = useProgress();
  // One sheet for the whole list, not one per card: this can run to dozens.
  const [actionsFor, setActionsFor] = useState<TournamentSummaryDTO | null>(null);
  // Derived, not stored: whether the hint has been seen is a fact about
  // storage, and marking it seen already triggers the render that hides it.
  // Behind `mounted` because localStorage is client-only and this is prerendered.
  const showHint = mounted && !hintSeen('longpress');

  const openActions = (t: TournamentSummaryDTO) => {
    // Retired the moment the gesture is actually used — it taught its lesson.
    markHintSeen('longpress');
    setActionsFor(t);
  };
  const unsynced = pendingTournamentIds(entries);

  // Logging returns here with ?tab set; without it you would land on Tournaments
  // and the thing you just logged would be nowhere in sight.
  const params = useSearchParams();
  const tab = params?.get('tab');
  const [segment, setSegment] = useState<Segment>(segmentFromTab(tab));
  const onMatches = segment === 'matches';
  const current = SEGMENTS.find((s) => s.key === segment)!;
  // The filter belongs to the segment, not to the page. Carrying "Regionals"
  // into Sessions would show an empty list with nothing on screen to explain it.
  const selectSegment = (key: Segment) => {
    setSegment(key);
    setFilter('all');
  };
  const chips = CHIP_TYPES[segment];

  const resolveLeader = (id: string) => leaders?.find((l) => l.id === id);

  const belongs = (t: { type: TournamentType }) =>
    segment === 'matches' ? t.type === MATCH_TYPE
      : segment === 'sessions' ? isFreeplay(t.type)
      : t.type !== MATCH_TYPE && !isFreeplay(t.type);
  const inSegment = data?.filter(belongs) ?? [];
  const shown = chips.length > 0
    ? inSegment.filter((t) => filter === 'all' || t.type === filter)
    : inSegment;
  const totals = shown.reduce(
    (a, t) => ({ wins: a.wins + t.record.wins, losses: a.losses + t.record.losses, draws: a.draws + t.record.draws }),
    { wins: 0, losses: 0, draws: 0 },
  );

  const { noun, plural } = current;

  return (
    <LargeTitleScreen title="Grand Line TCG">
      {data && shown.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          {shown.length} {shown.length === 1 ? noun : plural} · <span className="tabular-nums">{formatRecord(totals)}</span>
        </p>
      )}

      {/* The one place the habit is nudged, and only when there is a real
          streak to lose. A prompt shown to someone with nothing at stake is
          nagging; shown to someone six weeks in, it is the reason they log. */}
      {streak.atRisk && streak.weeks > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2 text-sm">
          <Flame className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-semibold tabular-nums">{streak.weeks} week{streak.weeks === 1 ? '' : 's'}</span>
            {' '}running — log a game this week to keep it.
          </span>
        </p>
      )}

      {/* Three kinds of thing, not three filters — hence a segmented control
          rather than more chips alongside the tournament types. */}
      <div className="mt-4 flex rounded-xl bg-muted p-1" role="tablist" aria-label="Show">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => selectSegment(s.key)}
            className={cn(
              'h-10 flex-1 rounded-lg text-sm font-semibold capitalize transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              segment === s.key ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {s.key}
          </button>
        ))}
      </div>

      {/* The segment already states the intent, so this names one thing and goes
          straight there. The nav's + stays the route in from anywhere else. */}
      <Link
        href={current.href}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 text-sm font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" />
        {current.add}
      </Link>

      {/* Type chips filter within the segment; matches have one type, so none.
          Same radiogroup pattern as the type strip in the form — both are "pick
          one from a set of chips", and this row used to be the one picker in
          the app that said so only by background colour. */}
      {chips.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2" role="radiogroup" aria-label={`Filter ${plural}`}>
          <button
            role="radio"
            aria-checked={filter === 'all'}
            onClick={() => setFilter('all')}
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md'}`}>All</button>
          {chips.map((ty) => (
            <button
              key={ty}
              role="radio"
              aria-checked={filter === ty}
              onClick={() => setFilter(ty)}
              className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === ty ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md'}`}>
              {tournamentTypeLabel(ty)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px] w-full rounded-2xl" />)}
        {isError && <p className="text-destructive">Couldn’t load {plural}. Pull to retry.</p>}
        {data && shown.map((t) => (
          onMatches
            ? <MatchCard key={t.id} t={t} resolveLeader={resolveLeader} unsynced={unsynced.has(t.id)}
                onQuickActions={() => openActions(t)} />
            : <TournamentCard key={t.id} t={t} resolveLeader={resolveLeader} unsynced={unsynced.has(t.id)}
                onQuickActions={() => openActions(t)} />
        ))}
        {data && inSegment.length > 0 && shown.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            Nothing filed under {tournamentTypeLabel(filter as TournamentType)} yet.
          </div>
        )}
        {data && inSegment.length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="font-medium">No {plural} yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap <span className="font-semibold text-primary">{current.add}</span> above to log your first one.
            </p>
          </div>
        )}
        {/* Taught once, then gone. A gesture nobody knows about is not a
            shortcut, but a permanent instruction is furniture. */}
        {data && shown.length > 0 && showHint && (
          <p className="flex items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground">
            <Hand className="size-3.5" aria-hidden />
            Press and hold a card for quick actions.
          </p>
        )}
      </div>

      <CardActionsSheet
        target={actionsFor}
        onOpenChange={(open) => { if (!open) setActionsFor(null); }}
        resolveLeader={resolveLeader} />
    </LargeTitleScreen>
  );
}
