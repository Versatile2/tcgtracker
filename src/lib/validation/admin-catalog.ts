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
