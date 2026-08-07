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
  // Client-generated so an offline create can be referenced by its rounds
  // immediately. Omitted by non-offline callers; the database defaults it.
  id: z.uuid().optional(),
  type: tournamentTypeEnum,
  myLeaderId: z.uuid(),
  metaId: z.uuid().optional(),
  name: z.string().trim().max(120).optional(),
  playedOn: dateString,
});

export const updateTournamentSchema = z.object({
  type: tournamentTypeEnum.optional(),
  myLeaderId: z.uuid().optional(),
  metaId: z.uuid().nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  playedOn: dateString.optional(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
