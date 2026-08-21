import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/*
 * Migration 0012 renamed the stored session types off `freeplay*`.
 *
 * A missed literal does not fail to compile. `TournamentType` is a union of
 * strings, so a stale `'freeplay'` in a comparison simply never matches, and the
 * row quietly stops counting toward whatever that branch guarded. This project
 * has already paid for that once: the four hand-written `<> 'freeplay'`
 * fragments that drifted apart are why `CASUAL_TYPES` exists.
 *
 * So the word is banned outright in `src/` — in code and in prose — except in
 * the files below, which mention it deliberately and say why. An allowlist
 * rather than a regex carve-out, because "which files may say this, and for
 * what reason" is the thing a reader actually needs to see.
 */

const SRC = resolve(__dirname, '..');
const RETIRED = /freeplay/i;

const ALLOWED: Record<string, string> = {
  'components/tournaments/segment.ts': 'the permanent ?tab=freeplay bookmark alias',
  'components/tournaments/segment.test.ts': 'covers that alias',
  'lib/outbox/storage.ts': 'TYPE_RENAMES, which repairs queues written before 0012',
  'lib/outbox/storage.test.ts': 'covers that migration',
  'lib/tournament-kinds.ts': 'records what the segment used to be called, and when',
  'app/providers.tsx': 'explains what the v3 cache buster is busting',
  'services/testing-migration.test.ts': 'reads migration 0011 by its filename, which is history and cannot be renamed',
  'lib/session-guard.test.ts': 'this file has to name the word to ban it',
};

/** The two that are load-bearing: delete either and stale data breaks silently. */
const MUST_KEEP = ['components/tournaments/segment.ts', 'lib/outbox/storage.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const rel = (file: string) => relative(SRC, file).split('\\').join('/');

describe('the retired freeplay spelling', () => {
  it('survives only where it is deliberately understood', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => RETIRED.test(readFileSync(file, 'utf8')))
      .map(rel)
      .filter((path) => !(path in ALLOWED));
    expect(offenders).toEqual([]);
  });

  it('still spells it in both places that must', () => {
    // A guard that passes because its exceptions were deleted is not a guard.
    for (const path of MUST_KEEP) {
      expect([path, RETIRED.test(readFileSync(join(SRC, path), 'utf8'))]).toEqual([path, true]);
    }
  });

  it('lists no allowance for a file that no longer needs one', () => {
    // Keeps the allowlist honest: an entry left behind after a cleanup reads as
    // permission the codebase no longer uses.
    const stale = Object.keys(ALLOWED).filter((path) => !RETIRED.test(readFileSync(join(SRC, path), 'utf8')));
    expect(stale).toEqual([]);
  });
});
