import { describe, it, expect } from 'vitest';
import { leaderBackground, leaderTextColor, getLeaderImage, LEADER_COLOR_HEX } from './leader-visual';
import { CLEAN_ART, EXTRA_ART } from './clean-art';
import { printingsOf, mergePrintings } from './printings';
import { LEADER_ART } from './leader-images';

/*
 * Leaders carried at most two colours until the promo feed arrived. The Release
 * Event leaders carry all six, and the old implementation read only the first
 * two — so these pin the shape of every arity rather than just the new one.
 */
describe('leaderBackground', () => {
  it('is a flat colour for a mono-colour leader', () => {
    expect(leaderBackground(['red'])).toBe(LEADER_COLOR_HEX.red);
  });

  it('keeps the established soft seam for a dual-colour leader', () => {
    // 130-odd leaders already look like this; changing it would be a redesign
    // smuggled in behind a data update.
    expect(leaderBackground(['purple', 'red']))
      .toBe(`linear-gradient(135deg, ${LEADER_COLOR_HEX.purple} 0%, ${LEADER_COLOR_HEX.purple} 46%, ${LEADER_COLOR_HEX.red} 54%, ${LEADER_COLOR_HEX.red} 100%)`);
  });

  it('shows every colour of a six-colour leader', () => {
    const bg = leaderBackground(['blue', 'green', 'purple', 'red', 'black', 'yellow']);
    for (const [name, hex] of Object.entries(LEADER_COLOR_HEX)) {
      expect([name, bg.includes(hex)]).toEqual([name, true]);
    }
  });

  it('splits six colours into six equal bands', () => {
    const bg = leaderBackground(['blue', 'green', 'purple', 'red', 'black', 'yellow']);
    // Two stops per colour — the band's start and end — which is what makes the
    // edges hard instead of blending six colours into brown.
    expect(bg.match(/#[0-9a-f]{6}/gi)).toHaveLength(12);
    expect(bg).toContain('16.67%');
    expect(bg).toContain('100.00%');
  });

  it('falls back to neutral when a leader has no colours at all', () => {
    expect(leaderBackground([])).toBe(leaderBackground(undefined));
  });

  it('does not crash on a colour it does not know', () => {
    expect(leaderBackground(['chartreuse'])).toBeTruthy();
  });

  it('keeps dark text only where yellow leads', () => {
    expect(leaderTextColor(['yellow'])).toBe('#1c1917');
    expect(leaderTextColor(['blue', 'green', 'purple', 'red', 'black', 'yellow'])).toBe('#ffffff');
  });
});

/*
 * Clean art is layered over the generated bundle rather than replacing it: only
 * some printings were collected by hand, so the two folders coexist and the
 * choice is made per printing.
 */
describe('getLeaderImage', () => {
  const cleanPrinting = [...CLEAN_ART][0];
  const watermarked = Object.values(LEADER_ART).flat().find((p) => !CLEAN_ART.has(p));

  it('serves the clean scan when one was collected', () => {
    const code = Object.keys(LEADER_ART).find((c) => LEADER_ART[c].includes(cleanPrinting))!;
    expect(getLeaderImage(code, cleanPrinting)).toBe(`/leaders/clean/${cleanPrinting}.webp`);
  });

  it('falls back to the generated one where none was', () => {
    const code = Object.keys(LEADER_ART).find((c) => LEADER_ART[c].includes(watermarked!))!;
    expect(getLeaderImage(code, watermarked)).toBe(`/leaders/${watermarked}.webp`);
  });

  it('decides per printing, not per card', () => {
    // A leader can have a clean base and a watermarked Parallel; picking one
    // folder for the whole card would either hide or break one of them.
    const mixed = Object.entries(LEADER_ART).find(([, ps]) =>
      ps.some((p) => CLEAN_ART.has(p)) && ps.some((p) => !CLEAN_ART.has(p)));
    if (!mixed) return; // nothing mixed today; the rule still holds
    const [code, ps] = mixed;
    const clean = ps.find((p) => CLEAN_ART.has(p))!;
    const dirty = ps.find((p) => !CLEAN_ART.has(p))!;
    expect([getLeaderImage(code, clean), getLeaderImage(code, dirty)])
      .toEqual([`/leaders/clean/${clean}.webp`, `/leaders/${dirty}.webp`]);
  });

  it('still returns null for a leader with no card at all', () => {
    expect(getLeaderImage('P-700')).toBeNull();
    expect(getLeaderImage(null)).toBeNull();
  });

  it('ignores a printing preference that is not this card\u2019s', () => {
    const code = Object.keys(LEADER_ART).find((c) => LEADER_ART[c].length > 0)!;
    expect(getLeaderImage(code, 'OP99-999_p9')).toContain(LEADER_ART[code][0]);
  });
});

/*
 * The collection can list printings optcgapi does not — it is a shelf of real
 * cards, the API is one vendor's index of them. Whether it currently does is a
 * fact about today's folder, so the merge is tested as a function and the wiring
 * is tested against whatever the folder holds.
 */
describe('merging collected printings with bundled ones', () => {
  it('appends extras after the bundled printings', () => {
    expect(mergePrintings(['A', 'A_p1'], ['A_c3'])).toEqual(['A', 'A_p1', 'A_c3']);
  });

  it('keeps the base printing first, so no fallback changes', () => {
    // getLeaderImage falls back to printings[0]; an extra jumping the queue
    // would silently change the art shown to everyone who chose nothing.
    expect(mergePrintings(['A', 'A_p1'], ['A_c3'])[0]).toBe('A');
  });

  it('returns the bundled list untouched when there are no extras', () => {
    const bundled = ['A', 'A_p1'];
    expect(mergePrintings(bundled, [])).toBe(bundled);
  });

  it('matches what the app actually resolves today', () => {
    const code = Object.keys(LEADER_ART)[0];
    expect(printingsOf(code)).toEqual(mergePrintings(LEADER_ART[code], EXTRA_ART[code] ?? []));
  });

  it('gives every extra a suffix optcgapi does not use, so nothing can collide', () => {
    for (const [c, ids] of Object.entries(EXTRA_ART)) {
      for (const id of ids) {
        expect([id, /_c\d+$/.test(id)]).toEqual([id, true]);
        expect([id, LEADER_ART[c].includes(id)]).toEqual([id, false]);
      }
    }
  });
});
