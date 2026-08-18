CREATE TABLE "leader_art" (
	"owner_id" text NOT NULL,
	"set_code" text NOT NULL,
	"art" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leader_art_owner_id_set_code_pk" PRIMARY KEY("owner_id","set_code")
);
