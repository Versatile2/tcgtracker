export const ACCENTS = [
  { key: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { key: 'green', name: 'Zoro Green', color: '#16a34a' },
  { key: 'red', name: 'Law Red', color: '#dc2626' },
  { key: 'purple', name: 'Robin Purple', color: '#7c3aed' },
  { key: 'blue', name: 'Nami Blue', color: '#2563eb' },
  { key: 'slate', name: 'Kaido Slate', color: '#475569' },
] as const;

export type AccentKey = (typeof ACCENTS)[number]['key'];
export const DEFAULT_ACCENT: AccentKey = 'indigo';

export function isValidAccent(key: string): key is AccentKey {
  return ACCENTS.some((a) => a.key === key);
}
