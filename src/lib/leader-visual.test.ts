import { describe, it, expect } from 'vitest';
import { leaderBackground, leaderTextColor, LEADER_COLOR_HEX } from './leader-visual';

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
