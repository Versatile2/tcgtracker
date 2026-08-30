ALTER TABLE "leader_art" DROP CONSTRAINT "leader_art_owner_id_set_code_pk";--> statement-breakpoint
ALTER TABLE "leader_art" ALTER COLUMN "leader_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leader_art" ALTER COLUMN "leader_image_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leader_art" ADD CONSTRAINT "leader_art_owner_id_leader_id_pk" PRIMARY KEY("owner_id","leader_id");--> statement-breakpoint
ALTER TABLE "leader_art" DROP COLUMN "set_code";--> statement-breakpoint
ALTER TABLE "leader_art" DROP COLUMN "art";