CREATE TYPE "public"."profile_visibility" AS ENUM('all', 'members', 'none');--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"profile_visibility" "profile_visibility" DEFAULT 'all' NOT NULL,
	"visible_to_recruiters" boolean DEFAULT true NOT NULL,
	"show_email" boolean DEFAULT false NOT NULL,
	"show_location" boolean DEFAULT true NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"push_notifications" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;