# Leader alternate art, and a daily card-data refresh

Date: 2026-08-18

## Problem

Three separate asks, only two of which turned out to need work.

1. **Tournaments should not lock on finish.** Investigated and dismissed — see
   "Out of scope".
2. **A leader should be able to have more than one image.** Most OPTCG leaders
   are printed several times: a base card, a Parallel or Alternate Art, and
   sometimes an SPR. The app shows only the base printing, so a player who owns
   and sleeves the alt art never sees it.
3. **The leader list should be updated.** OP-17 "The World's Strongest Warriors"
   releases 2026-08-22 (JP) / 2026-08-28 (EN), after this spec is written.

## Evidence

Measured against optcgapi on 2026-08-18, with rows scraped 2026-08-17:

- **293 leader rows over 132 distinct set codes.** Six rows carry no
  `card_image_id` and no art, leaving **285 bundleable printings** — so there are
  **153 alternates** the app currently discards.
- 116 of the 132 leaders have at least two printings; 16 have exactly one. The
  distribution is 16 leaders with one printing, 82 with two, 31 with three and 3
  with four.
- At the current 240px WebP encoding the alternates add **~4 MB** to
  `public/leaders/`, taking it from 3.0 MB to 7.1 MB — the foil and textured
  alternates compress worse than base scans. Static files, not the JS bundle.
- **The seeded catalog is already identical to optcgapi's**: same 132 codes, no
  additions, no removals. Newest booster OP16, newest starter ST30. The catalog
  is not stale; OP-17 simply has not shipped yet.

## Out of scope: the tournament lock

`finishTournament` sets `status: 'locked'` and `src/services/rounds.ts:17,28`
rejects every round write with a 409 until the tournament is reopened. Offered
the choice of making "finished" a label that never blocks editing, the answer was
to leave today's behaviour alone. No change.

## Part 1 — Alternate art

### Generation

`scripts/build-leader-data.ts` keeps one card per set code today, discarding
variants via `isVariant` (line 45) and the `byCode` collapse (line 107). It
instead groups **every** printing under its set code.

- Ordering is base-first, then by image id, so `LEADER_ART[code][0]` is always
  the base printing and the app's current appearance is unchanged by default.
- Each printing downloads to `public/leaders/<card_image_id>.webp`. Base
  printings already use exactly that name (`OP01-001.webp`), so the 132 files on
  disk are untouched and only the 154 alternates are fetched.
- The six rows with no `card_image_id` are skipped, as are duplicate image ids
  within one set code.
- The grouping is extracted as a pure exported function alongside
  `cleanLeaderName`, so it can be unit-tested without hitting the network.

`src/lib/leader-images.ts` gains, in place of `LEADER_IMAGE_CODES`:

```ts
export const LEADER_ART: Readonly<Record<string, readonly string[]>> = {
  'OP01-001': ['OP01-001', 'OP01-001_p1'],
  'OP06-022': ['OP06-022', 'OP06-022_p1', 'OP06-022_p2', 'OP06-022_p3'],
  // …
};
```

`LEADER_IMAGE_CODES` is derived from its keys, so existing callers keep working.

### Storage

The chosen art must survive a cleared `localStorage`, so it is a per-user row in
Postgres, not a client preference.

```ts
export const leaderArt = pgTable('leader_art', {
  ownerId: text('owner_id').notNull(),
  setCode: text('set_code').notNull(),
  art: text('art').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.setCode] })]);
```

Keyed on **set code, not leader id**, for the reason already recorded in
`leader-visual.ts:37-41`: row ids change across a reseed, set codes do not.
Custom leaders have no card art, so they never appear in this table.

A row is absent until the user picks something, and absent means "base
printing". Choosing the base printing again deletes the row rather than storing a
redundant one, so the table only ever holds genuine deviations from the default.

This is presentation only. Nothing reads `leader_art` when computing statistics,
and a leader is still one leader however it is drawn.

### API

- `GET /api/leader-art` → `Record<setCode, art>` for the caller.
- `PUT /api/leader-art` with `{ setCode, art }` → upserts, or deletes the row
  when `art` is the base printing. Returns the updated map.

The service rejects an `art` value that is not a printing of that `setCode`
according to `LEADER_ART`, with a `ValidationError` (400). Without that check the
column would accept any string and the client would render a 404 image.

### Rendering

A `LeaderArtProvider` in `src/app/providers.tsx` holds the preference map from a
single query. `getLeaderImage(setCode, art?)` resolves the file, falling back to
the base printing when `art` is absent or not a valid printing of that code.
`LeaderAvatar` reads the context itself, so tournament headers, round rows,
stats, and share cards all follow without a prop threaded through every call
site.

### Picker interaction

`LeaderPicker` tiles keep one slot each. Beneath the caption sits a row of dots,
one per printing; the art changes by tapping a dot or swiping the card
horizontally. The 16 leaders with a single printing show no dots, but the row is
still held open so cards stay on a common baseline across a grid row.

The dots are their **own controls, outside the select button**. The whole tile is
currently one `<button>` that picks the leader
(`leader-picker.tsx:85-105`); if a swipe were ever misread as a tap it would
silently change the leader on the tournament being logged. So the art keeps the
select button, and the dots sit in a separate 44px-tall row below it — reachable
in their own right, and the fallback when a swipe does not take.

The swipe reuses the axis-lock idiom already in `swipe-row.tsx:26-49`: a 6px
threshold, a horizontal-vs-vertical decision made once per gesture, and
`touch-action: pan-y` so the catalog still scrolls.

Flipping writes the preference optimistically. Like custom leaders — the app's
existing exception to offline-first (`query-hooks.ts:140-149`) — the write needs
a connection, and reverts with a toast if it fails.

## Part 2 — Daily card-data refresh

`.github/workflows/refresh-card-data.yml`, on a daily 06:00 UTC cron plus
`workflow_dispatch`. The repository has no CI today; this is the first workflow.

- Step one is a date guard that exits successfully once the day is past
  **2026-09-10**, the agreed end of the window. GitHub cron has no end date, so
  the guard is the stop condition and the workflow file is deleted afterwards.
- The job runs `npm run data:leaders`, then opens a PR with `gh` if
  `git status --porcelain` is non-empty. No third-party actions.
- Most days nothing changes and the job ends silently — no PR, no noise.

**Sequencing:** Part 1 lands and commits its 153 images *before* this workflow is
enabled. Reversed, the first PR would be a 4 MB wall of binaries to review.

### Reaching production

New leaders only appear in the app once `seedReferenceData` inserts them. It is
additive and idempotent — `seed.ts:13-21` skips any set code already present — so
no reset is involved. The PR body carries the checklist:

1. Merge.
2. Deploy.
3. `npm run db:seed` against production.

The seed stays manual. The PR has to be merged by hand regardless, so a follow-up
command costs nothing, and it keeps a production `DATABASE_URL` out of CI.

`SEED_METAS` regenerates from the same run, so the OP17 meta arrives with the
OP17 leaders and needs no separate step.

### Migration ordering

The `leader_art` migration runs against production **before** the deploy is
pushed. This is the rule established during the freeplay work: a deploy that ships
first queries a table that does not exist yet, and takes the app down until the
migration lands.

## Error handling

- optcgapi unreachable or non-200: the script throws, the job fails, GitHub
  emails. Correct for a job that must not guess.
- A partially completed image download: `fetchImage` skips files already on disk
  (line 82), so a rerun resumes.
- An unfamiliar suffix such as `_p5` needs no code change — printings are keyed
  on whatever `card_image_id` the API reports.
- `PUT` with art that is not a printing of that set code: 400, nothing written.
- `GET /api/leader-art` failing offline: the persisted query cache serves the
  last known map; a cold start with no cache falls back to base art everywhere,
  which is the current appearance.

## Testing

- The printing-grouping function: ordering (base first), dedupe, the image-less
  row, a code with a single printing.
- `getLeaderImage`: valid preference; a preference naming art that is not a
  printing of that code (falls back to base); an unknown code; a custom leader
  with no set code.
- The `leader_art` service: upsert, overwrite, delete-on-base, and rejection of
  foreign art.
- `PUT /api/leader-art` validation, beside `reference.route.test.ts`.
- `LeaderAvatar` renders the preferred art when the provider supplies one, and
  the base art when it does not.
- The workflow is proved with one `workflow_dispatch` run, not a unit test.

## Deliberately not doing

- **Recording which printing was played.** Rejected: it adds a field to the
  fast-logging path, which Product Principle 1 protects.
- **Per-printing leader rows.** Would split every statistic across printings of
  the same leader.
- **Hand-seeding OP-17 from spoilers.** Set codes taken from reveal videos would
  need correcting later, and the app only ever uses Bandai's own scans. The daily
  refresh picks the set up on release instead.
