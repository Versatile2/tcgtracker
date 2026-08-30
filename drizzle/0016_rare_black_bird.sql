CREATE TYPE "public"."catalog_status" AS ENUM('draft', 'published', 'hidden');--> statement-breakpoint
ALTER TABLE "leaders" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "leaders" ADD COLUMN "deck_codes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "leaders" ADD COLUMN "status" "catalog_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "metas" ADD COLUMN "status" "catalog_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
-- Nothing creates these today, so these are legacy rows: surface them for review
-- rather than leaving them silently live.
UPDATE "leaders" SET "status" = 'draft' WHERE "owner_id" IS NOT NULL;--> statement-breakpoint
UPDATE "metas" SET "status" = 'draft' WHERE "owner_id" IS NOT NULL;--> statement-breakpoint
-- Everything inserted from now on is a proposal.
ALTER TABLE "leaders" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "metas" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
-- Transcribed from src/lib/leader-deck-codes.ts, which this column replaces.
UPDATE "leaders" SET "deck_codes" = '{ST17}' WHERE "set_code" = 'OP01-060';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST15}' WHERE "set_code" = 'OP02-001';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST19}' WHERE "set_code" = 'OP02-093';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST20}' WHERE "set_code" = 'OP03-099';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST18}' WHERE "set_code" = 'OP05-060';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST28}' WHERE "set_code" = 'OP06-022';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST24}' WHERE "set_code" = 'OP07-019';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST23}' WHERE "set_code" = 'OP09-001';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST25}' WHERE "set_code" = 'OP09-042';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST26}' WHERE "set_code" = 'OP09-061';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST27}' WHERE "set_code" = 'OP09-081';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST36}' WHERE "set_code" = 'OP10-099';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST34}' WHERE "set_code" = 'OP11-062';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST32}' WHERE "set_code" = 'OP12-020';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST33}' WHERE "set_code" = 'OP12-040';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST35}' WHERE "set_code" = 'OP13-004';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST16}' WHERE "set_code" = 'ST11-001';
--> statement-breakpoint
UPDATE "leaders" SET "deck_codes" = '{ST31}' WHERE "set_code" = 'ST21-001';
