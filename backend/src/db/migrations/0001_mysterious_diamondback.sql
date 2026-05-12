CREATE TABLE "cad_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_file_name" text,
	"area_m2_input" integer,
	"total_rooms" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cad_job_id" uuid NOT NULL,
	"room_index" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"width_m" text,
	"depth_m" text,
	"area_m2" text,
	"windows" integer,
	"doors" integer,
	"price_finishing" integer,
	"furniture_json" jsonb,
	"media_asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cad_jobs" ADD CONSTRAINT "cad_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_results" ADD CONSTRAINT "room_results_cad_job_id_cad_jobs_id_fk" FOREIGN KEY ("cad_job_id") REFERENCES "public"."cad_jobs"("id") ON DELETE cascade ON UPDATE no action;