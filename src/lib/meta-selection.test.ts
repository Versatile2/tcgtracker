import { describe, it, expect } from 'vitest';
import { pickDefaultMetaId } from './meta-selection';

const official = (id: string, code: string) => ({ id, code, isCustom: false });
const custom = (id: string, name: string) => ({ id, code: null, isCustom: true, name });

describe('pickDefaultMetaId', () => {
  it('picks the highest set code', () => {
    const metas = [official('a', 'OP01'), official('p', 'OP16'), official('c', 'OP09')];
    expect(pickDefaultMetaId(metas)).toBe('p');
  });

  it('does not depend on the input order', () => {
    const metas = [official('p', 'OP16'), official('c', 'OP09'), official('a', 'OP01')];
    expect(pickDefaultMetaId(metas)).toBe('p');
  });

  it('never picks a custom meta, even one sorting above every set code', () => {
    // "Zoro locals" > "OP16" lexically — a naive max would select it.
    const metas = [official('p', 'OP16'), custom('z', 'Zoro locals')];
    expect(pickDefaultMetaId(metas)).toBe('p');
  });

  it('returns null when there is no official meta to pick', () => {
    expect(pickDefaultMetaId([])).toBe(null);
    expect(pickDefaultMetaId([custom('z', 'Zoro locals')])).toBe(null);
  });

  it('picks a newly seeded set automatically', () => {
    // No hardcoded set code: OP17 wins the day it is seeded.
    const metas = [official('p', 'OP16'), official('q', 'OP17')];
    expect(pickDefaultMetaId(metas)).toBe('q');
  });
});
