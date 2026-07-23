'use client';
import { useState } from 'react';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments, useLeaders } from '@/components/query-hooks';
import { TournamentCard } from './tournament-card';
import { tournamentTypeLabel } from '@/lib/labels';
import { formatRecord } from '@/lib/record';
import type { TournamentType } from '@/lib/dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

export function TournamentList() {
  const { data, isLoading, isError } = useTournaments();
  const { data: leaders } = useLeaders();
  const [filter, setFilter] = useState<TournamentType | 'all'>('all');

  const resolveLeader = (id: string) => leaders?.find((l) => l.id === id);

  const shown = data?.filter((t) => filter === 'all' || t.type === filter) ?? [];
  const totals = shown.reduce(
    (a, t) => ({ wins: a.wins + t.record.wins, losses: a.losses + t.record.losses, draws: a.draws + t.record.draws }),
    { wins: 0, losses: 0, draws: 0 },
  );

  return (
    <LargeTitleScreen title="Grand Line TCG">
      {data && shown.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          {shown.length} {shown.length === 1 ? 'tournament' : 'tournaments'} · <span className="tabular-nums">{formatRecord(totals)}</span>
        </p>
      )}

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

      <div className="mt-4 flex flex-col gap-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px] w-full rounded-2xl" />)}
        {isError && <p className="text-destructive">Couldn’t load tournaments. Pull to retry.</p>}
        {data && shown.map((t) => <TournamentCard key={t.id} t={t} resolveLeader={resolveLeader} />)}
        {data && data.length > 0 && shown.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            No {tournamentTypeLabel(filter as TournamentType)} tournaments yet.
          </div>
        )}
        {data && data.length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="font-medium">No tournaments yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Tap the <span className="font-semibold text-primary">+</span> below to log your first one.</p>
          </div>
        )}
      </div>
    </LargeTitleScreen>
  );
}
