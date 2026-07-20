CREATE TYPE "public"."play_order" AS ENUM('first', 'second');--> statement-breakpoint
CREATE TYPE "public"."round_result" AS ENUM('win', 'loss', 'draw');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('draft', 'locked');--> statement-breakpoint
CREATE TYPE "public"."tournament_type" AS ENUM('local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing');--> statement-breakpoint
CREATE TABLE "leaders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"colors" text[] DEFAULT '{}' NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"my_leader_id" uuid NOT NULL,
	"opponent_leader_id" uuid NOT NULL,
	"result" "round_result" NOT NULL,
	"play_order" "play_order",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"released_at" date,
	"is_custom" boolean DEFAULT false NOT NULL,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"type" "tournament_type" NOT NULL,
	"set_id" uuid,
	"name" text,
	"played_on" date NOT NULL,
	"status" "tournament_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_my_leader_id_leaders_id_fk" FOREIGN KEY ("my_leader_id") REFERENCES "public"."leaders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_opponent_leader_id_leaders_id_fk" FOREIGN KEY ("opponent_leader_id") REFERENCES "public"."leaders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE no action ON UPDATE no action;