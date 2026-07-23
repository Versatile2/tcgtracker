'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trophy, BarChart3, Medal, Settings, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const TABS: Tab[] = [
  { href: '/', label: 'Tournaments', icon: Trophy, match: (p) => p === '/' || p.startsWith('/tournaments') },
  { href: '/stats', label: 'Stats', icon: BarChart3, match: (p) => p.startsWith('/stats') },
  { href: '/achievements', label: 'Achievements', icon: Medal, match: (p) => p.startsWith('/achievements') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return null;

  // The prominent center action ("+") sits between Stats and Achievements.
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/75 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex h-[3.25rem] max-w-xl items-stretch">
        {left.map((t) => <TabLink key={t.href} tab={t} active={t.match(pathname)} />)}

        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/tournaments/new"
            aria-label="Add tournament"
            className="flex size-11 -translate-y-1.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </Link>
        </div>

        {right.map((t) => <TabLink key={t.href} tab={t} active={t.match(pathname)} />)}
      </div>
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
        'flex flex-1 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium leading-none transition-colors',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-6" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
      <span className="max-w-full truncate px-0.5">{tab.label}</span>
    </Link>
  );
}
