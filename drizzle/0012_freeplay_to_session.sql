-- The Sessions segment stopped being called "freeplay" in the UI on 2026-08-19,
-- and the Matches segment is now labelled "Free Play". Leaving the stored values
-- as `freeplay*` would make the database contradict the screen: `freeplay` would
-- name the rows shown as "Session", while the rows shown as "Free Play" are
-- stored as `match`.
--
-- RENAME VALUE is atomic and rewrites no rows — the enum's stored ordinals are
-- unchanged and only the label moves, so this is cheap at any table size.
--
-- Each rename is guarded on the old label still existing, which makes the file
-- safe to run twice. That matters because a rename is not self-detecting the way
-- a CREATE IF NOT EXISTS is: re-running an unguarded version fails on a value
-- that no longer exists, and a half-recorded migration is worse than a slow one.
--
-- To reverse, swap the two labels in each block. There is no DROP VALUE in
-- Postgres, which is why this is a rename rather than an add-and-retire.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tournament_type' AND e.enumlabel = 'freeplay'
  ) THEN
    ALTER TYPE "public"."tournament_type" RENAME VALUE 'freeplay' TO 'session';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tournament_type' AND e.enumlabel = 'freeplay_sim'
  ) THEN
    ALTER TYPE "public"."tournament_type" RENAME VALUE 'freeplay_sim' TO 'session_sim';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tournament_type' AND e.enumlabel = 'freeplay_sim_casual'
  ) THEN
    ALTER TYPE "public"."tournament_type" RENAME VALUE 'freeplay_sim_casual' TO 'session_sim_casual';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tournament_type' AND e.enumlabel = 'freeplay_friend'
  ) THEN
    ALTER TYPE "public"."tournament_type" RENAME VALUE 'freeplay_friend' TO 'session_friend';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tournament_type' AND e.enumlabel = 'freeplay_locals'
  ) THEN
    ALTER TYPE "public"."tournament_type" RENAME VALUE 'freeplay_locals' TO 'session_locals';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tournament_type' AND e.enumlabel = 'freeplay_gauntlet'
  ) THEN
    ALTER TYPE "public"."tournament_type" RENAME VALUE 'freeplay_gauntlet' TO 'session_gauntlet';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tournament_type' AND e.enumlabel = 'freeplay_teaching'
  ) THEN
    ALTER TYPE "public"."tournament_type" RENAME VALUE 'freeplay_teaching' TO 'session_teaching';
  END IF;
END $$;
