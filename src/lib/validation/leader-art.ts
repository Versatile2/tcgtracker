import { z } from 'zod';

/**
 * Shape only. Whether the image actually belongs to that leader is a question
 * about the catalog, not about the request, so the service answers it.
 */
export const leaderArtSchema = z.object({
  leaderId: z.string().uuid(),
  imageId: z.string().uuid(),
});

export type LeaderArtInput = z.infer<typeof leaderArtSchema>;
