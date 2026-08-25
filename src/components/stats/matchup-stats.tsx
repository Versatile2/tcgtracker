'use client';
import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import { matchupsForLeader, type Counts, type Verdict } from '@/lib/stats/matchups';
import type { LeaderDTO, TournamentSummaryDTO } from '@/lib/dto';
import type { Segment } from '@/components/tournaments/segment';

/**
 * Verdicts wear the validated chart palette rather than raw green and red — the
 * same steps the rest of the surface was checked against in both themes, and the
 * only red/green semantic pair in the product, so it should not be off-token.
 *
 * `unknown` is the honest state, not a failure state: it reads as quiet rather
 * than as alarm, because "we have not seen enough" is not bad news.
 */
const verdictStyle: Record<Verdict, string> = {
  favored: 'bg-[var(--chart-green)] text-white',
  even: 'bg-muted text-muted-foreground',
  unfavored: 'bg-[var(--chart-red)] text-white',
  unknown: 'bg-muted text-muted-foreground',
};

const verdictLabel: Record<Verdict, string> = {
  favored: 'Favoured',
  even: 'Even',
  unfavored: 'Unfavoured',
  unknown: 'Too early',
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
  playedLeaders: { id: string; name: string; games: number; winRate: number; wins: number; losses: number; draws: number }[];
}) {
  /*
   * Opens on the leader you play most rather than on nothing.
   *
   * This section is the product's stated first edge, and it used to render an
   * empty select — so the reader had to know it was worth operating before it
   * would show them anything. A default costs nothing and means the answer is
   * already on screen; the picker is for changing it, not for starting it.
   */
  const [chosen, setChosen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const leaderId = chosen ?? playedLeaders[0]?.id ?? null;
  const setLeaderId = setChosen;
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
        {/* `min-h-12`, not `h-12`: the primitive sets its height through
            `data-[size=default]:h-8`, and tailwind-merge does not treat a
            variant-scoped class as conflicting with a plain one — so `h-12` was
            silently losing and the trigger stayed 32px, under the 44 a thumb
            needs. A min-height overrides a height whichever order they land in. */}
        <SelectTrigger className="min-h-12 w-full">
          {/* Base UI renders the raw value unless given this function, so without
              it the trigger showed the leader's UUID once one was chosen. */}
          <SelectValue placeholder={PLACEHOLDER}>
            {(id) => playedLeaders.find((l) => l.id === id)?.name ?? PLACEHOLDER}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* Each option carries its record: choosing between bare names is an
              uninformed choice, and the record is why you would switch. */}
          {playedLeaders.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name} · {formatRecord(l)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {data && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Opponents</h3>
            {data.opponents.length === 0 && <p className="text-sm text-muted-foreground">No rounds with this leader here yet.</p>}
            {data.opponents.slice(0, expanded ? undefined : 5).map((o) => (
              <div key={o.leaderId} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge className={`shrink-0 ${verdictStyle[o.verdict]}`}>{verdictLabel[o.verdict]}</Badge>
                  {/* Wraps rather than truncating, for the same reason as the
                      opponent list: two Luffys both cut to "Monkey D…" are two
                      rows the reader cannot tell apart. */}
                  <span className="min-w-0 break-words">{o.name}</span>
                </span>
                <CountsLine c={o} />
              </div>
            ))}
            {data.opponents.length > 5 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex min-h-11 w-full items-center justify-center rounded-lg border border-dashed text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                {expanded ? 'Show fewer' : `Show all ${data.opponents.length}`}
              </button>
            )}
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
