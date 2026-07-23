'use client';
import { useState } from 'react';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments } from '@/components/query-hooks';
import { TournamentCard } from './tournament-card';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentType } from '@/lib/dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

export function TournamentList() {
  const { data, isLoading, isError } = useTournaments();
  const [filter, setFilter] = useState<TournamentType | 'all'>('all');

  return (
    <LargeTitleScreen title="Grand Line TCG">
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        <button onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md'}`}>All</button>
        {TYPES.map((ty) => (
          <button key={ty} onClick={() => setFilter(ty)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors ${filter === ty ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md'}`}>
            {tournamentTypeLabel(ty)}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        {isError && <p className="text-destructive">Couldn’t load tournaments. Pull to retry.</p>}
        {data && data.filter((t) => filter === 'all' || t.type === filter).map((t) => (
          <TournamentCard key={t.id} t={t} />
        ))}
        {data && data.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            No tournaments yet. Log your first one!
          </div>
        )}
      </div>
    </LargeTitleScreen>
  );
}
