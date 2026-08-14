import { z } from 'zod';

export const tournamentTypeEnum = z.enum([
  'local',
  'treasure_cup',
  'regionals',
  'extra_grand_battle',
  'pirates_party',
  'testing',
  'freeplay',
]);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const createTournamentSchema = z.object({
  // Client-generated so an offline create can be referenced by its rounds
  // immediately. Omitted by non-offline callers; the database defaults it.
  id: z.uuid().optional(),
  type: tournamentTypeEnum,
  // Required for every type except freeplay, which records the leader per
  // round instead and has none of its own. Enforced below.
  myLeaderId: z.uuid().optional(),
  metaId: z.uuid().optional(),
  name: z.string().trim().max(120).optional(),
  playedOn: dateString,
}).superRefine((v, ctx) => {
  if (v.type === 'freeplay' && v.myLeaderId !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['myLeaderId'], message: 'A freeplay session has no leader of its own.' });
  }
  if (v.type !== 'freeplay' && v.myLeaderId === undefined) {
    ctx.addIssue({ code: 'custom', path: ['myLeaderId'], message: 'Choose your leader.' });
  }
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
