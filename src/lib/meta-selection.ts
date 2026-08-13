type Selectable = { id: string; code: string | null; isCustom: boolean };

/**
 * The meta a new tournament defaults to: the newest official set.
 *
 * "Newest" is the highest `code` — codes are zero-padded (OP01…OP16), so a
 * lexical max is correct ordering and stays correct when OP17 is seeded.
 * `releasedAt` exists in the schema but is null for every row, so it cannot
 * be used here.
 *
 * Custom metas are excluded: they have no code, and one named "Zoro locals"
 * would otherwise outrank OP16 and silently become everyone's default.
 */
export function pickDefaultMetaId(metas: Selectable[]): string | null {
  const official = metas.filter((m): m is Selectable & { code: string } => !m.isCustom && m.code !== null);
  if (official.length === 0) return null;
  return official.reduce((best, m) => (m.code > best.code ? m : best)).id;
}
