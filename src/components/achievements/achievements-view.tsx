'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAchievements } from '@/components/query-hooks';
import { AchievementCard } from './achievement-card';
import { newlyUnlocked } from '@/lib/newly-unlocked';

const SEEN_KEY = 'crewstat-seen-achievements';

export function AchievementsView() {
  const { data, isLoading, isError } = useAchievements();
  const handled = useRef(false);

  useEffect(() => {
    if (!data || handled.current || typeof window === 'undefined') return;
    handled.current = true;
    const unlocked = data.achievements.filter((a) => a.unlocked).map((a) => a.key);
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (raw === null) {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked)); // first load: seed silently
      return;
    }
    let seen: string[] = [];
    try { seen = JSON.parse(raw) as string[]; } catch { seen = []; }
    for (const key of newlyUnlocked(unlocked, seen)) {
      const a = data.achievements.find((x) => x.key === key);
      if (a) toast.success(`Achievement unlocked: ${a.name}`);
    }
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked));
  }, [data]);

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Achievements</h1>
        <Link href="/" className="text-sm text-muted-foreground">← Home</Link>
      </div>
      {isLoading && <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>}
      {isError && <p className="text-destructive">Couldn’t load achievements.</p>}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">{data.unlockedCount} of {data.total} unlocked</p>
          <div className="grid grid-cols-2 gap-3">
            {data.achievements.map((a) => <AchievementCard key={a.key} a={a} />)}
          </div>
        </>
      )}
    </main>
  );
}
