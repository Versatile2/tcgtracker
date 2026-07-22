import { z } from 'zod';

export const resultEnum = z.enum(['win', 'loss', 'draw']);
export const playOrderEnum = z.enum(['first', 'second']);

export const createRoundSchema = z.object({
  opponentLeaderId: z.string().uuid(),
  opponentMetaId: z.string().uuid().nullable().optional(),
  result: resultEnum,
  playOrder: playOrderEnum.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateRoundSchema = z.object({
  opponentLeaderId: z.string().uuid().optional(),
  opponentMetaId: z.string().uuid().nullable().optional(),
  result: resultEnum.optional(),
  playOrder: playOrderEnum.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type UpdateRoundInput = z.infer<typeof updateRoundSchema>;
