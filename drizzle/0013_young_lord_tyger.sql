CREATE TABLE "leader_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leader_id" uuid NOT NULL,
	"card_image_id" text,
	"label" text NOT NULL,
	"data" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leader_images" ADD CONSTRAINT "leader_images_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leader_images_leader_card_uq" ON "leader_images" USING btree ("leader_id","card_image_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leader_images_one_default_uq" ON "leader_images" USING btree ("leader_id") WHERE "leader_images"."is_default";