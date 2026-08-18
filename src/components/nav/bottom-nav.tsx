'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trophy, BarChart3, Medal, Settings, Plus, Swords, Shuffle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type Tab = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const TABS: Tab[] = [
  { href: '/', label: 'Tournaments', icon: Trophy, match: (p) => p === '/' || p.startsWith('/tournaments') },
  { href: '/stats', label: 'Stats', icon: BarChart3, match: (p) => p.startsWith('/stats') },
  // Achievements live inside Profile now: they are identity, not a separate
  // destination, and the bar stays at four items rather than five.
  { href: '/profile', label: 'Profile', icon: Medal, match: (p) => p.startsWith('/profile') || p.startsWith('/achievements') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
];

/** What the centre button can start. Order is by how often it is reached for. */
const LOGGABLE = [
  { href: '/tournaments/new', icon: Trophy, label: 'New Tournament', hint: 'An event you play several rounds of' },
  { href: '/freeplay/new', icon: Shuffle, label: 'New Freeplay', hint: 'Several games, changing deck as you go' },
  { href: '/matches/new', icon: Swords, label: 'New Match', hint: 'A single game, on its own' },
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const [choosing, setChoosing] = useState(false);
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return null;

  // The prominent center action ("+") sits between Stats and Achievements.
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav
      aria-label="Primary"
      className="glass-bar fixed inset-x-0 bottom-0 z-40 border-t border-border/60 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex h-[3.25rem] max-w-xl items-stretch">
        {left.map((t) => <TabLink key={t.href} tab={t} active={t.match(pathname)} />)}

        <div className="flex flex-1 items-center justify-center">
          {/* Asks rather than assuming: this button is reachable from Stats and
              Achievements too, where there is no list segment to follow. */}
          <button
            type="button"
            onClick={() => setChoosing(true)}
            aria-label="Log a game"
            aria-haspopup="dialog"
            className="flex size-11 -translate-y-1.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </button>
        </div>

        {right.map((t) => <TabLink key={t.href} tab={t} active={t.match(pathname)} />)}
      </div>

      <Sheet open={choosing} onOpenChange={setChoosing}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <div className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <SheetHeader><SheetTitle className="text-2xl font-bold">Log a game</SheetTitle></SheetHeader>
          <div className="space-y-2 px-4 pt-2 pb-6">
            {LOGGABLE.map(({ href, icon: Icon, label, hint }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setChoosing(false)}
                className="flex items-center gap-3 rounded-xl border border-border/70 p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-6" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
      <span className="max-w-full truncate px-0.5">{tab.label}</span>
    </Link>
  );
}
