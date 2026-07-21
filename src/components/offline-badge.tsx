'use client';
import { useOnlineStatus } from '@/lib/use-online-status';

export function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-black shadow"
    >
      Offline — changes can’t be saved
    </div>
  );
}
