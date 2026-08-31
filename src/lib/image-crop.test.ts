import { describe, it, expect } from 'vitest';
import { coverScale, clampOffset, sourceRect } from './image-crop';

const FRAME = { w: 240, h: 336 };

describe('coverScale', () => {
  it('scales a wide image to cover the frame by height', () => {
    expect(coverScale({ w: 1000, h: 500 }, FRAME)).toBeCloseTo(336 / 500);
  });

  it('scales a tall image to cover the frame by width', () => {
    expect(coverScale({ w: 500, h: 1000 }, FRAME)).toBeCloseTo(240 / 500);
  });
});

describe('clampOffset', () => {
  it('pins a frame-sized image to the centre', () => {
    // At zoom 1 a covering image has no slack on at least one axis.
    expect(clampOffset({ x: 50, y: 50 }, { w: 240, h: 336 }, FRAME)).toEqual({ x: 0, y: 0 });
  });

  it('allows sliding within the overflow and no further', () => {
    const clamped = clampOffset({ x: 999, y: -999 }, { w: 340, h: 436 }, FRAME);
    expect(clamped).toEqual({ x: 50, y: -50 });
  });
});

describe('sourceRect', () => {
  it('takes the whole image when it matches the frame exactly', () => {
    const rect = sourceRect(
      { w: 240, h: 336 },
      FRAME,
      { zoom: 1, offset: { x: 0, y: 0 } },
    );
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 240, sh: 336 });
  });

  it('takes a centred window from an oversized image', () => {
    // 480x672 covers at scale 1, so the source window is the whole image.
    const rect = sourceRect({ w: 480, h: 672 }, FRAME, { zoom: 1, offset: { x: 0, y: 0 } });
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 480, sh: 672 });
  });

  it('halves the window when zoomed to 2x', () => {
    const rect = sourceRect({ w: 240, h: 336 }, FRAME, { zoom: 2, offset: { x: 0, y: 0 } });
    expect(rect.sw).toBeCloseTo(120);
    expect(rect.sh).toBeCloseTo(168);
    expect(rect.sx).toBeCloseTo(60);
    expect(rect.sy).toBeCloseTo(84);
  });

  it('moves the window opposite to the drag', () => {
    // Dragging the image right shows what was to its left.
    const rect = sourceRect({ w: 240, h: 336 }, FRAME, { zoom: 2, offset: { x: 60, y: 0 } });
    expect(rect.sx).toBeCloseTo(30);
  });
});
