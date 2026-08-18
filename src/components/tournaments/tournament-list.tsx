'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments, useLeaders } from '@/components/query-hooks';
import { useOutbox, pendingTournamentIds } from '@/lib/outbox/use-outbox';
import { TournamentCard } from './tournament-card';
import { MatchCard } from '@/components/matches/match-card';
import { tournamentTypeLabel } from '@/lib/labels';
import { formatRecord } from '@/lib/record';
import { MATCH_TYPE } from '@/lib/tournament-kinds';
import { cn } from '@/lib/utils';
import type { TournamentType } from '@/lib/dto';

// Freeplay and match are segments of their own, not filters within this one.
const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

type Segment = 'tournaments' | 'freeplay' | 'matches';

/**
 * The three kinds of thing you can log, and what each segment says about itself.
 * Tournaments is the catch-all: anything that is not freeplay or a match.
 */
const SEGMENTS: { key: Segment; noun: string; plural: string; add: string; href: string }[] = [
  { key: 'tournaments', noun: 'tournament', plural: 'tournaments', add: 'New Tournament', href: '/tournaments/new' },
  { key: 'freeplay', noun: 'session', plural: 'sessions', add: 'New Freeplay', href: '/freeplay/new' },
  { key: 'matches', noun: 'match', plural: 'matches', add: 'New Match', href: '/matches/new' },
];

export function TournamentList() {
  const { data, isLoading, isError } = useTournaments();
  const { data: leaders } = useLeaders();
  const [filter, setFilter] = useState<TournamentType | 'all'>('all');
  const { entries } = useOutbox();
  const unsynced = pendingTournamentIds(entries);

  // Logging returns here with ?tab set; without it you would land on Tournaments
  // and the thing you just logged would be nowhere in sight.
  const params = useSearchParams();
  const tab = params?.get('tab');
  const [segment, setSegment] = useState<Segment>(
    tab === 'matches' ? 'matches' : tab === 'freeplay' ? 'freeplay' : 'tournaments',
  );
  const onMatches = segment === 'matches';
  const current = SEGMENTS.find((s) => s.key === segment)!;

  const resolveLeader = (id: string) => leaders?.find((l) => l.id === id);

  const belongs = (t: { type: TournamentType }) =>
    segment === 'matches' ? t.type === MATCH_TYPE
      : segment === 'freeplay' ? t.type === 'freeplay'
      : t.type !== MATCH_TYPE && t.type !== 'freeplay';
  const inSegment = data?.filter(belongs) ?? [];
  // Only tournaments have a type worth filtering within.
  const shown = segment === 'tournaments'
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

      {/* Three kinds of thing, not three filters — hence a segmented control
          rather than more chips alongside the tournament types. */}
      <div className="mt-4 flex rounded-xl bg-muted p-1" role="tablist" aria-label="Show">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => setSegment(s.key)}
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

      {/* Type chips filter tournament types; freeplay and matches have none. */}
      {segment === 'tournaments' && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setFilter('all')}
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md'}`}>All</button>
          {TYPES.map((ty) => (
            <button key={ty} onClick={() => setFilter(ty)}
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
            ? <MatchCard key={t.id} t={t} resolveLeader={resolveLeader} unsynced={unsynced.has(t.id)} />
            : <TournamentCard key={t.id} t={t} resolveLeader={resolveLeader} unsynced={unsynced.has(t.id)} />
        ))}
        {data && inSegment.length > 0 && shown.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            No {tournamentTypeLabel(filter as TournamentType)} tournaments yet.
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
      </div>
    </LargeTitleScreen>
  );
}
