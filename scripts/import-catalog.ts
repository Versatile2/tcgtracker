/**
 * Pulls the OPTCG catalog from optcgapi and proposes what is new.
 *
 *   npm run db:import-catalog
 *
 * INSERT-ONLY, on purpose. This script used to generate the catalog, which meant
 * every hand correction died at the next run. Now it may add a leader, a meta or
 * a printing that does not exist yet, and nothing else. Where it disagrees with
 * the database it prints the disagreement and moves on.
 *
 * Run by hand when a set drops — never in `next build`. optcgapi's docs ask
 * callers not to hammer the API.
 *
 * The network lives here and the rules live in src/lib/catalog-import.ts, which
 * is what makes the rules testable: the decisions are the part that matters.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import sharp from 'sharp';
import * as schema from '../src/db/schema';
import {
  applyImport, groupPrintings, leadersWithoutArt, cleanLeaderName, parseColors,
  type ApiCard, type IncomingLeader, type IncomingMeta,
} from '../src/lib/catalog-import';

const API = 'https://optcgapi.com/api';
const IMAGE_WIDTH = 240;

type ApiSet = { set_id: string; set_name: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

/** Download one printing and resize it to the shape the app stores. */
async function fetchArt(card: ApiCard): Promise<Buffer | null> {
  if (!card.card_image) return null;
  const res = await fetch(card.card_image);
  if (!res.ok) throw new Error(`image ${card.card_set_id} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf).resize({ width: IMAGE_WIDTH }).webp({ quality: 78 }).toBuffer();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  console.log(`Importing into ${url.replace(/:[^:@/]+@/, ':***@')}`);

  console.log('Fetching card data…');
  const [setCards, stCards, promoCards, sets] = await Promise.all([
    getJson<ApiCard[]>(`${API}/allSetCards/`),
    getJson<ApiCard[]>(`${API}/allSTCards/`),
    getJson<ApiCard[]>(`${API}/allPromos/`),
    getJson<ApiSet[]>(`${API}/allSets/`),
  ]);

  const pool = [...setCards, ...stCards, ...promoCards];
  const printings = groupPrintings(pool);
  const artless = leadersWithoutArt(pool, printings);
  console.log(`  ${printings.size + artless.length} leaders (${artless.length} with no art)`);

  const incomingLeaders: IncomingLeader[] = [];

  for (const [setCode, list] of printings) {
    // The base printing carries the name and colours: it is the one printing
    // guaranteed not to be titled "… (Parallel)".
    const base = list[0];
    const printed: { cardImageId: string; bytes: Buffer }[] = [];
    for (const card of list) {
      const bytes = await fetchArt(card);
      if (bytes && card.card_image_id) printed.push({ cardImageId: card.card_image_id, bytes });
    }
    incomingLeaders.push({
      setCode,
      name: cleanLeaderName(base.card_name),
      colors: parseColors(base.card_color),
      printings: printed,
    });
    process.stdout.write(`\r  art: ${incomingLeaders.length}/${printings.size} leaders fetched`);
  }
  process.stdout.write('\n');

  // A leader Bandai has not published a scan for is still a real leader; it
  // renders as a coloured initial until the art appears.
  for (const card of artless) {
    incomingLeaders.push({
      setCode: card.card_set_id,
      name: cleanLeaderName(card.card_name),
      colors: parseColors(card.card_color),
      printings: [],
    });
  }

  // Metas are the format-defining boosters. The API reports OP-14 and OP-15
  // under merged ids ("OP14-EB04"), so match on the leading OPnn.
  const incomingMetas: IncomingMeta[] = sets
    .map((s) => ({ code: /^OP-?(\d{2})/.exec(s.set_id)?.[1], name: s.set_name }))
    .filter((m): m is { code: string; name: string } => Boolean(m.code))
    .map((m) => ({ name: `OP${m.code} ${m.name}`, code: `OP${m.code}` }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const pg = new Pool({ connectionString: url });
  const db = drizzle(pg, { schema });
  try {
    const report = await applyImport(db, { leaders: incomingLeaders, metas: incomingMetas });

    console.log('');
    console.log(`inserted:   ${report.insertedLeaders} leaders (draft), ${report.insertedMetas} meta(s) (draft), ${report.insertedPrintings} printings`);
    console.log(`unchanged:  ${report.unchangedLeaders} leaders`);
    if (report.differs.length === 0) {
      console.log('differs:    none');
    } else {
      console.log(`differs:    ${report.differs.length} leaders — NOT modified:`);
      for (const d of report.differs) {
        for (const f of d.fields) {
          const a = f === 'name' ? d.db.name : d.db.colors.join(',');
          const b = f === 'name' ? d.api.name : d.api.colors.join(',');
          console.log(`  ${d.setCode}  ${f}: ${JSON.stringify(a)} (db) vs ${JSON.stringify(b)} (api)`);
        }
      }
      console.log('');
      console.log('Correct any of these in /admin/leaders — the importer never overwrites.');
    }
    console.log('');
    console.log('New rows arrive as drafts. Publish them in /admin/leaders before players can pick them.');
  } finally {
    await pg.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
