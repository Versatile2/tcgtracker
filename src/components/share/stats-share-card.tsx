import { formatRecord } from '@/lib/record';
import type { OverallStatsDTO } from '@/lib/dto';
import { Watermark } from './watermark';

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function StatsShareCard({ overall }: { overall: OverallStatsDTO }) {
  return (
    <div className="w-[380px] space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
      <p className="text-lg font-bold">My Grand Line TCG</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Tournaments" value={String(overall.totalTournaments)} />
        <Stat label="Record" value={formatRecord(overall)} />
        <Stat label="Win rate" value={pct(overall.winRate)} />
        <Stat label="Draw rate" value={pct(overall.drawRate)} />
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        {overall.bestMeta && (
          <p>Best meta: <span className="text-foreground">{overall.bestMeta.name}</span> ({pct(overall.bestMeta.winRate)})</p>
        )}
        {overall.mostPlayedLeader && (
          <p>Top leader: <span className="text-foreground">{overall.mostPlayedLeader.name}</span></p>
        )}
      </div>
      <Watermark />
    </div>
  );
}
