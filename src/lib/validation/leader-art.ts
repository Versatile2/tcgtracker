import { z } from 'zod';

/**
 * Shape only. Whether `art` is actually a printing of `setCode` is a question
 * about the bundled card data, not about the request, so the service answers it.
 */
export const leaderArtSchema = z.object({
  setCode: z.string().trim().min(1).max(20),
  art: z.string().trim().min(1).max(40),
});

export type LeaderArtInput = z.infer<typeof leaderArtSchema>;
