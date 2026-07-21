export function newlyUnlocked(currentUnlockedKeys: string[], seenKeys: string[]): string[] {
  const seen = new Set(seenKeys);
  return currentUnlockedKeys.filter((k) => !seen.has(k));
}
