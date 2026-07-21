import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { PerSetStatDTO } from '@/lib/dto';

export function PerSetStats({ rows }: { rows: PerSetStatDTO[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">By set</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.setId ?? 'none'} className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {r.tournaments} {r.tournaments === 1 ? 'tournament' : 'tournaments'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: pct(r.winRate) }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
