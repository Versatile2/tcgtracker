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
 * ## Which file is which printing
 *
 * Sources are named for the card, with a browser's " (2)", " (3)" suffix
 * separating printings, and that order is the alternate-art order. So the
 * mapping is positional: the unsuffixed file is the base printing, "(2)" the
 * next, matching the order in LEADER_ART.
 *
 * Deliberately not verified by comparing the two pictures. An art crop and a
 * watermarked full card differ everywhere by construction, so any distance
 * between them measures the framing, not whether the pairing is right — a check
 * that always fires is worse than no check, because it trains you to ignore it.
 * The contact sheet is the check: look at it.
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
  const sheet: { input: Buffer; top: number; left: number }[] = [];
  let row = 0;

  for (const [code, sources] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
    const printings = LEADER_ART[code];
    if (!printings) { unknown.push(`${code} (${sources.length} file(s))`); continue; }
    const { pairs, spare: extra } = pairByOrder(sources, printings);
    for (const { file, printing } of pairs) {
      const out = path.join(OUT_DIR, `${printing}.webp`);
      await sharp(path.join(src, file))
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
    spare.push(...extra.map((f) => `${code}: ${f}`));
  }

  const list = (title: string, xs: string[]) => {
    if (!xs.length) return;
    console.log(`\n${title} (${xs.length}):`);
    for (const x of xs) console.log(`  ${x}`);
  };
  const bundled = Object.values(LEADER_ART).flat().length;
  console.log(`${files.length} source files, ${byCode.size} set codes`);
  console.log(`wrote ${written.length} clean images — ${bundled - written.length} of ${bundled} printings still fall back to the watermarked scan`);
  list('unrecognised filenames', unparsed);
  list('set codes the app does not bundle', unknown);
  list('extra files with no printing to attach to', spare);

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
      '\n]);\n',
  );
  console.log('wrote src/lib/clean-art.ts');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
