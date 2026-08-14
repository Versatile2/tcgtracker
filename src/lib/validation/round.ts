import { z } from 'zod';
import type { GameLog } from '@/lib/dto';

export const resultEnum = z.enum(['win', 'loss', 'draw']);
export const playOrderEnum = z.enum(['first', 'second']);
export const gameResultEnum = z.enum(['win', 'loss']);
export const roundKindEnum = z.enum(['swiss', 'top_cut', 'bye', 'no_show']);

export const gameLogSchema = z.object({
  result: gameResultEnum,
  playOrder: playOrderEnum.nullable().optional(),
});

const notes = z.string().trim().max(2000).nullable().optional();

// Client-generated so a round logged offline has a stable identity before the
// server ever sees it, which also makes replaying a queued create idempotent.
// Omitted by non-offline callers; the database defaults it.
const clientId = z.uuid().optional();

/** A complete best-of-3: one side reaches exactly 2 game wins (2–0 or 2–1). */
export function isCompletedBo3(games: { result: 'win' | 'loss' }[]): boolean {
  const wins = games.filter((g) => g.result === 'win').length;
  const losses = games.length - wins;
  const max = Math.max(wins, losses);
  const min = Math.min(wins, losses);
  if (max !== 2 || min >= 2) return false;
  return (games.length === 2 && min === 0) || (games.length === 3 && min === 1);
}

/** Derive the match result of a completed best-of-3 (first to 2 game wins). */
export function matchResultFromGames(games: { result: 'win' | 'loss' }[]): 'win' | 'loss' {
  return games.filter((g) => g.result === 'win').length >= 2 ? 'win' : 'loss';
}

const swissRound = z.object({
  id: clientId,
  kind: z.literal('swiss'),
  opponentLeaderId: z.uuid(),
  opponentMetaId: z.uuid().nullable().optional(),
  result: resultEnum,
  playOrder: playOrderEnum.nullable().optional(),
  wonDieRoll: z.boolean().nullable().optional(),
  // Set only on a freeplay round, where the leader changes per round instead
  // of being fixed on the tournament. The service enforces which is required.
  myLeaderId: z.uuid().nullable().optional(),
  notes,
});

const topCutRound = z.object({
  id: clientId,
  kind: z.literal('top_cut'),
  opponentLeaderId: z.uuid(),
  opponentMetaId: z.uuid().nullable().optional(),
  games: z.array(gameLogSchema).min(2).max(3)
    .refine(isCompletedBo3, { message: 'Enter a complete best-of-3 (first to 2 games).' }),
  myLeaderId: z.uuid().nullable().optional(),
  notes,
});

const byeRound = z.object({ id: clientId, kind: z.literal('bye'), notes });
const noShowRound = z.object({ id: clientId, kind: z.literal('no_show'), notes });

export const createRoundSchema = z.discriminatedUnion('kind', [swissRound, topCutRound, byeRound, noShowRound]);
// The form always resubmits a complete payload, so updates reuse the same shape.
export const updateRoundSchema = createRoundSchema;

export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type UpdateRoundInput = z.infer<typeof updateRoundSchema>;
export type GameLogInput = z.infer<typeof gameLogSchema> & GameLog;
