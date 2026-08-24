/**
 * Imports unwatermarked leader art and layers it over the generated bundle.
 *
 *   npx tsx scripts/import-clean-art.ts <source-dir>
 *
 * Every public source of OPTCG card art — optcgapi, Limitless, Bandai's own
 * card list — serves the same SAMPLE-watermarked scan, so `build-leader-data.ts`
 * cannot produce clean art. This puts hand-collected clean art in front of it.
 *
 * ## Why a separate folder
 *
 * Output goes to `public/leaders/clean/`, never over `public/leaders/`. That
 * folder is generated, and `build-leader-data.ts` skips files that already
 * exist — so an overwritten file would survive only by accident and vanish the
 * moment the folder was cleared. Kept apart, both can be regenerated
 * independently and `getLeaderImage` falls back per printing: a card with no
 * clean scan keeps its watermarked one rather than showing nothing.
 *
 * ## What the sources are
 *
 * Square (1080×1080) character-art crops, not card scans: no frame, no name, no
 * stats, no watermark. They are resized to the same 5:7 footprint the generated
 * bundle uses, cropped from the centre, so a clean image is a drop-in
 * replacement everywhere — list thumbnails, the picker, and the canvas-rendered
 * share cards, none of which would survive a square image in a card-shaped slot.
 *
 * Centre rather than sharp's `attention` strategy: these crops are already
 * framed on the character, and a smart crop would pick a different window per
 * card, so two printings of one leader could end up framed differently.
 *
 * ## Only unsuffixed files are used
 *
 * A browser appends " (2)", " (3)" when a download name is already taken, and in
 * this collection that happened *across different cards*, not between printings
 * of one. `OP01-001` holds six files: two Roronoa Zoro, two Trafalgar Law, two
 * Monkey D. Luffy. `OP03-040` holds four, all different characters. Importing
 * them positionally puts another leader's face on this leader's card.
 *
 * The unsuffixed file is reliable — it was the first saved under that name, and
 * every one checked matched its card (EB01-021 Hannyabal, OP03-040 Nami,
 * OP01-031 Kouzuki Oden, and so on). So only those are imported, one per set
 * code, replacing the base printing. Alternate printings keep their watermarked
 * scan, because a watermark is a blemish and the wrong character is a lie.
 *
 * Numbered files are counted and reported, never written. To bring alternate
 * art in, re-export with names that identify the printing — `OP01-001_p1.png`
 * rather than `OP01-001 (2).png` — and this will map them directly.
 *
 * Deliberately not verified by comparing the two pictures. An art crop and a
 * watermarked full card differ everywhere by construction, so any distance
 * between them measures the framing, not whether the pairing is right — a check
 * that always fires is worse than no check, because it trains you to ignore it.
 * The contact sheet is the check: look at it.
 *
 * ## Printings optcgapi does not list
 *
 * The collection is the authority on which printings exist. optcgapi lists two
 * for OP01-001; six were collected. Files past the last bundled printing become
 * printings of their own, written as `<code>_c<n>` — `c` for collected, and a
 * suffix optcgapi does not use, so a printing it adds later cannot collide with
 * one invented here.
 *
 * `n` is the file's own number, not its position in the queue, so an id stays
 * put when optcgapi grows: `OP01-001 (3).png` is `OP01-001_c3` whether the
 * bundle holds two printings or five. That matters because a player's chosen
 * art is stored by id, and a renumbering would silently swap what they picked.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LEADER_ART } from '../src/lib/leader-images';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/leaders/clean');
const GENERATED_DIR = path.join(ROOT, 'public/leaders');
/** The generated bundle's footprint, so swapping one for the other moves nothing. */
const WIDTH = 240;
const HEIGHT = 335;

/** "OP01-001 (2).png" → "OP01-001". The space before "(" is not always there. */
export function setCodeOf(filename: string): string | null {
  return /^(.+?)\s*(?:\(\d+\))?\.(?:png|jpe?g|webp)$/i.exec(filename)?.[1] ?? null;
}

/** The collector's download suffix: "OP01-001 (3).png" → 3, unsuffixed → 1. */
export function printingIndex(filename: string): number {
  return Number(/\((\d+)\)\.[^.]+$/.exec(filename)?.[1] ?? 1);
}

/**
 * Pairs sources to printings by position, in the collector's numbering order.
 *
 * Files past the last bundled printing come back as `spare` rather than being
 * dropped quietly: they usually mean the source has a printing the app does not,
 * which is worth seeing rather than discarding.
 */
export function pairByOrder(
  sources: string[],
  printings: readonly string[],
): { pairs: { file: string; printing: string }[]; spare: string[] } {
  const ordered = [...sources].sort((a, b) => printingIndex(a) - printingIndex(b));
  return {
    pairs: ordered.slice(0, printings.length).map((file, i) => ({ file, printing: printings[i] })),
    spare: ordered.slice(printings.length),
  };
}

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error('usage: tsx scripts/import-clean-art.ts <source-dir>');

  const files = (await readdir(src)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  const byCode = new Map<string, string[]>();
  const unparsed: string[] = [];
  for (const f of files) {
    const code = setCodeOf(f);
    if (!code) { unparsed.push(f); continue; }
    byCode.set(code, [...(byCode.get(code) ?? []), f]);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const written: string[] = [];
  const unknown: string[] = [];
  const spare: string[] = [];
  const numbered: string[] = [];
  const extraByCode = new Map<string, string[]>();
  const sheet: { input: Buffer; top: number; left: number }[] = [];
  let row = 0;

  for (const [code, sources] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
    const printings = LEADER_ART[code];
    if (!printings) { unknown.push(`${code} (${sources.length} file(s))`); continue; }
    const base = sources.find((f) => printingIndex(f) === 1);
    numbered.push(...sources.filter((f) => f !== base).map((f) => `${code}: ${f}`));
    if (!base) { spare.push(`${code}: no unsuffixed file, only numbered ones`); continue; }

    // The base printing, and only it: LEADER_ART[code][0] is what every reader
    // falls back to, so this is the art almost everyone sees.
    const printing = printings[0];
    const out = path.join(OUT_DIR, `${printing}.webp`);
    await sharp(path.join(src, base))
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toFile(out);
    written.push(printing);
    if (row < 24) {
      const before = await sharp(path.join(GENERATED_DIR, `${printing}.webp`)).resize(110, 154, { fit: 'cover' }).toBuffer();
      const after = await sharp(out).resize(110, 154, { fit: 'cover' }).toBuffer();
      sheet.push({ input: before, top: (row % 12) * 162, left: Math.floor(row / 12) * 240 },
                 { input: after, top: (row % 12) * 162, left: Math.floor(row / 12) * 240 + 118 });
      row++;
    }
  }

  const list = (title: string, xs: string[]) => {
    if (!xs.length) return;
    console.log(`\n${title} (${xs.length}):`);
    for (const x of xs) console.log(`  ${x}`);
  };
  const bundled = Object.values(LEADER_ART).flat().length;
  console.log(`${files.length} source files, ${byCode.size} set codes`);
  console.log(`wrote ${written.length} base printings from unsuffixed files`);
  console.log(`  ${bundled - written.length} of ${bundled} printings still show the watermarked scan`);
  console.log(`  ${numbered.length} numbered files ignored — see the note at the top of this script`);
  list('unrecognised filenames', unparsed);
  list('set codes the app does not bundle', unknown);
  list('files skipped', spare);
  if (numbered.length) console.log(`\n${numbered.length} numbered files were ignored; re-export with printing-explicit names to use them.`);

  if (sheet.length) {
    const sheetPath = path.join(ROOT, 'clean-art-contact-sheet.png');
    await sharp({ create: { width: Math.ceil(row / 12) * 240, height: Math.min(row, 12) * 162, channels: 3, background: '#111' } })
      .composite(sheet).png().toFile(sheetPath);
    console.log(`\ncontact sheet (watermarked | clean): ${sheetPath}`);
  }

  await writeFile(
    path.join(ROOT, 'src/lib/clean-art.ts'),
    '// GENERATED by scripts/import-clean-art.ts — do not edit by hand.\n\n' +
      '/**\n * Printings with an unwatermarked scan in public/leaders/clean/.\n' +
      ' * getLeaderImage prefers these and falls back to the generated bundle,\n' +
      ' * so a printing missing from this set is not a broken image.\n */\n' +
      'export const CLEAN_ART: ReadonlySet<string> = new Set([\n' +
      [...written].sort().map((i) => `  '${i}',`).join('\n') +
      '\n]);\n\n' +
      '/**\n * Printings that exist only as collected art — optcgapi lists no such\n' +
      ' * printing, so LEADER_ART has no entry and these are appended to it by\n' +
      ' * `printingsOf`. Ordered by the collector\'s numbering.\n */\n' +
      'export const EXTRA_ART: Readonly<Record<string, readonly string[]>> = {\n' +
      [...extraByCode.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, ids]) => `  '${code}': [${[...ids].sort().map((i) => `'${i}'`).join(', ')}],`)
        .join('\n') +
      '\n};\n',
  );
  console.log('wrote src/lib/clean-art.ts');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
