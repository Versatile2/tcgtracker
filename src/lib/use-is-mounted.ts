'use client';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during SSR and the hydration pass, true afterwards. Use it to defer
 * rendering anything that depends on client-only state (resolved theme,
 * localStorage) until hydration has matched the server HTML.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
