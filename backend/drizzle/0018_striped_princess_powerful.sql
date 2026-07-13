ALTER TABLE "game_plays" DROP CONSTRAINT "game_plays_user_id_members_user_id_fk";
--> statement-breakpoint
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;