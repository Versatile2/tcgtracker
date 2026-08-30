ALTER TABLE "leader_art" ADD COLUMN "leader_id" uuid;--> statement-breakpoint
ALTER TABLE "leader_art" ADD COLUMN "leader_image_id" uuid;--> statement-breakpoint
ALTER TABLE "leader_art" ADD CONSTRAINT "leader_art_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_art" ADD CONSTRAINT "leader_art_leader_image_id_leader_images_id_fk" FOREIGN KEY ("leader_image_id") REFERENCES "public"."leader_images"("id") ON DELETE cascade ON UPDATE no action;