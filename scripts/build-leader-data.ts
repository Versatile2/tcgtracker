/**
 * Regenerates the real OPTCG reference data from https://optcgapi.com.
 *
 *   npx tsx scripts/build-leader-data.ts
 *
 * Run this by hand when a new set drops — it is deliberately NOT part of
 * `next build`, so the app has no runtime dependency on optcgapi (their docs ask
 * callers not to hammer the API). Everything it produces is committed:
 *
 * Promo leaders come from a third endpoint (`allPromos`) alongside the booster
 * and starter-deck ones. Most promos are alternate printings of a card already
 * in a set — they share its card_set_id and fold in as extra art — but a handful
 * of `P-xxx` leaders exist only there, and were invisible until this pulled them.
 *
 *   src/db/seed-data.ts      leaders (name/colors/setCode) + metas
 *   src/lib/leader-images.ts every printing of every leader, keyed by set code
 *   public/leaders/*.webp    240px-wide card thumbnails, one per printing
 *
 * Note: every public source of OPTCG card art — optcgapi, Limitless, and
 * Bandai's own card list — serves the same SAMPLE-watermarked promotional
 * scans. There is no clean-art source, so the watermark is expected.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const API = 'https://optcgapi.com/api';
const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'public/leaders');
const IMAGE_WIDTH = 240;

/** The subset of an optcgapi card row this script relies on. */
export type ApiCard = {
  card_set_id: string;
  card_name: string;
  card_color: string;
  card_type: string;
  /** Null on a handful of rows, which have no art to bundle and are dropped. */
  card_image: string | null;
  card_image_id: string | null;
};
type ApiSet = { set_id: string; set_name: string };
type ApiDeck = { structure_deck_id: string; structure_deck_name: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Every printing of every leader, keyed by set code and ordered base-first.
 *
 * A leader is usually printed more than once — a base card, a Parallel or an
 * Alternate Art, sometimes an SPR. All of them share one card_set_id, so the
 * set code alone cannot tell them apart; what separates them is card_image_id
 * ("OP06-022", "OP06-022_p1", "OP06-022_p2"…), which is also the filename each
 * one is bundled under.
 *
 * The base printing — the one whose image id is the set code itself — must
 * lead, because LEADER_ART[code][0] is what the app draws for a player who has
 * expressed no preference. Everything else follows in image-id order, which
 * puts _p1 before _p2 and keeps the output stable between runs.
 *
 * Rows with no art are dropped (the API carries a few whose card_image_id is
 * null), as are repeats of an image id already taken.
 */
export function groupPrintings(cards: ApiCard[]): Map<string, ApiCard[]> {
  const byCode = new Map<string, ApiCard[]>();
  const taken = new Set<string>();
  for (const c of cards) {
    if (c.card_type !== 'Leader') continue;
    if (!c.card_image_id || !c.card_image) continue;
    if (taken.has(c.card_image_id)) continue;
    taken.add(c.card_image_id);
    const list = byCode.get(c.card_set_id) ?? [];
    list.push(c);
    byCode.set(c.card_set_id, list);
  }
  for (const [code, list] of byCode) {
    const isBase = (c: ApiCard) => (c.card_image_id === code ? 0 : 1);
    list.sort((a, b) => isBase(a) - isBase(b) || a.card_image_id!.localeCompare(b.card_image_id!));
  }
  return new Map([...byCode].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Leaders the API describes but has no art for, and which no other printing
 * rescues.
 *
 * `groupPrintings` drops art-less rows, which is right nearly always: they are
 * duplicate promo packagings of a card whose base printing carries the picture,
 * so nothing is lost. The exception is a card whose *every* row lacks art — drop
 * those and the leader vanishes from the app altogether, which is worse than
 * showing it without a picture. `P-700`, the six-colour Release Event Luffy
 * handed out at events, is exactly that case.
 *
 * These are seeded but get no LEADER_ART entry, so `LEADER_IMAGE_CODES` excludes
 * them and the picker falls back to its colour field — the same treatment a
 * custom leader gets. If Bandai publishes the scan later, the next run picks it
 * up and the card gains its art with no further change here.
 *
 * One row per set code, preferring the base printing so the name and colours
 * come from the card rather than from a packaging variant.
 */
export function leadersWithoutArt(cards: ApiCard[], printings: Map<string, ApiCard[]>): ApiCard[] {
  const found = new Map<string, ApiCard>();
  for (const c of cards) {
    if (c.card_type !== 'Leader') continue;
    if (printings.has(c.card_set_id)) continue;
    const existing = found.get(c.card_set_id);
    // The base printing's image id is the set code; prefer it when present, and
    // otherwise keep the first row so the output does not depend on input order.
    if (!existing || (existing.card_image_id !== c.card_set_id && c.card_image_id === c.card_set_id)) {
      found.set(c.card_set_id, c);
    }
  }
  return [...found.values()].sort((a, b) => a.card_set_id.localeCompare(b.card_set_id));
}

/**
 * Bandai's card_name carries a trailing disambiguator and packs initials against
 * the surrounding names. We show the set code separately, so strip the
 * disambiguator and unpack the dots:
 *   "Monkey.D.Luffy (003)"      → "Monkey D. Luffy"
 *   "Trafalgar Law - OP14-001"  → "Trafalgar Law"
 *   "Uta - P-011 (…-Uta-)"      → "Uta (…-Uta-)"
 *   "Eustass\"Captain\"Kid (099)" → "Eustass \"Captain\" Kid"
 *
 * The promo code needs its own rule and its own anchor: it is one letter, not
 * the two-to-four a set code has, and it can sit mid-name with the packaging
 * trailing it rather than at the end. The packaging itself stays — it is the
 * only thing telling three six-colour Luffys apart in a list.
 */
export function cleanLeaderName(raw: string): string {
  let n = raw
    .replace(/\s*\((?:\d+|SPR|Parallel|Alternate Art|[A-Z]{2,4}\d{2}-\d+)\)/g, '')
    .replace(/\s*-\s*[A-Z]{2,4}\d{2}-\d+\s*$/, '')
    .replace(/\s*-\s*P-\d+(?=\s|$)/, '')
    .trim();

  // A dot after a lone initial keeps it ("D." ); a dot after a full word is just
  // a missing space ("Edward.Newgate" → "Edward Newgate").
  if (n.includes('.')) {
    const parts = n.split('.');
    n = parts
      .map((p, i) => (i === parts.length - 1 ? p : p + (p.length === 1 ? '. ' : ' ')))
      .join('');
  }

  return n.replace(/"([^"]+)"/g, ' "$1" ').replace(/\s+/g, ' ').trim();
}

/** "Green Red" → ['green','red'], which are exactly the LEADER_COLOR_HEX keys. */
const parseColors = (raw: string) => raw.trim().split(/\s+/).filter(Boolean).map((c) => c.toLowerCase());

async function exists(p: string) {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Downloads one printing's image and writes a width-constrained WebP, named for
 * the printing rather than the card: several printings share a set code, but
 * card_image_id is unique. The base printing's image id *is* the set code, so
 * the files already on disk keep their names and are not re-fetched.
 *
 * Skips work already done, which is what makes a failed run resumable.
 */
async function fetchImage(card: ApiCard): Promise<boolean> {
  const out = path.join(IMAGE_DIR, `${card.card_image_id}.webp`);
  if (await exists(out)) return false;
  const res = await fetch(card.card_image!);
  if (!res.ok) throw new Error(`image ${card.card_set_id} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).resize({ width: IMAGE_WIDTH }).webp({ quality: 78 }).toFile(out);
  return true;
}

const BANNER = (src: string) =>
  `// GENERATED by scripts/build-leader-data.ts from ${src} — do not edit by hand.\n`;

async function main() {
  console.log('Fetching card data…');
  const [setCards, stCards, promoCards, sets] = await Promise.all([
    getJson<ApiCard[]>(`${API}/allSetCards/`),
    getJson<ApiCard[]>(`${API}/allSTCards/`),
    getJson<ApiCard[]>(`${API}/allPromos/`),
    getJson<ApiSet[]>(`${API}/allSets/`),
  ]);

  const pool = [...setCards, ...stCards, ...promoCards];
  // Every printing, grouped under its set code and ordered base-first.
  const printings = groupPrintings(pool);
  // The base printing carries the name and colours for the seeded leader row:
  // it is the one printing guaranteed not to be titled "… (Parallel)".
  const withArt = [...printings.values()].map((list) => list[0]);
  const artless = leadersWithoutArt(pool, printings);
  const cards = [...withArt, ...artless].sort((a, b) => a.card_set_id.localeCompare(b.card_set_id));
  const all = [...printings.values()].flat();
  console.log(`  ${cards.length} leaders (${artless.length} with no art), ${all.length} printings`);

  await mkdir(IMAGE_DIR, { recursive: true });
  let downloaded = 0;
  for (const c of all) {
    if (await fetchImage(c)) {
      downloaded += 1;
      process.stdout.write(`\r  images: ${downloaded} new`);
    }
  }
  console.log(`\r  images: ${downloaded} new, ${all.length - downloaded} cached`);

  // Metas are the format-defining boosters OP01–OP16. The API reports OP-14 and
  // OP-15 under merged ids ("OP14-EB04"), so match on the leading OPnn.
  const metas = sets
    .map((s) => ({ code: /^OP-?(\d{2})/.exec(s.set_id)?.[1], name: s.set_name }))
    .filter((m): m is { code: string; name: string } => Boolean(m.code))
    .map((m) => ({ name: `OP${m.code} ${m.name}`, code: `OP${m.code}` }))
    .sort((a, b) => a.code.localeCompare(b.code));
  console.log(`  ${metas.length} metas`);

  // The single-colour starter decks (ST15–ST20, ST23–ST28) contain no new leader
  // cards — they reprint a booster leader with alternate art under its original
  // set code. Players still call those decks by their ST number, so index which
  // decks each leader ships in and let the picker search on that; otherwise
  // typing "ST17" finds nothing because that card is filed as OP01-060.
  const decks = await getJson<ApiDeck[]>(`${API}/allDecks/`);
  const deckCodes = new Map<string, string[]>();
  for (const d of decks) {
    const code = d.structure_deck_id.replace('-', '');
    const cardsInDeck = await getJson<ApiCard[]>(`${API}/decks/${d.structure_deck_id}/`);
    for (const c of cardsInDeck) {
      if (c.card_type !== 'Leader') continue;
      // Skip the deck's own numbering (ST01 → ST01-001 adds nothing to search).
      if (c.card_set_id.startsWith(code)) continue;
      const list = deckCodes.get(c.card_set_id) ?? [];
      if (!list.includes(code)) list.push(code);
      deckCodes.set(c.card_set_id, list);
    }
  }
  console.log(`  ${deckCodes.size} leaders reprinted in a starter deck`);

  const leaderRows = cards
    .map((c) => {
      const colors = parseColors(c.card_color).map((x) => `'${x}'`).join(', ');
      return `  { name: ${JSON.stringify(cleanLeaderName(c.card_name))}, colors: [${colors}], setCode: '${c.card_set_id}' },`;
    })
    .join('\n');

  await writeFile(
    path.join(ROOT, 'src/db/seed-data.ts'),
    BANNER('https://optcgapi.com') +
      '\nexport const SEED_LEADERS: { name: string; colors: string[]; setCode: string }[] = [\n' +
      leaderRows +
      '\n];\n\nexport const SEED_METAS: { name: string; code: string }[] = [\n' +
      metas.map((m) => `  { name: ${JSON.stringify(m.name)}, code: '${m.code}' },`).join('\n') +
      '\n];\n',
  );

  await writeFile(
    path.join(ROOT, 'src/lib/leader-images.ts'),
    BANNER('scripts/build-leader-data.ts') +
      '\n/**\n' +
      ' * Every bundled printing of every leader, keyed by set code. Each entry names\n' +
      ' * a file in public/leaders/, and the first entry is the base printing — the\n' +
      ' * art shown to a player who has chosen none.\n' +
      ' */\n' +
      'export const LEADER_ART: Readonly<Record<string, readonly string[]>> = {\n' +
      [...printings.entries()]
        .map(([code, list]) => `  '${code}': [${list.map((c) => `'${c.card_image_id}'`).join(', ')}],`)
        .join('\n') +
      '\n};\n\n' +
      '/** Leader set codes with bundled art in public/leaders/. */\n' +
      'export const LEADER_IMAGE_CODES: ReadonlySet<string> = new Set(Object.keys(LEADER_ART));\n\n' +
      '/**\n' +
      ' * Starter decks that reprint a leader under a different set code, so the\n' +
      " * picker can find OP01-060 when a player searches for their \"ST17\" deck.\n" +
      ' */\n' +
      'export const LEADER_DECK_CODES: Readonly<Record<string, readonly string[]>> = {\n' +
      [...deckCodes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, ds]) => `  '${code}': [${ds.sort().map((d) => `'${d}'`).join(', ')}],`)
        .join('\n') +
      '\n};\n',
  );

  console.log('Wrote src/db/seed-data.ts, src/lib/leader-images.ts, public/leaders/');
}

// Only when run as a script. Its pure helpers are imported by tests, which must
// not touch the network — the same guard seed.ts uses.
if (process.argv[1]?.endsWith('build-leader-data.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
