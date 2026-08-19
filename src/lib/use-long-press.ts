'use client';
import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

/** iOS and Android both fire at roughly this; anything slower reads as broken. */
export const LONG_PRESS_MS = 500;

/** Past this, the finger is scrolling, not pressing. */
const MOVE_TOLERANCE = 8;

/**
 * Press and hold to open something.
 *
 * Built on the pointer idiom already in `swipe-row.tsx`: a movement threshold
 * decides intent, so **scrolling always wins** — a list that occasionally
 * swallows a scroll into a menu is worse than having no shortcut at all.
 *
 * Two things it must do that are easy to forget:
 *
 * 1. **Swallow the click.** A long-press on a card is followed by a real click
 *    event, and the card is a link; without suppression the menu opens and the
 *    app navigates away from it in the same gesture.
 * 2. **Beat the operating system.** Long-pressing an `<a>` opens iOS Safari's
 *    link preview and Android Chrome's context menu. The caller must also apply
 *    `touch-callout: none` and `user-select: none`; this hook handles the
 *    `contextmenu` half, which additionally gives right-click and the keyboard
 *    context-menu key the same result on desktop — the only non-pointer way in.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef({ x: 0, y: 0 });
  /** Whether this press already fired, so a release cannot re-trigger it. */
  const fired = useRef(false);
  const disarm = useRef<(() => void) | null>(null);

  /*
   * Swallow the click the finger makes when it finally lifts.
   *
   * Touch produces compatibility mouse events *after* touchend: mousedown,
   * mouseup, click. By then whatever the long-press opened is on screen, under
   * the finger — so that burst lands on the new surface and dismisses it. The
   * menu would appear while held and vanish the instant you let go.
   *
   * Guarding the card alone cannot fix this: the events land on the sheet, not
   * the card. So the guard is on the document, armed when the press fires and
   * released by the click it was waiting for. Time-based expiry would be wrong
   * — a three-second hold must still be protected — so the timeout is only a
   * backstop against a release that never comes.
   */
  const armReleaseGuard = useCallback(() => {
    if (typeof document === 'undefined') return;
    disarm.current?.();
    const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const onClick = (e: Event) => { swallow(e); release(); };
    const release = () => {
      document.removeEventListener('mousedown', swallow, true);
      document.removeEventListener('mouseup', swallow, true);
      document.removeEventListener('click', onClick, true);
      clearTimeout(backstop);
      disarm.current = null;
    };
    document.addEventListener('mousedown', swallow, true);
    document.addEventListener('mouseup', swallow, true);
    document.addEventListener('click', onClick, true);
    // Only a backstop against a release that never arrives; the click releases it.
    const backstop = setTimeout(release, 2000);
    disarm.current = release;
  }, []);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  // A press still pending when the card unmounts must not fire into a component
  // that no longer exists, and a guard must never outlive the gesture.
  useEffect(() => () => { cancel(); disarm.current?.(); }, [cancel]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    cancel();
    timer.current = setTimeout(() => {
      fired.current = true;
      armReleaseGuard();
      onLongPress();
    }, LONG_PRESS_MS);
  }, [enabled, onLongPress, cancel, armReleaseGuard]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!timer.current) return;
    const dx = Math.abs(e.clientX - origin.current.x);
    const dy = Math.abs(e.clientY - origin.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) cancel();
  }, [cancel]);

  const onPointerUp = useCallback(() => cancel(), [cancel]);

  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    cancel();
    fired.current = false;
    onLongPress();
  }, [enabled, onLongPress, cancel]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onContextMenu,
  };
}
