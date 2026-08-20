import { z } from 'zod';
import { isFreeplay } from '../tournament-kinds';

export const tournamentTypeEnum = z.enum([
  'local',
  'treasure_cup',
  'regionals',
  'extra_grand_battle',
  'pirates_party',
  // Deck testing. A freeplay-segment type: it records a leader per round, and
  // it has never belonged in the competitive record.
  'testing',
  // Ranked play on the simulator, logged as an event.
  'ranked_sim',
  'freeplay',
  // The same simulator games logged as a casual session instead.
  'freeplay_sim',
  'freeplay_sim_casual',
  'freeplay_friend',
  'freeplay_locals',
  'freeplay_gauntlet',
  'freeplay_teaching',
  'match',
]);


/**
 * Where you finished, and how big the field was.
 *
 * Both optional and independent. The field size is recorded when the event is
 * created — you know the turnout on the day — so that finishing asks for one
 * number instead of two. A placement with no field size is fine too: "2nd" is
 * worth recording even when the standings never reach you.
 *
 * The only impossible combination is finishing below last.
 */
const placement = z.number().int().min(1).max(9999).nullable().optional();
const fieldSize = z.number().int().min(1).max(9999).nullable().optional();

export function placementIssue(v: { placement?: number | null; fieldSize?: number | null }): string | null {
  if (v.placement != null && v.fieldSize != null && v.placement > v.fieldSize) {
    return 'You cannot finish below last.';
  }
  return null;
}

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
  notes: z.string().trim().max(2000).optional(),
  placement, fieldSize,
  playedOn: dateString,
}).superRefine((v, ctx) => {
  const bad = placementIssue(v);
  if (bad) ctx.addIssue({ code: 'custom', path: ['placement'], message: bad });
  if (isFreeplay(v.type) && v.myLeaderId !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['myLeaderId'], message: 'A freeplay session has no leader of its own.' });
  }
  if (!isFreeplay(v.type) && v.myLeaderId === undefined) {
    ctx.addIssue({ code: 'custom', path: ['myLeaderId'], message: 'Choose your leader.' });
  }
});

export const updateTournamentSchema = z.object({
  type: tournamentTypeEnum.optional(),
  myLeaderId: z.uuid().optional(),
  metaId: z.uuid().nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  placement, fieldSize,
  playedOn: dateString.optional(),
}).superRefine((v, ctx) => {
  const bad = placementIssue(v);
  if (bad) ctx.addIssue({ code: 'custom', path: ['placement'], message: bad });
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
