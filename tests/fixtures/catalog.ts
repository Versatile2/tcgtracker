import type { SeedLeader, SeedMeta } from '../../src/db/seed';

/**
 * A small catalog for tests.
 *
 * Small on purpose. Tests that need "a leader" should not depend on the real
 * 300-row catalog: the assertions get slower, and any of them that accidentally
 * depend on real data break when a set releases.
 *
 * It is eleven rows rather than five because the suite resolves leaders by name —
 * `leaderId('Nami')` and friends — so every name a test looks up has to exist
 * here. The values are the real ones, copied from the generated catalog this
 * fixture replaced.
 */
export const FIXTURE_LEADERS: SeedLeader[] = [
  { name: 'Roronoa Zoro', colors: ['red'], setCode: 'OP01-001' },
  { name: 'Trafalgar Law', colors: ['green', 'red'], setCode: 'OP01-002' },
  { name: 'Monkey D. Luffy', colors: ['green', 'red'], setCode: 'OP01-003' },
  { name: 'Donquixote Doflamingo', colors: ['blue'], setCode: 'OP01-060' },
  { name: 'Kaido', colors: ['blue', 'purple'], setCode: 'OP01-061' },
  { name: 'Edward Newgate', colors: ['red'], setCode: 'OP02-001' },
  { name: 'Sanji', colors: ['blue', 'green'], setCode: 'OP02-026' },
  { name: 'Nami', colors: ['blue'], setCode: 'OP03-040' },
  { name: 'Enel', colors: ['yellow'], setCode: 'OP05-098' },
  { name: 'Yamato', colors: ['green', 'yellow'], setCode: 'OP06-022' },
  { name: 'Shanks', colors: ['red'], setCode: 'OP09-001' },
];

export const FIXTURE_METAS: SeedMeta[] = [
  { name: 'OP01 Romance Dawn', code: 'OP01' },
  { name: 'OP02 Paramount War', code: 'OP02' },
  { name: 'OP06 Wings of the Captain', code: 'OP06' },
];

export const FIXTURE_CATALOG = { leaders: FIXTURE_LEADERS, metas: FIXTURE_METAS };
