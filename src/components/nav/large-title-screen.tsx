'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * iOS "large title" screen (Apple Music style): the big inline title scrolls
 * away under a translucent bar, and a small centered title + hairline border
 * fade in once you've scrolled past it. An optional `action` sits top-right in
 * the bar (always visible, like Apple's list-screen actions).
 */
export function LargeTitleScreen({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const header = headerRef.current;
    if (!sentinel || !header) return;
    const io = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      // Collapse exactly when the large title has slid under the bar.
      { rootMargin: `-${header.offsetHeight}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          'sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] transition-colors duration-200',
          collapsed
            ? 'glass-bar border-border/60'
            : 'border-transparent',
        )}
      >
        <div className="mx-auto flex h-11 max-w-xl items-center justify-between gap-2 px-4">
          <h2
            className={cn(
              'min-w-0 flex-1 truncate text-center text-[0.9375rem] font-semibold transition-opacity duration-200',
              collapsed ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </h2>
          {action ? (
            <div className="absolute right-4 shrink-0">{action}</div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-6">
        <h1 className="pt-1 text-3xl font-bold tracking-tight">{title}</h1>
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        {children}
      </main>
    </>
  );
}
