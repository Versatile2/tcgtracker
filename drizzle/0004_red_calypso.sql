ALTER TYPE "public"."tournament_type" ADD VALUE 'freeplay';--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "my_leader_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "my_leader_id" uuid;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_my_leader_id_leaders_id_fk" FOREIGN KEY ("my_leader_id") REFERENCES "public"."leaders"("id") ON DELETE no action ON UPDATE no action;