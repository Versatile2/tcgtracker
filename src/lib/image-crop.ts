export type Size = { w: number; h: number };
export type Offset = { x: number; y: number };
export type View = { zoom: number; offset: Offset };

/**
 * The scale at which an image just covers the frame — the starting zoom.
 *
 * Cover, not contain: a card slot with letterboxing inside it looks broken, and
 * the owner is choosing which part of the art to keep anyway.
 */
export function coverScale(natural: Size, frame: Size): number {
  return Math.max(frame.w / natural.w, frame.h / natural.h);
}

/** The on-screen size of the image at a given zoom. */
export function displaySize(natural: Size, frame: Size, zoom: number): Size {
  const s = coverScale(natural, frame) * zoom;
  return { w: natural.w * s, h: natural.h * s };
}

/**
 * Keep the frame inside the image.
 *
 * Without this the owner can drag the artwork off the frame and export a band of
 * empty canvas, which is a worse failure than a bad crop because it looks like a
 * broken image rather than a choice.
 */
export function clampOffset(offset: Offset, display: Size, frame: Size): Offset {
  const maxX = Math.max(0, (display.w - frame.w) / 2);
  const maxY = Math.max(0, (display.h - frame.h) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/**
 * The rectangle of the source image that the frame is showing, in source pixels.
 *
 * This is what makes the exported crop equal the preview: the preview is a CSS
 * transform and the export is a drawImage, and they agree only because both are
 * derived from the same zoom and offset.
 */
export function sourceRect(natural: Size, frame: Size, view: View) {
  const scale = coverScale(natural, frame) * view.zoom;
  const display = { w: natural.w * scale, h: natural.h * scale };
  const { x, y } = clampOffset(view.offset, display, frame);
  return {
    sx: (display.w / 2 - frame.w / 2 - x) / scale,
    sy: (display.h / 2 - frame.h / 2 - y) / scale,
    sw: frame.w / scale,
    sh: frame.h / scale,
  };
}
