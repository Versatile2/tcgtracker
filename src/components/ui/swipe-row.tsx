'use client';
import { useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * iOS-style swipe-to-reveal row. The `children` slide left over an `actions`
 * panel pinned to the right; a tap on an open row (or on an action) closes it.
 * Vertical gestures still scroll the list (touch-action: pan-y).
 */
export function SwipeRow({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const g = useRef({ x: 0, y: 0, base: 0, decided: false, horiz: false });

  const width = () => actionsRef.current?.offsetWidth ?? 150;

  function onDown(e: PointerEvent<HTMLDivElement>) {
    g.current = { x: e.clientX, y: e.clientY, base: offset, decided: false, horiz: false };
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    const dx = e.clientX - g.current.x;
    const dy = e.clientY - g.current.y;
    if (!g.current.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      g.current.decided = true;
      g.current.horiz = Math.abs(dx) > Math.abs(dy);
      if (g.current.horiz) { setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId); }
    }
    if (!g.current.horiz) return;
    setOffset(Math.max(-width(), Math.min(0, g.current.base + dx)));
  }
  function onUp() {
    if (g.current.horiz) {
      setOffset((o) => (o < -width() / 2 ? -width() : 0));
    } else {
      setOffset((o) => (o !== 0 ? 0 : o)); // a tap on an open row closes it
    }
    setDragging(false);
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg', className)}>
      <div ref={actionsRef} className="absolute inset-y-0 right-0 flex items-stretch" onClick={() => setOffset(0)}>
        {actions}
      </div>
      <div
        className="relative"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform 0.22s ease', touchAction: 'pan-y' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {children}
      </div>
    </div>
  );
}
