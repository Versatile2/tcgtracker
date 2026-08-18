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

// Matches are excluded: they are the other segment, not a filter within this one.
const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing', 'freeplay'];

type Segment = 'tournaments' | 'matches';

export function TournamentList() {
  const { data, isLoading, isError } = useTournaments();
  const { data: leaders } = useLeaders();
  const [filter, setFilter] = useState<TournamentType | 'all'>('all');
  const { entries } = useOutbox();
  const unsynced = pendingTournamentIds(entries);

  // Logging a match returns here; without this it would land on Tournaments and
  // the thing just logged would be nowhere in sight.
  const params = useSearchParams();
  const [segment, setSegment] = useState<Segment>(params?.get('tab') === 'matches' ? 'matches' : 'tournaments');
  const onMatches = segment === 'matches';

  const resolveLeader = (id: string) => leaders?.find((l) => l.id === id);

  const inSegment = data?.filter((t) => (t.type === MATCH_TYPE) === onMatches) ?? [];
  const shown = onMatches ? inSegment : inSegment.filter((t) => filter === 'all' || t.type === filter);
  const totals = shown.reduce(
    (a, t) => ({ wins: a.wins + t.record.wins, losses: a.losses + t.record.losses, draws: a.draws + t.record.draws }),
    { wins: 0, losses: 0, draws: 0 },
  );

  const noun = onMatches ? 'match' : 'tournament';
  const plural = onMatches ? 'matches' : 'tournaments';

  return (
    <LargeTitleScreen title="Grand Line TCG">
      {data && shown.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          {shown.length} {shown.length === 1 ? noun : plural} · <span className="tabular-nums">{formatRecord(totals)}</span>
        </p>
      )}

      {/* Two kinds of thing, not two filters — hence a segmented control rather
          than another chip alongside the types. */}
      <div className="mt-4 flex rounded-xl bg-muted p-1" role="tablist" aria-label="Show">
        {(['tournaments', 'matches'] as Segment[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={segment === s}
            onClick={() => setSegment(s)}
            className={cn(
              'h-10 flex-1 rounded-lg text-sm font-semibold capitalize transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              segment === s ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* The segment already states the intent, so this names one thing and goes
          straight there. The nav's + stays the route in from anywhere else. */}
      <Link
        href={onMatches ? '/matches/new' : '/tournaments/new'}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 text-sm font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" />
        New {onMatches ? 'Match' : 'Tournament'}
      </Link>

      {/* Type chips filter tournament types; a match has none of them. */}
      {!onMatches && (
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
              Tap <span className="font-semibold text-primary">New {onMatches ? 'Match' : 'Tournament'}</span> above to log your first one.
            </p>
          </div>
        )}
      </div>
    </LargeTitleScreen>
  );
}
