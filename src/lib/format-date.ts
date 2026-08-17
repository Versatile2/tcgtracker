const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Render a stored `YYYY-MM-DD` as `9 Aug 2026`.
 *
 * Deliberately does NOT use `toLocaleDateString` or the `Date` constructor. The
 * server and the browser can resolve different locales and time zones, which
 * would produce different strings for the same row — the exact hydration
 * mismatch this codebase just removed from the provider tree. Reading the ISO
 * parts is deterministic everywhere.
 *
 * Anything that is not a `YYYY-MM-DD` string is returned unchanged, so a bad
 * value degrades to showing the raw data rather than throwing during a render.
 */
export function formatPlayedOn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, year, month, day] = m;
  const name = MONTHS[Number(month) - 1];
  if (!name) return iso;
  return `${Number(day)} ${name} ${year}`;
}
