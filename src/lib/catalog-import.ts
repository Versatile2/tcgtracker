import { and, eq, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, metas, leaderImages } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

/*
 * Shaping optcgapi's rows into something insertable. These moved here from
 * scripts/build-leader-data.ts when that generator became an importer: the
 * network belongs in the script, but these are pure and carry the awkward
 * knowledge — how Bandai spells a name, which row is the base printing — that
 * is worth keeping under test.
 */
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
export const parseColors = (raw: string) => raw.trim().split(/\s+/).filter(Boolean).map((c) => c.toLowerCase());

export type Comparable = { name: string; colors: string[] };

/**
 * Which fields the API disagrees with us about.
 *
 * The importer never applies these — it prints them. The whole point of this
 * rework is that a hand correction outranks the API, so a difference is a
 * question for the owner, not an instruction to the script.
 *
 * Colour order is ignored: optcgapi is not stable about it, and a difference
 * nobody can act on teaches the owner to skim past the report.
 */
export function diffLeader(existing: Comparable, incoming: Comparable): string[] {
  const fields: string[] = [];
  if (existing.name !== incoming.name) fields.push('name');
  const a = [...existing.colors].sort().join(',');
  const b = [...incoming.colors].sort().join(',');
  if (a !== b) fields.push('colors');
  return fields;
}

export type IncomingLeader = {
  setCode: string;
  name: string;
  colors: string[];
  /** card_image_id -> already-resized WebP bytes, base printing first. */
  printings: { cardImageId: string; bytes: Buffer }[];
};
export type IncomingMeta = { code: string; name: string };

export type ImportReport = {
  insertedLeaders: number;
  insertedMetas: number;
  insertedPrintings: number;
  unchangedLeaders: number;
  differs: { setCode: string; fields: string[]; db: Comparable; api: Comparable }[];
};

/**
 * Apply an import. Insert-only: this may add a leader, a meta or a printing that
 * does not exist yet, and nothing else.
 *
 * Where the API disagrees with a row we already hold, the disagreement is
 * collected into `differs` and the row is left exactly as it is. That is the
 * whole point of the rework — a hand correction outranks the API.
 */
export async function applyImport(
  db: DB,
  incoming: { leaders: IncomingLeader[]; metas: IncomingMeta[] },
): Promise<ImportReport> {
  const report: ImportReport = {
    insertedLeaders: 0, insertedMetas: 0, insertedPrintings: 0,
    unchangedLeaders: 0, differs: [],
  };

  for (const inc of incoming.leaders) {
    const [existing] = await db.select().from(leaders)
      .where(and(isNull(leaders.ownerId), eq(leaders.setCode, inc.setCode)))
      .limit(1);

    let leaderId: string;
    let heldCardImageIds: string[] = [];

    if (!existing) {
      const [row] = await db.insert(leaders).values({
        name: inc.name, colors: inc.colors, setCode: inc.setCode,
        isCustom: false, ownerId: null, status: 'draft',
      }).returning({ id: leaders.id });
      leaderId = row.id;
      report.insertedLeaders += 1;
    } else {
      leaderId = existing.id;
      const fields = diffLeader(existing, inc);
      if (fields.length > 0) {
        report.differs.push({
          setCode: inc.setCode,
          fields,
          db: { name: existing.name, colors: existing.colors },
          api: { name: inc.name, colors: inc.colors },
        });
      } else {
        report.unchangedLeaders += 1;
      }
      const held = await db.select({ cardImageId: leaderImages.cardImageId })
        .from(leaderImages).where(eq(leaderImages.leaderId, leaderId));
      heldCardImageIds = held.map((h) => h.cardImageId).filter((c): c is string => c !== null);
    }

    const fresh = inc.printings.filter((p) => !heldCardImageIds.includes(p.cardImageId));
    if (fresh.length === 0) continue;

    const already = await db.select({ id: leaderImages.id })
      .from(leaderImages).where(eq(leaderImages.leaderId, leaderId));

    for (const [i, p] of fresh.entries()) {
      await db.insert(leaderImages).values({
        leaderId,
        cardImageId: p.cardImageId,
        label: labelFor(p.cardImageId, inc.setCode),
        data: p.bytes,
        mimeType: 'image/webp',
        width: 240,
        height: 336,
        byteSize: p.bytes.byteLength,
        checksum: createHash('sha256').update(p.bytes).digest('hex'),
        // Only ever the very first image a leader has. An import must never move
        // a default the owner chose.
        isDefault: already.length === 0 && i === 0,
        sortOrder: already.length + i,
      });
      report.insertedPrintings += 1;
    }
  }

  for (const m of incoming.metas) {
    const [existing] = await db.select().from(metas)
      .where(and(isNull(metas.ownerId), eq(metas.code, m.code))).limit(1);
    if (existing) continue;
    await db.insert(metas).values({
      name: m.name, code: m.code, isCustom: false, ownerId: null, status: 'draft',
    });
    report.insertedMetas += 1;
  }

  return report;
}

/** 'OP06-022' -> 'Base'; 'OP06-022_p2' -> 'p2'. */
function labelFor(cardImageId: string, setCode: string): string {
  if (cardImageId === setCode) return 'Base';
  const suffix = cardImageId.startsWith(`${setCode}_`) ? cardImageId.slice(setCode.length + 1) : cardImageId;
  return suffix || 'Base';
}
