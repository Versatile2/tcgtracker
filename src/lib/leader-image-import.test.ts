import { describe, it, expect } from 'vitest';
import { labelForPrinting, imagePathForPrinting } from './leader-image-import';

describe('labelForPrinting', () => {
  it('calls the printing that equals the set code the base', () => {
    expect(labelForPrinting('OP06-022', 'OP06-022')).toBe('Base');
  });

  it('uses the bare suffix for every other printing', () => {
    // An honest, ugly label beats an invented one: nothing in the data says
    // whether _p1 is a Parallel or an Alternate Art, and the admin page in
    // stage 2 is where these get real names.
    expect(labelForPrinting('OP06-022', 'OP06-022_p1')).toBe('p1');
    expect(labelForPrinting('EB02-010', 'EB02-010_pr1')).toBe('pr1');
  });

  it('falls back to the whole printing id when it does not start with the set code', () => {
    expect(labelForPrinting('OP06-022', 'P-071')).toBe('P-071');
  });
});

describe('imagePathForPrinting', () => {
  it('reads a clean scan from the clean folder', () => {
    expect(imagePathForPrinting('OP01-001', true)).toBe('public/leaders/clean/OP01-001.webp');
  });

  it('reads everything else from the generated bundle', () => {
    expect(imagePathForPrinting('OP01-001_p1', false)).toBe('public/leaders/OP01-001_p1.webp');
  });
});
