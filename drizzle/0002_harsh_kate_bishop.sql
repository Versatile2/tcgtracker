CREATE TYPE "public"."round_kind" AS ENUM('swiss', 'top_cut', 'bye', 'no_show');--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "opponent_leader_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "round_kind" "round_kind" DEFAULT 'swiss' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "games" jsonb;