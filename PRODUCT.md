# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One Piece TCG (OPTCG) players, spanning three segments treated as equally important:
- **Competitive grinders** prepping for Treasure Cups / Regionals who track matchups and win rates to tune decks and read the meta.
- **Casual local players** logging games at locals for personal history and enjoyment.
- **Streamers / creators** who also share their results and stats publicly.

Primary situation: on a **phone, at or right after a tournament**, logging games round-by-round — often in a venue with weak or no connectivity — then later reviewing stats and matchups to make deck decisions.

## Product Purpose

A One Piece TCG tournament tracker. Players log tournaments and each individual round, and the app turns that history into per-leader and per-meta matchup statistics, achievements, and shareable summaries. It exists to replace spreadsheets and memory with fast, structured, OPTCG-specific logging and analysis. Success is a player who consistently logs their events and uses the resulting matchup data to make deck and play decisions.

## Positioning

OPTCG-native match tracking: the app models the game's real structure — your **leader** (per tournament), the opponent's **leader** and optional **meta** (per round), tournament **types** (local, Treasure Cup, Regionals, Extra Grand Battle, Pirates Party, testing), and **play order** (first/second) — to produce leader-vs-leader and per-meta win-rate breakdowns a generic tracker or spreadsheet cannot. Combined with fast, offline-capable mobile logging during live events and a game-like achievement/progression layer. Edge, in priority order: **OPTCG matchup intelligence**, **fast phone logging (offline-tolerant)**, and **achievements / progression**.

## Operating Context

Used primarily on a phone as an installable PWA, at live tournaments and locals, frequently offline or on weak venue signal. Core workflow:
1. Create a tournament (type, your leader, date, optional meta).
2. Log each round: opponent leader, optional opponent meta, result (W/L/other), play order, notes.
3. Finish / lock the tournament.
4. Review global stats and achievements.
5. Optionally share a stat / tournament / achievement card.

## Capabilities and Constraints

- Tournaments carry a per-tournament player leader (`myLeaderId`) and optional meta; rounds capture `opponentLeaderId`, optional `opponentMetaId`, result, play order, and notes.
- Global statistics: overall record, per-meta breakdown, per-opponent-leader and per-(opponent leader × opponent meta) breakdowns, and matchup stats by played leader.
- Achievements with progress tracking and unlock notifications.
- Appearance: light/dark theme plus a selectable accent color.
- Export & sharing: rendered PNG cards (stats, tournament, achievement), plus a free CSV export of every tournament and round (one row per round). There is no paid tier.
- Offline PWA. Tournaments and rounds can be **created and edited with no connection**: writes go to a durable queue, apply to the UI at once, and are delivered when the network returns. Custom leaders/metas are the one write that still needs a connection.
- Terminology: **leader** (a deck's leader card), **meta** (card set / format, e.g. OP01–OP16 — this term replaced the older "set"), **round** (one match within a tournament), tournament **type**. The three things a player can log are a **tournament**, a **session** (several games, deck changing between them, stored as `session*`) and **free play** (a single game on its own, stored as `match`).
- Technical constraints: Next.js 16 App Router + TypeScript + Tailwind v4, Clerk auth (currently a **dev** instance), Neon Postgres + Drizzle. Auth middleware lives at `src/proxy.ts` (Next 16 renamed the `middleware` convention to `proxy`; it must sit beside `app/`, i.e. inside `src/`). `localStorage` keys use the `crewstat-*` prefix and **must not be renamed** (doing so would reset existing users' data). GitHub repo and Vercel project are named `tcgtracker`.

## Brand Commitments

- Name: **Grand Line TCG**; tagline **"Track your OPTCG Games"** (naming history: BountyLog → Crew Stat → Grand Line TCG).
- The One Piece / "Grand Line" nautical identity is intentional but **deliberately subtle** — a nod in the name only. Keep the UI clean and largely neutral; do **not** lean into heavy pirate/IP theming.
- Default accent is indigo (`#4f46e5`); users can pick other accents.
- This is an **unofficial, fan-made** tool for the One Piece TCG (not affiliated with or endorsed by Bandai); design must not imply official status.

## Evidence on Hand

- Live app: https://tcgtracker-three.vercel.app
- **Production carries real logged data** as of 2026-08-21: 24 tournaments across all three segments, 11 of them sessions. (The ~11 demo tournaments / ~46 rounds were deleted on 2026-08-07 when the invented leader catalog was replaced with the real one; the claim that nothing exists dates from then and is no longer true. Any migration touching `tournaments` now touches live rows.)
- Seeded reference data: **132 real OPTCG leader printings** (boosters + starter decks, keyed by set code) and metas OP01–OP16 with their real set names, generated from optcgapi.com — see `docs/superpowers/specs/2026-08-07-real-card-data-design.md`.
- Leader card art is Bandai's official promotional scan and carries a visible "SAMPLE" watermark. Every public source serves the same watermarked file; there is no clean-art version to switch to.
- No testimonials, user counts, ratings, pricing, or press exist — future work must not fabricate any of these.

## Product Principles

1. **Log-first.** Capturing a round mid-event must be fast and possible offline; analysis features must never slow down logging.
2. **OPTCG-true structure.** Model the real game (leader, meta, tournament types, play order) so the statistics are meaningful to players.
3. **Insight over data entry.** Raw logs should always roll up into matchup and meta intelligence a player can act on.
4. **Reward the habit.** Achievements and progression make consistent tracking satisfying and sticky.
5. **Broad but respectful.** Serve competitive, casual, and creator players alike; keep brand flavor light and the tool clearly unofficial.

## Accessibility & Inclusion

Mobile-first and built for one-handed phone use in a busy venue: legible type, adequate touch targets, and iOS safe-area support (bottom tab bar / top back bar). No formal conformance standard has been committed beyond general good practice.
