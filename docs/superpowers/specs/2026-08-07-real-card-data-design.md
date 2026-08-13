# Grand Line TCG — Real OPTCG card data for leaders and metas (Design)

**Date:** 2026-08-07
**Status:** Shipped (commits `faa488b`, `88bb649`)
**Scope:** Replace the invented leader/meta reference data and the placeholder leader avatars with the real OPTCG card catalog sourced from [optcgapi.com](https://optcgapi.com).

## 1. Context

The app shipped slices 1–6 on **placeholder reference data**, which had degraded past the point of being usable as a real tracker:

- `src/db/seed-data.ts` held **25 hand-written leaders**. Six of them — `Franky`, `Big Mom`, `Eustass Kid`, `Sakazuki (Akainu)`, `Kuzan (Aokiji)`, `Gecko Moria` — **are not real leader cards at all** under those names. Several others had the wrong colors (the seed listed Zoro as green; the real OP01-001 Zoro is red).
- Metas `OP09`–`OP16` had no names, just the code repeated back.
- `getLeaderImage()` in `src/lib/leader-visual.ts` was a stub returning `null`, so every leader rendered as a color-tinted initial.

So the problem was not only "no images" — the leader *identities* were fiction, which makes matchup statistics meaningless.

## 2. Source: optcgapi.com

No auth, no API key, GET-only. Findings from probing it directly, since the published documentation is thin and partly wrong:

| Endpoint | Result |
|---|---|
| `GET /api/allSets/` | 200 — 21 sets with real names |
| `GET /api/allSetCards/` | 200 — 3485 cards (2.4 MB) |
| `GET /api/allSTCards/` | 200 — 538 starter-deck cards |
| `GET /api/allDecks/` | 200 — 29 starter decks |
| `GET /api/decks/{ST-nn}/` | 200 — cards for one deck |
| `GET /api/allPromoCards/` | **404 — documented but broken, do not use** |
| `GET /api/sets/OP01/` | 404 — set ids are dashed (`OP-01`), not `OP01` |

Card rows carry everything needed: `card_set_id` (`OP01-003`), `card_name`, `card_color` (`"Green Red"`), `card_type`, and `card_image`.

The docs ask callers not to hammer the API, so **the app never calls optcgapi at runtime**. Fetching is a manual authoring step and all output is committed.

### 2.1 The watermark constraint

**Every public source of OPTCG card art carries a diagonal "SAMPLE" watermark.** This was verified against optcgapi, the Limitless CDN, and Bandai's own `en.onepiece-cardgame.com` card list — all three serve byte-for-byte identical files. Bandai only publishes watermarked promotional scans; there is no clean-art source.

Only the top ~30% of a card is watermark-free. A crop of that band was prototyped and produced good character portraits, but the **decision was to ship the full card with the watermark visible**, which is the most faithful representation of the physical card.

## 3. Decisions

1. **Art:** full card, SAMPLE watermark visible, portrait 5:7 aspect.
2. **Catalog:** all **132** real leader printings (boosters + starter decks), keyed by set code.
3. **Existing data:** **wiped and reseeded.** The 25 invented leaders had no sane mapping onto the real catalog, so the ~11 demo tournaments / 46 rounds were deleted rather than remapped. This avoided any FK-remapping migration.

### 3.1 Why set code, not name, is the key

Leader names are **not unique** — there are **15 distinct "Monkey D. Luffy" printings**, and Red `ST01-001` Luffy and Black `ST14-001` Luffy are completely different decks. Collapsing them by name would destroy the matchup statistics the app exists to produce.

`card_set_id` is unique and stable across DB reseeds (row ids are not), so it is the key for seeding, image lookup, and test fixtures alike. The `leaders.set_code` column already existed and was already surfaced through `LeaderDTO`, so **no schema change and no migration were required**.

## 4. Implementation

### 4.1 Generator — `scripts/build-leader-data.ts`

Run manually via `npm run data:leaders`; deliberately **not** part of `next build`.

1. Fetch `/api/allSetCards/` + `/api/allSTCards/`, keep `card_type === 'Leader'` (287 rows).
2. De-dupe by `card_set_id`, preferring the base printing over `(Parallel)` / `(Alternate Art)` → **132 unique**. Every one has a base printing, so `card_image_id === card_set_id` universally.
3. **Name cleanup.** Strip the trailing disambiguator (`(003)`, `(SPR)`, `(OP15-098)`, `- OP14-001`), then unpack Bandai's dot-packing: a `.` after a multi-character word becomes a space, a `.` after a lone initial becomes `". "`. So `Monkey.D.Luffy (003)` → `Monkey D. Luffy`, `Edward.Newgate` → `Edward Newgate`. Quotes are spaced out: `Eustass"Captain"Kid` → `Eustass "Captain" Kid`.
4. **Colors.** `card_color.split(' ').map(lowercase)` — the vocabulary is exactly the six keys already in `LEADER_COLOR_HEX`.
5. **Images.** Download each `card_image`, resize to 240px-wide WebP (q78) into `public/leaders/<CARD-SET-ID>.webp`. ~22 KB each, **~3.0 MB for 132 files**. Existing files are skipped so re-runs are cheap.
6. **Metas.** From `/api/allSets/`, keep the format-defining boosters `OP-01`–`OP-16`. Note the API reports OP-14/OP-15 under merged ids `OP14-EB04` / `OP15-EB04`, so match on the leading `OPnn`.

Emits `src/db/seed-data.ts`, `src/lib/leader-images.ts`, and `public/leaders/`.

### 4.2 Seeding and reset

- `seedReferenceData` matches global leaders on **`set_code`** instead of `lower(name)` — the old name match would have collapsed the catalog to one row per name.
- `scripts/reset-reference-data.ts` (`npm run db:reset-reference -- --yes`) deletes rounds → tournaments → global leaders → global metas, then reseeds. Plain DML: it does not touch the schema or the drizzle migration journal.
- **`.env.local`'s `DATABASE_URL` points at the production Neon database**, so that script hits prod by default. It refuses to run without `--yes`.

### 4.3 UI

- `getLeaderImage(setCode)` resolves `/leaders/<code>.webp` from a generated `LEADER_IMAGE_CODES` set. Custom user leaders have no set code and keep the color-tinted-initial fallback.
- `LeaderAvatar` and the carousel tile switch from square to **5:7 card aspect** (`sm: w-6 h-[2.1rem]`, `md: w-11 h-[3.85rem]`, `lg: w-16 h-[5.6rem]`), matching the 600×838 source.
- Set codes are shown beside leader names in round items, opponent stats, and tournament cards; without them, rows reading "Monkey D. Luffy" four times are indistinguishable.
- `addCustomLeader` now de-dupes against **the user's own customs only**. Matching the global catalog by name would silently hand back an arbitrary printing instead of creating the custom leader.

## 5. Starter decks — already complete

A follow-up asked to "add the starter deck leaders". **Verification found 0 missing**: all 29 decks from `/api/allDecks/` were fetched individually via `/api/decks/{ST-nn}/` and every leader was already in the catalog.

The apparent ST15–ST20 / ST23–ST28 gaps are the **single-colour reprint decks**, which contain no new leader card — they repackage an existing booster leader under its *original* set code with alternate art (`_p2`/`_p3`):

| Deck | Actual card | | Deck | Actual card |
|---|---|---|---|---|
| ST-15 | `OP02-001` | | ST-23 | `OP09-001` |
| ST-16 | `ST11-001` | | ST-24 | `OP07-019` |
| ST-17 | `OP01-060` | | ST-25 | `OP09-042` |
| ST-18 | `OP05-060` | | ST-26 | `OP09-061` |
| ST-19 | `OP02-093` | | ST-27 | `OP09-081` |
| ST-20 | `OP03-099` | | ST-28 | `OP06-022` |

(`ST-29` is absent from `/api/allDecks/`, but `ST29-001` does exist in `allSTCards` and is in the catalog.)

Adding these as separate leaders would have been **wrong** — it would split win-rate statistics across what is really one deck.

There was a real usability gap underneath the request, though: searching `ST17` in the picker returned nothing, because that card is filed as `OP01-060`. The generator now emits `LEADER_DECK_CODES` (12 entries) and `leaderSearchText(name, setCode)` folds those codes into the **LeaderCarousel** search alongside name and set code. Not wired into the `ReferenceCombobox` on the tournament-detail page, since it would clutter the visible label.

## 6. Verification

- **175 tests pass** (6 new in `src/lib/leader-visual.test.ts` covering image resolution and deck-code search), lint at zero problems, `tsc --noEmit` and `next build` clean.
- Portrait layout was rendered against the real assets and checked for clipping/distortion across the carousel, tournament card, round item, and detail header.
- Production: both deploys `● Ready`; `OP01-003.webp`, `ST13-003.webp`, `OP09-061.webp` all return `200 image/webp` from the live site with byte sizes matching local.
- Prod DB confirmed at 132 leaders (all with set codes), 16 metas, 0 tournaments/rounds.

Note: `GET /` returns 404 to `curl` on production. This is **not** a regression — it is the known Clerk dev-instance behaviour (`dev-browser-missing`); it works in a real browser, and `/sign-in` returns 200.

## 7. Known gaps

- Card art carries Bandai's SAMPLE watermark. Unavoidable, per §2.1.
- At the smallest avatar size (24 px, collapsed opponents list) a full card is too small to read and renders as a coloured smudge. The set-code text carries identity there, and the avatar is `aria-hidden` decoration, so it is functional — but a face crop would read better in that one spot.
- Starter-deck code search covers the carousel only, not the tournament-detail combobox.
- Refreshing after a new set release is a manual `npm run data:leaders` step.
