import { describe, it, expect } from 'vitest';
import { TYPE_ICONS, typeIcon } from './type-glyph';
import { SESSION_TYPES, TOURNAMENT_TYPES, MATCH_TYPE } from './tournament-kinds';

describe('type glyphs', () => {
  it('covers every type the app can offer', () => {
    // The Record already enforces this at compile time. Stated here for anyone
    // tempted to widen the type: a type without a glyph renders an empty slot.
    // toBeDefined, not toBeTypeOf('function'): lucide icons are forwardRef
    // objects, so a type check here would assert the wrong thing.
    for (const t of [...TOURNAMENT_TYPES, ...SESSION_TYPES, MATCH_TYPE]) {
      expect(typeIcon(t), `${t} has no glyph`).toBeDefined();
    }
  });

  it('gives ranked simulator one icon under both stored values', () => {
    // One label, one glyph, two stored values — the split is about which
    // segment the games were logged in, and it should not look like two things.
    expect(TYPE_ICONS.ranked_sim).toBe(TYPE_ICONS.session_sim);
  });

  it('keeps every other type visually distinct', () => {
    const icons = Object.entries(TYPE_ICONS).filter(([t]) => t !== 'session_sim').map(([, i]) => i);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
