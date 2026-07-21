'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_ACCENT, isValidAccent, type AccentKey } from '@/lib/accents';

const STORAGE_KEY = 'crewstat-accent';
type AccentContextValue = { accent: AccentKey; setAccent: (a: AccentKey) => void };
const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidAccent(stored)) setAccentState(stored);
  }, []);

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
