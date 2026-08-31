-- English release dates for the main booster sets.
--
-- Hand-written: optcgapi's /allSets/ carries only set_id and set_name, so there
-- is nothing to import these from. Corroborated across two published release
-- calendars, which agree on every year and month; the day comes from
-- opboxindex.com alone and is corrected in /admin/metas if one is wrong.
--
-- This is what lets pickDefaultMetaId stop comparing codes lexically. Note the
-- consequence: once any official meta has a date, an undated one can no longer
-- become the default, so a set imported later needs its date entered by hand.
--
-- Matched on code and scoped to official rows, so a player's custom meta that
-- happens to share a code is left alone. Idempotent: re-running sets the same
-- values.
UPDATE "metas" SET "released_at" = v.d FROM (VALUES
  ('OP01', DATE '2022-12-02'),
  ('OP02', DATE '2023-03-10'),
  ('OP03', DATE '2023-06-30'),
  ('OP04', DATE '2023-09-22'),
  ('OP05', DATE '2023-12-08'),
  ('OP06', DATE '2024-03-15'),
  ('OP07', DATE '2024-06-28'),
  ('OP08', DATE '2024-09-13'),
  ('OP09', DATE '2024-12-13'),
  ('OP10', DATE '2025-03-21'),
  ('OP11', DATE '2025-06-06'),
  ('OP12', DATE '2025-08-22'),
  ('OP13', DATE '2025-11-07'),
  ('OP14', DATE '2026-01-16'),
  ('OP15', DATE '2026-04-03'),
  ('OP16', DATE '2026-06-12'),
  ('OP17', DATE '2026-08-28')
) AS v(code, d)
WHERE "metas"."code" = v.code AND "metas"."owner_id" IS NULL;
