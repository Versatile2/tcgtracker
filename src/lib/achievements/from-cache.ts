import { CASUAL_TYPES } from '../tournament-kinds';
import { computeCtx, type Ctx, type RoundRow, type TourneyRow } from './definitions';
import type { LeaderDTO, TournamentSummaryDTO } from '../dto';

/**
 * Build the same `Ctx` the server builds, from what the client already has.
 *
 * This is the whole reason an achievement can fire the instant a round is
 * logged, offline: the tournament list carries every field the rules need, and
 * the leader catalog supplies the opponent colours the server gets from a join.
 *
 * It must agree with `getAchievements`'s query exactly — including which
 * tournaments are in scope — so `achievements.parity.test.ts` holds the two to
 * the same answer on the same fixture.
 */
export function ctxFromCache(tournaments: TournamentSummaryDTO[], leaders: LeaderDTO[]): Ctx {
  const colorsOf = new Map(leaders.map((l) => [l.id, l.colors]));
  // Casual games are excluded here exactly as the server excludes them: they
  // are not part of the competitive record that achievements measure.
  const competitive = tournaments.filter((t) => !CASUAL_TYPES.includes(t.type));

  const roundRows: RoundRow[] = [];
  for (const t of competitive) {
    // The server's query inner-joins the opponent leader, so a round with no
    // opponent — a bye or a no-show — never reaches the rules. Byes are not
    // games and must not count toward a win rate.
    for (const m of t.matches) {
      if (!m.opponentLeaderId || !t.myLeaderId) continue;
      roundRows.push({
        tournamentId: t.id,
        metaId: t.metaId,
        myLeaderId: t.myLeaderId,
        result: m.result,
        playOrder: m.playOrder,
        opponentColors: colorsOf.get(m.opponentLeaderId) ?? [],
      });
    }
  }

  const tourneyRows: TourneyRow[] = competitive.map((t) => ({
    id: t.id,
    metaId: t.metaId,
    playedOn: t.playedOn,
    // The list is already ordered by playedOn then createdAt, and createdAt is
    // not in the DTO; index preserves that order as the tiebreaker the streak
    // sort needs. Reversed because the list arrives newest-first.
    createdAt: new Date(0),
  }));
  const oldestFirst = [...tourneyRows].reverse();
  oldestFirst.forEach((t, i) => { t.createdAt = new Date(i); });

  return computeCtx(roundRows, tourneyRows);
}
