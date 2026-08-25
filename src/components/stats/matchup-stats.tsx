'use client';
import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import { matchupsForLeader, type Counts, type Verdict } from '@/lib/stats/matchups';
import type { LeaderDTO, TournamentSummaryDTO } from '@/lib/dto';
import type { Segment } from '@/components/tournaments/segment';

const verdictStyle: Record<Verdict, string> = {
  favored: 'bg-green-600 text-white',
  even: 'bg-yellow-500 text-black',
  unfavored: 'bg-red-600 text-white',
};

const PLACEHOLDER = 'Pick one of your leaders';

function CountsLine({ c }: { c: Counts }) {
  return <span className="text-muted-foreground tabular-nums">{formatRecord(c)} · {pct(c.winRate)} · {c.games} {c.games === 1 ? 'game' : 'games'}</span>;
}

/**
 * How one of your leaders fares, within this kind of game.
 *
 * Computed from the cache rather than fetched, which is what lets it be scoped
 * to a segment at all — the endpoint it replaced answered across every game
 * type at once, so a leader's tournament record was mixed in with its testing
 * games.
 */
export function MatchupStats({
  tournaments,
  leaders,
  segment,
  playedLeaders,
}: {
  tournaments: readonly TournamentSummaryDTO[];
  leaders: readonly LeaderDTO[];
  segment: Segment;
  playedLeaders: { id: string; name: string }[];
}) {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const data = useMemo(
    () => (leaderId ? matchupsForLeader(tournaments, leaders, segment, leaderId) : null),
    [tournaments, leaders, segment, leaderId],
  );

  if (playedLeaders.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Matchups</h2>
      {/* `null`, not `undefined`: passing undefined leaves the select
          uncontrolled until the first choice, and Base UI warns when a component
          switches from uncontrolled to controlled mid-life. */}
      <Select value={leaderId} onValueChange={setLeaderId}>
        <SelectTrigger className="h-12">
          {/* Base UI renders the raw value unless given this function, so without
              it the trigger showed the leader's UUID once one was chosen. */}
          <SelectValue placeholder={PLACEHOLDER}>
            {(id) => playedLeaders.find((l) => l.id === id)?.name ?? PLACEHOLDER}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {playedLeaders.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {data && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Opponents</h3>
            {data.opponents.length === 0 && <p className="text-sm text-muted-foreground">No rounds with this leader here yet.</p>}
            {data.opponents.map((o) => (
              <div key={o.leaderId} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge className={verdictStyle[o.verdict]}>{o.verdict}</Badge>
                  <span className="truncate">{o.name}</span>
                </span>
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
              {/* Per colour present, not per combination like the donut above:
                  the question here is "how does this leader do into red?", and a
                  two-colour opponent is a real data point for both its colours. */}
              <h3 className="text-sm font-semibold">Vs colour</h3>
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
