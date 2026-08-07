/** Shared query keys, so cache readers and optimistic writers cannot drift. */
export const keys = {
  tournaments: ['tournaments'] as const,
  tournament: (id: string) => ['tournament', id] as const,
  leaders: ['leaders'] as const,
  metas: ['metas'] as const,
  stats: ['stats'] as const,
  matchups: (leaderId: string) => ['matchups', leaderId] as const,
  achievements: ['achievements'] as const,
};
