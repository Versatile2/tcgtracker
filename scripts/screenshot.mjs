/**
 * Screenshot a signed-in page of the app, headlessly.
 *
 * This exists because the app sits behind a Clerk **dev** instance, which bounces
 * every non-browser client to /sign-in — so `curl` and plain headless runs cannot
 * see a single authenticated screen, and UI work was previously shipped on
 * reasoning alone.
 *
 * Why sign-in tokens rather than @clerk/testing: this instance answers a password
 * sign-in with `status: "needs_client_trust"`, and the testing token does not
 * clear that gate (its request interceptor also did not match this clerk-js
 * version — 0 of 27 FAPI calls carried the token). A Backend-API sign-in token
 * redeemed with the `ticket` strategy signs in cleanly and needs no password.
 *
 * Usage:
 *   npm run shot -- /tournaments/new shots/form.png
 *   npm run shot -- /stats shots/stats-dark.png --dark
 *
 * SAFETY: `npm run shot` starts nothing. Point a dev server at the TEST database
 * before using this, or anything the run creates lands in production Neon:
 *
 *   export DATABASE_URL="$(grep '^DATABASE_URL_TEST=' .env.local | cut -d= -f2- | tr -d '"')"
 *   npx next dev -p 3100
 *
 * Seed that database first with `npx tsx src/db/seed.ts` (same overridden env),
 * or the leader and meta pickers will be empty.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3100';
/** A dedicated throwaway account. Clerk treats +clerk_test addresses as test users. */
const EMAIL = process.env.SHOT_USER_EMAIL ?? 'impeccable+clerk_test@example.com';

const [route = '/', out = 'shot.png'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dark = process.argv.includes('--dark');
const full = !process.argv.includes('--viewport');

const clerkApi = (path, init) =>
  fetch('https://api.clerk.com/v1' + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json', ...init?.headers },
  });

async function testUserId() {
  const found = await (await clerkApi('/users?email_address=' + encodeURIComponent(EMAIL))).json();
  if (Array.isArray(found) && found.length) return found[0].id;
  const res = await clerkApi('/users', { method: 'POST', body: JSON.stringify({ email_address: [EMAIL] }) });
  const body = await res.json();
  if (!res.ok) throw new Error('could not create the test user: ' + JSON.stringify(body).slice(0, 300));
  return body.id;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: dark ? 'dark' : 'light',
});
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => problems.push(String(e).slice(0, 200)));

const res = await clerkApi('/sign_in_tokens', {
  method: 'POST',
  body: JSON.stringify({ user_id: await testUserId(), expires_in_seconds: 900 }),
});
const { token } = await res.json();

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.Clerk?.loaded, null, { timeout: 20_000 });
await page.evaluate(async (ticket) => {
  const si = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket });
  if (si.status === 'complete') await window.Clerk.setActive({ session: si.createdSessionId });
}, token);

await page.goto(BASE + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: out, fullPage: full });

console.log(`${out}  ←  ${page.url()}`);
if (problems.length) console.log('console errors:\n  ' + problems.slice(0, 5).join('\n  '));
if (page.url().includes('/sign-in')) {
  console.error('Still on the sign-in page — the token was refused. Check CLERK_SECRET_KEY.');
  process.exitCode = 1;
}

await browser.close();
