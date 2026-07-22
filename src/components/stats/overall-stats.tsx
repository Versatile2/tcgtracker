import { StatCard, pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { OverallStatsDTO } from '@/lib/dto';

export function OverallStats({ o }: { o: OverallStatsDTO }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Overall</h2>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Tournaments" value={String(o.totalTournaments)} />
        <StatCard label="Record" value={formatRecord({ wins: o.wins, losses: o.losses, draws: o.draws })} />
        <StatCard label="Win rate" value={pct(o.winRate)} />
        <StatCard label="Draw rate" value={pct(o.drawRate)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Best meta" value={o.bestMeta ? o.bestMeta.name : '—'} sub={o.bestMeta ? `${pct(o.bestMeta.winRate)} over ${o.bestMeta.games} games` : undefined} />
        <StatCard label="Most-played leader" value={o.mostPlayedLeader ? o.mostPlayedLeader.name : '—'} sub={o.mostPlayedLeader ? `${o.mostPlayedLeader.tournaments} tournaments` : undefined} />
      </div>
    </section>
  );
}
