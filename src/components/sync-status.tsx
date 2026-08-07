'use client';
import { CloudOff, Loader2, Check, RefreshCw } from 'lucide-react';
import { useOutbox } from '@/lib/outbox/use-outbox';
import { cn } from '@/lib/utils';

type Pill = {
  label: string;
  icon: React.ReactNode;
  tone: string;
  /** Present when tapping should retry the queue. */
  retry?: boolean;
};

function describe({ online, pending, phase, stuck }: {
  online: boolean; pending: number; phase: 'idle' | 'syncing' | 'synced'; stuck: boolean;
}): Pill | null {
  if (phase === 'syncing') {
    return { label: 'Syncing…', icon: <Loader2 className="size-3.5 animate-spin" />, tone: 'bg-muted text-muted-foreground' };
  }
  if (phase === 'synced') {
    return { label: 'Synced', icon: <Check className="size-3.5" />, tone: 'bg-emerald-600 text-white' };
  }
  if (!online) {
    return pending > 0
      ? { label: `Offline · ${pending} unsynced`, icon: <CloudOff className="size-3.5" />, tone: 'bg-amber-500 text-black' }
      : { label: 'Offline', icon: <CloudOff className="size-3.5" />, tone: 'bg-muted text-muted-foreground' };
  }
  if (pending > 0) {
    return {
      label: stuck ? `${pending} unsynced — tap to retry` : `${pending} unsynced`,
      icon: <RefreshCw className="size-3.5" />,
      tone: 'bg-amber-500 text-black',
      retry: true,
    };
  }
  return null;
}

/**
 * One pill covering connectivity and the state of the write queue. Offline is
 * no longer a failure state — it just means work is waiting — so the badge has
 * to say how much is waiting, not only that the network is gone.
 */
export function SyncStatus() {
  const { online, pending, phase, stuck, flush } = useOutbox();
  const pill = describe({ online, pending, phase, stuck });
  if (!pill) return null;

  const base = cn(
    'fixed left-1/2 top-[calc(0.5rem+env(safe-area-inset-top))] z-50 -translate-x-1/2',
    'flex items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow',
    pill.tone
  );

  if (pill.retry) {
    return (
      <button type="button" onClick={() => void flush()} aria-live="polite" className={cn(base, 'min-h-11 px-4')}>
        {pill.icon}
        {pill.label}
      </button>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cn(base, 'py-1')}>
      {pill.icon}
      {pill.label}
    </div>
  );
}
