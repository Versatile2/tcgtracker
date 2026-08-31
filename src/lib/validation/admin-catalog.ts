import { z } from 'zod';

/**
 * A bulk status change. The 500 cap is not a guess at a limit: the grid's
 * "select all" applies to the current filter, and the whole catalog is ~300
 * rows, so anything larger is a client bug rather than a real selection.
 */
export const bulkStatusSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  status: z.enum(['draft', 'published', 'hidden']),
});

export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;

/** The six OPTCG colours. A seventh would break every avatar gradient and colour band. */
const COLORS = ['red', 'green', 'blue', 'purple', 'black', 'yellow'] as const;

export const leaderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  colors: z.array(z.enum(COLORS)).max(6),
  setCode: z.string().trim().min(1).max(20).nullable(),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10),
  deckCodes: z.array(z.string().trim().min(1).max(10)).max(10),
  status: z.enum(['draft', 'published', 'hidden']),
});

export const metaInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20).nullable(),
  /** ISO date, the format Postgres `date` round-trips through JSON. */
  releasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(['draft', 'published', 'hidden']),
});

export type LeaderInput = z.infer<typeof leaderInputSchema>;
export type MetaInput = z.infer<typeof metaInputSchema>;
