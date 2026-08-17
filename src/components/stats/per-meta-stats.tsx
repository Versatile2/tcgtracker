import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { PerMetaStatDTO } from '@/lib/dto';

export function PerMetaStats({ rows }: { rows: PerMetaStatDTO[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">By meta</h2>
      <div className="space-y-2">
        {rows.map((r) => {
          // Summed here rather than added to PerMetaStatDTO: the parts are already
          // on the row, and widening the DTO for a display detail would mean
          // touching the service and its tests.
          const games = r.wins + r.losses + r.draws;
          return (
          <div key={r.metaId ?? 'none'} className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {games} {games === 1 ? 'game' : 'games'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: pct(r.winRate) }} />
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}
