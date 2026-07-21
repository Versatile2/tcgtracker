'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
    <main className="mx-auto max-w-xl p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Crew Stat</h1>
        <Link href="/stats" className="text-sm font-medium text-muted-foreground">Stats →</Link>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        <button onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1 text-sm ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>All</button>
        {TYPES.map((ty) => (
          <button key={ty} onClick={() => setFilter(ty)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${filter === ty ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
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

      <Link href="/tournaments/new" className="fixed inset-x-0 bottom-4 mx-auto w-[calc(100%-2rem)] max-w-xl">
        <Button className="h-14 w-full text-base shadow-lg"><Plus className="mr-2 h-5 w-5" /> Add Tournament</Button>
      </Link>
    </main>
  );
}
