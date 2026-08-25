'use client';
import { pct } from './stat-card';
import { LeaderAvatar } from '@/components/leaders/leader-avatar';
import { useState } from 'react';
import { useLeaders } from '@/components/query-hooks';
import { formatRecord } from '@/lib/record';
import type { OpponentRow } from '@/lib/stats/segment-stats';

/** Enough to see the shape of who you play, before it becomes a directory. */
const VISIBLE = 6;

export function OpponentStats({ rows }: { rows: OpponentRow[] }) {
  const { data: leaders } = useLeaders();
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;
  const leaderFor = (id: string) => leaders?.find((l) => l.id === id);
  // Uncapped, this grew with the player: a grinder with 25 distinct opponents
  // got a list without end at the bottom of the longest page in the app.
  const shown = expanded ? rows : rows.slice(0, VISIBLE);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">By opponent</h2>
      <div className="space-y-2">
        {shown.map((r) => {
          const leader = leaderFor(r.leaderId);
          return (
          <div key={r.leaderId} className="rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <LeaderAvatar name={r.name} colors={leader?.colors} setCode={leader?.setCode} size="md" />
              <div className="min-w-0 flex-1">
                {/* The name wraps rather than truncating, and the set code is
                    allowed to go first. Measured before this: 379px of name in
                    an 87px box — 77% of the string cut — while the code stayed
                    pinned, so the half that identifies the card was the half
                    that disappeared. Two adjacent rows both read "Monkey D…". */}
                <div className="flex items-start justify-between gap-2 text-sm">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-1 font-medium">
                    <span className="break-words">{r.name}</span>
                    {leader?.setCode && (
                      <span className="font-normal text-muted-foreground">{leader.setCode}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {r.games} {r.games === 1 ? 'game' : 'games'}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: pct(r.winRate) }} />
                </div>
              </div>
            </div>
            {/* The per-meta split used to be listed under every opponent, which
                tripled this list's height to show mostly one-game rows — and
                said it at the same visual weight as the record above it. The
                meta breakdown has its own card; at this granularity it was
                noise carrying the authority of signal. */}
          </div>
          );
        })}
        {rows.length > VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? 'Show fewer' : `Show all ${rows.length} opponents`}
          </button>
        )}
      </div>
    </section>
  );
}
