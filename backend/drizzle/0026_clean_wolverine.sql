ALTER TABLE "user_bans" DROP CONSTRAINT "chk_user_bans_lift_consistency";--> statement-breakpoint
ALTER TABLE "user_bans" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "chk_user_bans_lift_consistency" CHECK ("user_bans"."lifted_by" is null or "user_bans"."lifted_at" is not null);