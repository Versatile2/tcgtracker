import { z } from 'zod';

export const tournamentTypeEnum = z.enum([
  'local',
  'treasure_cup',
  'regionals',
  'extra_grand_battle',
  'pirates_party',
  'testing',
]);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const createTournamentSchema = z.object({
  type: tournamentTypeEnum,
  setId: z.string().uuid().optional(),
  name: z.string().trim().max(120).optional(),
  playedOn: dateString,
});

export const updateTournamentSchema = z.object({
  type: tournamentTypeEnum.optional(),
  setId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  playedOn: dateString.optional(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
