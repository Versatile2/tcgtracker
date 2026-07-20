import { z } from 'zod';

export const customLeaderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  colors: z.array(z.string().trim().min(1)).max(5).default([]),
});

export const customSetSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CustomLeaderInput = z.infer<typeof customLeaderSchema>;
export type CustomSetInput = z.infer<typeof customSetSchema>;
