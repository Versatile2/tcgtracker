'use client';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import { useMatchups } from '@/components/query-hooks';
import type { PlayedLeaderDTO, MatchupResultCountsDTO } from '@/lib/dto';

const verdictStyle: Record<'favored' | 'even' | 'unfavored', string> = {
  favored: 'bg-green-600 text-white',
  even: 'bg-yellow-500 text-black',
  unfavored: 'bg-red-600 text-white',
};

function CountsLine({ c }: { c: MatchupResultCountsDTO }) {
  return <span className="text-muted-foreground tabular-nums">{formatRecord(c)} · {pct(c.winRate)} · {c.games} {c.games === 1 ? 'game' : 'games'}</span>;
}

export function MatchupStats({ leaders }: { leaders: PlayedLeaderDTO[] }) {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const { data, isLoading } = useMatchups(leaderId);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Matchups</h2>
      {leaders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Log some rounds to see matchup analysis.</p>
      ) : (
        <Select value={leaderId ?? undefined} onValueChange={setLeaderId}>
          <SelectTrigger className="h-12"><SelectValue placeholder="Pick one of your leaders" /></SelectTrigger>
          <SelectContent>
            {leaders.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {leaderId && isLoading && <Skeleton className="h-24 w-full" />}
      {leaderId && data && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Opponents</h3>
            {data.opponents.length === 0 && <p className="text-sm text-muted-foreground">No rounds with this leader yet.</p>}
            {data.opponents.map((o) => (
              <div key={o.leaderId} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span className="flex items-center gap-2"><Badge className={verdictStyle[o.verdict]}>{o.verdict}</Badge>{o.name}</span>
                <CountsLine c={o} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Turn order</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 text-sm"><p className="font-medium">Went 1st</p><CountsLine c={data.turnOrder.first} /></div>
              <div className="rounded-lg border p-3 text-sm"><p className="font-medium">Went 2nd</p><CountsLine c={data.turnOrder.second} /></div>
            </div>
          </div>
          {data.colorBreakdown.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Vs color</h3>
              {data.colorBreakdown.map((c) => (
                <div key={c.color} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="capitalize">{c.color}</span>
                  <CountsLine c={c} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
