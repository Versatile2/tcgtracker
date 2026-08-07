'use client';
import { useSyncExternalStore } from 'react';

// Connectivity is an external store, so it is modelled as one: a module-level
// snapshot kept up to date by the window events, read through
// useSyncExternalStore. Reading navigator.onLine directly inside getSnapshot
// would not work — some environments (and jsdom) fire the events without
// updating the flag.
let online = true;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (online === next) return;
  online = next;
  for (const notify of listeners) notify();
}

const goOnline = () => set(true);
const goOffline = () => set(false);

function subscribe(notify: () => void): () => void {
  if (listeners.size === 0) {
    online = navigator.onLine;
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
  }
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    }
  };
}

const getSnapshot = () => online;
const getServerSnapshot = () => true;

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Connectivity check for non-React callers (the outbox flusher). */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
