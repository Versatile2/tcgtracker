/**
 * Pure helpers for the one-shot backfill in scripts/migrate-leader-images.ts.
 *
 * They live here rather than in the script so they can be tested without a
 * filesystem or a database, following tests/build-leader-data.test.ts.
 */

/**
 * The label a printing carries in the picker.
 *
 * The base printing is the one whose image id is the set code itself. Every
 * other one keeps its bare suffix ('p1', 'p2', 'pr1') rather than being guessed
 * at: the data does not say whether _p1 is a Parallel or an Alternate Art, and
 * a wrong name reads as fact where an ugly one reads as a placeholder.
 */
export function labelForPrinting(setCode: string, printing: string): string {
  if (printing === setCode) return 'Base';
  const prefix = `${setCode}_`;
  return printing.startsWith(prefix) ? printing.slice(prefix.length) : printing;
}

/** Repo-relative path to a printing's bundled file. */
export function imagePathForPrinting(printing: string, isClean: boolean): string {
  return isClean ? `public/leaders/clean/${printing}.webp` : `public/leaders/${printing}.webp`;
}
