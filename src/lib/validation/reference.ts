import { z } from 'zod';

export const customLeaderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  colors: z.array(z.string().trim().min(1)).max(5).default([]),
  setCode: z.string().trim().max(20).nullable().optional(),
});

export const customMetaSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CustomLeaderInput = z.infer<typeof customLeaderSchema>;
export type CustomMetaInput = z.infer<typeof customMetaSchema>;
