-- Testing moved from the tournament segment to the freeplay segment, where the
-- leader is recorded per round rather than once for the session. Reshape the
-- rows written under the old rule so they render and count correctly.
UPDATE "rounds" r
   SET "my_leader_id" = t."my_leader_id"
  FROM "tournaments" t
 WHERE r."tournament_id" = t."id"
   AND t."type" = 'testing'
   AND t."my_leader_id" IS NOT NULL
   AND r."my_leader_id" IS NULL
   AND r."round_kind" NOT IN ('bye', 'no_show');
--> statement-breakpoint
UPDATE "tournaments" SET "my_leader_id" = NULL WHERE "type" = 'testing';
