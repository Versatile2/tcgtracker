import { describe, it, expect } from 'vitest';
import { pickDefaultMetaId } from './meta-selection';

const meta = (id: string, code: string | null, releasedAt: string | null, isCustom = false) =>
  ({ id, code, releasedAt, isCustom });

describe('pickDefaultMetaId', () => {
  it('picks the most recently released official meta', () => {
    const picked = pickDefaultMetaId([
      meta('a', 'OP15', '2025-06-01'),
      meta('b', 'OP16', '2025-11-01'),
      meta('c', 'OP14', '2025-02-01'),
    ]);
    expect(picked).toBe('b');
  });

  it('ignores metas with no release date once any meta has one', () => {
    // Comparing a date against a code has no meaning, so a dateless meta simply
    // cannot be the default while dated ones exist.
    const picked = pickDefaultMetaId([
      meta('a', 'OP16', null),
      meta('b', 'OP15', '2025-06-01'),
    ]);
    expect(picked).toBe('b');
  });

  it('falls back to the lexically highest code when no meta has a date', () => {
    const picked = pickDefaultMetaId([
      meta('a', 'OP15', null),
      meta('b', 'OP16', null),
    ]);
    expect(picked).toBe('b');
  });

  it('excludes custom metas from both rules', () => {
    // A custom meta named "Zoro locals" outranking OP16 would silently become
    // everyone's default.
    const picked = pickDefaultMetaId([
      meta('a', 'OP16', '2025-11-01'),
      meta('b', null, '2026-01-01', true),
    ]);
    expect(picked).toBe('a');
  });

  it('returns null when there is no official meta', () => {
    expect(pickDefaultMetaId([meta('b', null, null, true)])).toBeNull();
  });
});
