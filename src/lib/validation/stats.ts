import { z } from 'zod';
export const matchupQuerySchema = z.object({ leaderId: z.string().uuid() });
export type MatchupQuery = z.infer<typeof matchupQuerySchema>;
