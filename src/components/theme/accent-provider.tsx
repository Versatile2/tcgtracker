'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_ACCENT, isValidAccent, type AccentKey } from '@/lib/accents';

const STORAGE_KEY = 'crewstat-accent';
type AccentContextValue = { accent: AccentKey; setAccent: (a: AccentKey) => void };
const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: React.ReactNode }) {
  // Lazily initialize from the `data-accent` attribute the FOUC inline
  // script (see layout.tsx) already set from localStorage before React
  // hydrates. This avoids a mount-time flash where the DEFAULT_ACCENT
  // would briefly clobber the user's stored preference.
  const [accent, setAccentState] = useState<AccentKey>(() => {
    if (typeof document !== 'undefined') {
      const a = document.documentElement.dataset.accent;
      if (a && isValidAccent(a)) return a;
    }
    return DEFAULT_ACCENT;
  });

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  const setAccent = (a: AccentKey) => {
    setAccentState(a);
    try { window.localStorage.setItem(STORAGE_KEY, a); } catch { /* ignore */ }
  };

  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within AccentProvider');
  return ctx;
}
