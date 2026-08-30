type Selectable = { id: string; code: string | null; isCustom: boolean; releasedAt: string | null };

/**
 * The meta a new tournament defaults to: the most recently released official set.
 *
 * `releasedAt` is filled in through the admin. Before it existed this compared
 * `code` lexically, which was correct only for `OP01`…`OP99`: an `ST`-coded meta
 * would have outranked `OP16`, and `"OP99" > "OP100"`. Release dates have none
 * of those edges.
 *
 * The fallback is all-or-nothing. If any official meta has a date, the default
 * comes from among those and dateless ones cannot win; only when none has a date
 * does the old lexical rule apply. Comparing a date against a code would mean
 * nothing, so the two rules never mix.
 *
 * Custom metas are excluded from both: they have no code, and one named "Zoro
 * locals" would otherwise silently become everyone's default.
 */
export function pickDefaultMetaId(metas: Selectable[]): string | null {
  const official = metas.filter((m) => !m.isCustom);
  if (official.length === 0) return null;

  const dated = official.filter((m): m is Selectable & { releasedAt: string } => m.releasedAt !== null);
  if (dated.length > 0) {
    return dated.reduce((best, m) => (m.releasedAt > best.releasedAt ? m : best)).id;
  }

  const coded = official.filter((m): m is Selectable & { code: string } => m.code !== null);
  if (coded.length === 0) return null;
  return coded.reduce((best, m) => (m.code > best.code ? m : best)).id;
}
