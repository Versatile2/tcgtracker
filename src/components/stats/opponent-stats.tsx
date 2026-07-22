import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { OpponentLeaderStatDTO } from '@/lib/dto';

export function OpponentStats({ rows }: { rows: OpponentLeaderStatDTO[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">By opponent</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.leaderId} className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {r.games} {r.games === 1 ? 'game' : 'games'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: pct(r.winRate) }} />
            </div>
            {r.byMeta.length > 0 && (
              <div className="mt-2 space-y-1 border-l pl-3">
                {r.byMeta.map((m) => (
                  <div key={m.metaId} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{m.name}</span>
                    <span className="tabular-nums">
                      {formatRecord({ wins: m.wins, losses: m.losses, draws: m.draws })} · {pct(m.winRate)} · {m.games} {m.games === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
