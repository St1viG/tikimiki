CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'approved', 'rejected', 'waitlisted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."badge_category" AS ENUM('participation', 'achievement', 'social', 'special');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('general', 'announcements', 'team', 'private');--> statement-breakpoint
CREATE TYPE "public"."cosmetic_rarity" AS ENUM('common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."cosmetic_type" AS ENUM('username_effect', 'avatar_decoration', 'banner_effect');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('user', 'hackathon', 'application', 'team', 'project', 'post', 'comment', 'badge', 'message', 'bounty', 'game');--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."hackathon_status" AS ENUM('upcoming', 'ongoing', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."hackathon_type" AS ENUM('physical', 'virtual', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."merch_order_status" AS ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('application_approved', 'application_rejected', 'application_waitlisted', 'badge_awarded', 'hackathon_result_posted', 'hackathon_starting_soon', 'organization_verified', 'organization_rejected', 'new_direct_message', 'position_assigned', 'bounty_result_posted', 'merch_order_shipped', 'new_follower', 'friend_request_received', 'friend_request_accepted');--> statement-breakpoint
CREATE TYPE "public"."org_verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."point_txn_type" AS ENUM('game_reward', 'badge_award', 'hackathon_placement', 'bounty_placement', 'merch_purchase', 'premium_purchase', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'submitted', 'under_review', 'judged');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target_type" AS ENUM('user', 'post', 'comment', 'message', 'hackathon');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('premium');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('leader', 'member');--> statement-breakpoint
CREATE TABLE "administrators" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "chk_follows_no_self" CHECK ("follows"."follower_id" <> "follows"."followee_id")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_id_a" uuid NOT NULL,
	"user_id_b" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendships_user_id_a_user_id_b_pk" PRIMARY KEY("user_id_a","user_id_b"),
	CONSTRAINT "chk_friendships_canonical_order" CHECK ("friendships"."user_id_a" < "friendships"."user_id_b"),
	CONSTRAINT "chk_friendships_requester" CHECK ("friendships"."requester_id" = "friendships"."user_id_a" or "friendships"."requester_id" = "friendships"."user_id_b"),
	CONSTRAINT "chk_friendships_responded_consistency" CHECK (("friendships"."status" = 'accepted') = ("friendships"."responded_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"points" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "chk_members_points_non_negative" CHECK ("members"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"website_url" text,
	"logo_url" text,
	"contact_email" varchar(254),
	"verification_status" "org_verification_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	CONSTRAINT "chk_orgs_approved_fields" CHECK ("organizations"."verification_status" <> 'approved' or ("organizations"."reviewed_by" is not null and "organizations"."reviewed_at" is not null)),
	CONSTRAINT "chk_orgs_rejected_fields" CHECK ("organizations"."verification_status" <> 'rejected' or ("organizations"."rejection_reason" is not null and "organizations"."reviewed_by" is not null and "organizations"."reviewed_at" is not null)),
	CONSTRAINT "chk_orgs_pending_fields" CHECK ("organizations"."verification_status" <> 'pending' or ("organizations"."reviewed_by" is null and "organizations"."reviewed_at" is null and "organizations"."rejection_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "user_bans" (
	"ban_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"banned_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	CONSTRAINT "chk_user_bans_lift_consistency" CHECK (("user_bans"."lifted_at" is null) = ("user_bans"."lifted_by" is null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(32) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"google_id" text,
	"github_id" text,
	"github_username" varchar(39),
	"linkedin_id" text,
	"avatar_url" text,
	"banner_url" text,
	"bio" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_skills" (
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "member_skills_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"skill_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"application_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"team_id" uuid,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_applications_review_consistency" CHECK (("applications"."reviewed_at" is null) = ("applications"."reviewed_by" is null)),
	CONSTRAINT "chk_applications_rejection_reason" CHECK ("applications"."rejection_reason" is null or "applications"."status" = 'rejected')
);
--> statement-breakpoint
CREATE TABLE "bounties" (
	"bounty_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"sponsor_name" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"theme" varchar(100),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bounty_submissions" (
	"bounty_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "bounty_submissions_bounty_id_project_id_pk" PRIMARY KEY("bounty_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "hackathon_prizes" (
	"prize_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"bounty_id" uuid,
	"sponsor_name" varchar(100),
	"title" varchar(200) NOT NULL,
	"description" text,
	"rank" smallint,
	"award_value" text,
	CONSTRAINT "chk_prizes_rank" CHECK ("hackathon_prizes"."rank" is null or "hackathon_prizes"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "hackathon_required_skills" (
	"hackathon_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "hackathon_required_skills_hackathon_id_skill_id_pk" PRIMARY KEY("hackathon_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "hackathon_results" (
	"result_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"bounty_id" uuid,
	"rank" integer,
	"prize_id" uuid,
	CONSTRAINT "chk_hackathon_results_rank" CHECK ("hackathon_results"."rank" is null or "hackathon_results"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "hackathons" (
	"hackathon_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"type" "hackathon_type" NOT NULL,
	"status" "hackathon_status" DEFAULT 'upcoming' NOT NULL,
	"theme" varchar(100),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"registration_deadline" timestamp with time zone NOT NULL,
	"max_participants" integer,
	"min_team_size" smallint DEFAULT 1 NOT NULL,
	"max_team_size" smallint NOT NULL,
	"location" varchar(200),
	"coordinates" geography(Point,4326),
	"logo_url" text,
	"banner_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_hackathons_dates" CHECK ("hackathons"."starts_at" < "hackathons"."ends_at"),
	CONSTRAINT "chk_hackathons_registration_deadline" CHECK ("hackathons"."registration_deadline" < "hackathons"."starts_at"),
	CONSTRAINT "chk_hackathons_max_participants" CHECK ("hackathons"."max_participants" is null or "hackathons"."max_participants" > 0),
	CONSTRAINT "chk_hackathons_team_size" CHECK ("hackathons"."min_team_size" >= 1 and "hackathons"."max_team_size" >= "hackathons"."min_team_size"),
	CONSTRAINT "chk_hackathons_physical_location" CHECK ("hackathons"."type" = 'virtual' or ("hackathons"."location" is not null and "hackathons"."coordinates" is not null))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"project_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"repository_url" text,
	"video_url" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_projects_submitted_consistency" CHECK (("projects"."status" = 'draft') = ("projects"."submitted_at" is null))
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "chk_team_members_exit_consistency" CHECK (not ("team_members"."left_at" is not null and "team_members"."deleted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"team_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"vote_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"voter_id" uuid,
	"voter_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_votes_voter_identity" CHECK (("votes"."voter_id" is null) <> ("votes"."voter_fingerprint" is null))
);
--> statement-breakpoint
CREATE TABLE "kanban_boards" (
	"board_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_cards" (
	"card_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"column_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"assigned_to" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"position" real DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_kanban_cards_position" CHECK ("kanban_cards"."position" >= 0.0)
);
--> statement-breakpoint
CREATE TABLE "kanban_columns" (
	"column_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_kanban_columns_position" CHECK ("kanban_columns"."position" >= 0.0)
);
--> statement-breakpoint
CREATE TABLE "channel_groups" (
	"group_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_channel_groups_position" CHECK ("channel_groups"."position" >= 0.0)
);
--> statement-breakpoint
CREATE TABLE "channel_messages" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"channel_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"team_id" uuid,
	"type" "channel_type" NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_channels_team_consistency" CHECK (("channels"."type" = 'team') = ("channels"."team_id" is not null)),
	CONSTRAINT "chk_channels_position" CHECK ("channels"."position" >= 0.0)
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"conversation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"attachment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"url" text NOT NULL,
	"filename" varchar(255),
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_user_id_message_id_symbol_pk" PRIMARY KEY("user_id","message_id","symbol"),
	CONSTRAINT "chk_message_reaction_symbol_length" CHECK (char_length("message_reactions"."symbol") <= 8)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"message_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"reply_to_id" uuid,
	"content" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "chk_messages_deleted_consistency" CHECK (("messages"."deleted_at" is null) = ("messages"."deleted_by" is null))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"permission_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_role_permissions" (
	"server_role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "server_role_permissions_server_role_id_permission_id_pk" PRIMARY KEY("server_role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "server_roles" (
	"server_role_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"server_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"logo_url" text,
	"banner_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"server_role_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_server_role_id_user_id_pk" PRIMARY KEY("server_role_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comment_attachments" (
	"attachment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"url" text NOT NULL,
	"filename" varchar(255),
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_reactions" (
	"user_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reactions_user_id_comment_id_symbol_pk" PRIMARY KEY("user_id","comment_id","symbol"),
	CONSTRAINT "chk_comment_reaction_symbol_length" CHECK (char_length("comment_reactions"."symbol") <= 8)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"comment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"content" text DEFAULT '' NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_attachments" (
	"attachment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"url" text NOT NULL,
	"filename" varchar(255),
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_user_id_post_id_symbol_pk" PRIMARY KEY("user_id","post_id","symbol"),
	CONSTRAINT "chk_post_reaction_symbol_length" CHECK (char_length("post_reactions"."symbol") <= 8)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"post_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"badge_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"category" "badge_category" NOT NULL,
	"icon_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_plays" (
	"play_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_game_plays_score" CHECK ("game_plays"."score" >= 0),
	CONSTRAINT "chk_game_plays_points_awarded" CHECK ("game_plays"."points_awarded" >= 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"game_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"base_daily_plays" smallint DEFAULT 1 NOT NULL,
	"premium_daily_plays" smallint DEFAULT 3 NOT NULL,
	"max_points_per_play" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_games_base_daily_plays" CHECK ("games"."base_daily_plays" >= 1),
	CONSTRAINT "chk_games_premium_daily_plays" CHECK ("games"."premium_daily_plays" >= "games"."base_daily_plays"),
	CONSTRAINT "chk_games_max_points" CHECK ("games"."max_points_per_play" is null or "games"."max_points_per_play" > 0)
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"transaction_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "point_txn_type" NOT NULL,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reference_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_point_transactions_delta" CHECK ("point_transactions"."delta" <> 0),
	CONSTRAINT "chk_point_transactions_balance_after" CHECK ("point_transactions"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "cosmetic_items" (
	"cosmetic_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "cosmetic_type" NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"rarity" "cosmetic_rarity" DEFAULT 'common' NOT NULL,
	"render_data" jsonb NOT NULL,
	"point_cost" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cosmetic_point_cost" CHECK ("cosmetic_items"."point_cost" is null or "cosmetic_items"."point_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "merch_items" (
	"merch_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"image_url" text,
	"point_cost" integer NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_merch_point_cost" CHECK ("merch_items"."point_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "merch_order_items" (
	"order_item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"merch_id" uuid NOT NULL,
	"variant_id" uuid,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"point_cost" integer NOT NULL,
	CONSTRAINT "chk_merch_order_items_quantity" CHECK ("merch_order_items"."quantity" > 0),
	CONSTRAINT "chk_merch_order_items_point_cost" CHECK ("merch_order_items"."point_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "merch_orders" (
	"order_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"points_spent" integer NOT NULL,
	"status" "merch_order_status" DEFAULT 'pending' NOT NULL,
	"shipping_name" varchar(200) NOT NULL,
	"shipping_address" text NOT NULL,
	"shipping_city" varchar(100) NOT NULL,
	"shipping_country" char(2) NOT NULL,
	"shipping_zip" varchar(20) NOT NULL,
	"tracking_number" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_merch_orders_points" CHECK ("merch_orders"."points_spent" > 0)
);
--> statement-breakpoint
CREATE TABLE "merch_variants" (
	"variant_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merch_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chk_merch_variant_stock" CHECK ("merch_variants"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"payment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"payment_provider" varchar(50) NOT NULL,
	"provider_payment_id" text NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_subscription_payments_amount" CHECK ("subscription_payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"subscription_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "subscription_plan" DEFAULT 'premium' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "chk_subscriptions_dates" CHECK ("subscriptions"."started_at" < "subscriptions"."ends_at"),
	CONSTRAINT "chk_subscriptions_cancelled_consistency" CHECK ("subscriptions"."cancelled_at" is null or "subscriptions"."status" = 'cancelled')
);
--> statement-breakpoint
CREATE TABLE "user_cosmetics" (
	"user_id" uuid NOT NULL,
	"cosmetic_id" uuid NOT NULL,
	"obtained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" varchar(50) NOT NULL,
	CONSTRAINT "user_cosmetics_user_id_cosmetic_id_pk" PRIMARY KEY("user_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE "user_equipped_cosmetics" (
	"user_id" uuid NOT NULL,
	"slot" "cosmetic_type" NOT NULL,
	"cosmetic_id" uuid NOT NULL,
	CONSTRAINT "user_equipped_cosmetics_user_id_slot_pk" PRIMARY KEY("user_id","slot")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"notification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(100) NOT NULL,
	"body" text,
	"entity_type" "entity_type",
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_notifications_entity_consistency" CHECK (("notifications"."entity_type" is null) = ("notifications"."entity_id" is null))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"report_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" "report_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_reports_review_consistency" CHECK (("reports"."reviewed_at" is null) = ("reports"."reviewed_by" is null)),
	CONSTRAINT "chk_reports_resolution_note" CHECK ("reports"."resolution_note" is null or "reports"."status" in ('resolved', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "administrators" ADD CONSTRAINT "administrators_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrators" ADD CONSTRAINT "administrators_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."administrators"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_a_members_user_id_fk" FOREIGN KEY ("user_id_a") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_b_members_user_id_fk" FOREIGN KEY ("user_id_b") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_members_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_reviewed_by_administrators_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."administrators"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_banned_by_administrators_user_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."administrators"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_lifted_by_administrators_user_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."administrators"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_skills" ADD CONSTRAINT "member_skills_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_skills" ADD CONSTRAINT "member_skills_skill_id_skills_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("skill_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_users_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_submissions" ADD CONSTRAINT "bounty_submissions_bounty_id_bounties_bounty_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("bounty_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_submissions" ADD CONSTRAINT "bounty_submissions_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_prizes" ADD CONSTRAINT "hackathon_prizes_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_prizes" ADD CONSTRAINT "hackathon_prizes_bounty_id_bounties_bounty_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("bounty_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_required_skills" ADD CONSTRAINT "hackathon_required_skills_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_required_skills" ADD CONSTRAINT "hackathon_required_skills_skill_id_skills_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("skill_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_results" ADD CONSTRAINT "hackathon_results_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_results" ADD CONSTRAINT "hackathon_results_bounty_id_bounties_bounty_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("bounty_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_results" ADD CONSTRAINT "hackathon_results_prize_id_hackathon_prizes_prize_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."hackathon_prizes"("prize_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathons" ADD CONSTRAINT "hackathons_organization_id_organizations_user_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_id_users_user_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD CONSTRAINT "kanban_boards_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_column_id_kanban_columns_column_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_columns"("column_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_created_by_members_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_assigned_to_members_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."members"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_board_id_kanban_boards_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."kanban_boards"("board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_groups" ADD CONSTRAINT "channel_groups_server_id_servers_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("server_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_message_id_messages_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_id_channels_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_group_id_channel_groups_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."channel_groups"("group_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_message_id_messages_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_deleted_by_users_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("message_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_role_permissions" ADD CONSTRAINT "server_role_permissions_server_role_id_server_roles_server_role_id_fk" FOREIGN KEY ("server_role_id") REFERENCES "public"."server_roles"("server_role_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_role_permissions" ADD CONSTRAINT "server_role_permissions_permission_id_permissions_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("permission_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_roles" ADD CONSTRAINT "server_roles_server_id_servers_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("server_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_server_role_id_server_roles_server_role_id_fk" FOREIGN KEY ("server_role_id") REFERENCES "public"."server_roles"("server_role_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_attachments" ADD CONSTRAINT "comment_attachments_comment_id_comments_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("comment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_comments_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("comment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("comment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_post_id_posts_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_game_id_games_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("game_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("badge_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD CONSTRAINT "merch_order_items_order_id_merch_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."merch_orders"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD CONSTRAINT "merch_order_items_merch_id_merch_items_merch_id_fk" FOREIGN KEY ("merch_id") REFERENCES "public"."merch_items"("merch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_order_items" ADD CONSTRAINT "merch_order_items_variant_id_merch_variants_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."merch_variants"("variant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_orders" ADD CONSTRAINT "merch_orders_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD CONSTRAINT "merch_variants_merch_id_merch_items_merch_id_fk" FOREIGN KEY ("merch_id") REFERENCES "public"."merch_items"("merch_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("subscription_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_cosmetic_id_cosmetic_items_cosmetic_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetic_items"("cosmetic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipped_cosmetics" ADD CONSTRAINT "user_equipped_cosmetics_user_id_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipped_cosmetics" ADD CONSTRAINT "user_equipped_cosmetics_cosmetic_id_cosmetic_items_cosmetic_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetic_items"("cosmetic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipped_cosmetics" ADD CONSTRAINT "fk_equipped_must_be_owned" FOREIGN KEY ("user_id","cosmetic_id") REFERENCES "public"."user_cosmetics"("user_id","cosmetic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_administrators_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."administrators"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_follows_followee_id" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "idx_friendships_user_id_b" ON "friendships" USING btree ("user_id_b");--> statement-breakpoint
CREATE INDEX "idx_friendships_requester" ON "friendships" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "idx_members_points" ON "members" USING btree ("points" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_organizations_name" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_user_bans_user_id" ON "user_bans" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_bans_active_per_user" ON "user_bans" USING btree ("user_id") WHERE "user_bans"."lifted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_github_id_nn" ON "users" USING btree ("github_id") WHERE "users"."github_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_google_id_nn" ON "users" USING btree ("google_id") WHERE "users"."google_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_linkedin_id_nn" ON "users" USING btree ("linkedin_id") WHERE "users"."linkedin_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_github_username" ON "users" USING btree ("github_username") WHERE "users"."github_username" is not null;--> statement-breakpoint
CREATE INDEX "idx_users_deleted" ON "users" USING btree ("deleted_at") WHERE "users"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "idx_member_skills_skill_id" ON "member_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_skills_name" ON "skills" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_applications_user_hackathon" ON "applications" USING btree ("user_id","hackathon_id") WHERE "applications"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_applications_user_id" ON "applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_applications_hackathon_id" ON "applications" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "idx_applications_hackathon_status" ON "applications" USING btree ("hackathon_id","status");--> statement-breakpoint
CREATE INDEX "idx_bounties_hackathon_id" ON "bounties" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "idx_bounty_submissions_project_id" ON "bounty_submissions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prizes_hackathon_rank" ON "hackathon_prizes" USING btree ("hackathon_id","rank") WHERE "hackathon_prizes"."bounty_id" is null and "hackathon_prizes"."rank" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prizes_bounty_rank" ON "hackathon_prizes" USING btree ("bounty_id","rank") WHERE "hackathon_prizes"."bounty_id" is not null and "hackathon_prizes"."rank" is not null;--> statement-breakpoint
CREATE INDEX "idx_hackathon_prizes_hackathon_id" ON "hackathon_prizes" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "idx_hackathon_required_skills_skill_id" ON "hackathon_required_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hackathon_results_project" ON "hackathon_results" USING btree ("project_id") WHERE "hackathon_results"."bounty_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hackathon_results_bounty" ON "hackathon_results" USING btree ("project_id","bounty_id") WHERE "hackathon_results"."bounty_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hackathon_results_bounty_rank" ON "hackathon_results" USING btree ("bounty_id","rank") WHERE "hackathon_results"."bounty_id" is not null and "hackathon_results"."rank" is not null;--> statement-breakpoint
CREATE INDEX "idx_hackathon_results_bounty_id" ON "hackathon_results" USING btree ("bounty_id") WHERE "hackathon_results"."bounty_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_hackathons_organization_id" ON "hackathons" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_hackathons_status" ON "hackathons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_hackathons_starts_at" ON "hackathons" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_hackathons_coordinates" ON "hackathons" USING gist ("coordinates");--> statement-breakpoint
CREATE INDEX "idx_projects_team_id" ON "projects" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_one_leader" ON "team_members" USING btree ("team_id") WHERE "team_members"."role" = 'leader' and "team_members"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_team_members_user_id" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_teams_name_per_hackathon" ON "teams" USING btree ("hackathon_id","name") WHERE "teams"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_teams_hackathon_id" ON "teams" USING btree ("hackathon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_votes_member_per_hackathon" ON "votes" USING btree ("hackathon_id","voter_id") WHERE "votes"."voter_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_votes_guest_per_hackathon" ON "votes" USING btree ("hackathon_id","voter_fingerprint") WHERE "votes"."voter_fingerprint" is not null;--> statement-breakpoint
CREATE INDEX "idx_votes_project_id" ON "votes" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kanban_boards_team" ON "kanban_boards" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kanban_cards_active_position" ON "kanban_cards" USING btree ("column_id","position") WHERE "kanban_cards"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_kanban_cards_column_id" ON "kanban_cards" USING btree ("column_id");--> statement-breakpoint
CREATE INDEX "idx_kanban_cards_assigned_to" ON "kanban_cards" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_kanban_columns_board_id" ON "kanban_columns" USING btree ("board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_groups_name_per_server" ON "channel_groups" USING btree ("server_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_groups_position_per_server" ON "channel_groups" USING btree ("server_id","position");--> statement-breakpoint
CREATE INDEX "idx_channel_groups_server_id" ON "channel_groups" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_channel_id" ON "channel_messages" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channels_name_per_group" ON "channels" USING btree ("group_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channels_active_position_per_group" ON "channels" USING btree ("group_id","position") WHERE "channels"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_channels_group_id" ON "channels" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_members_user_id" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_direct_messages_conversation_id" ON "direct_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_message_attachments_message_id" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_reactions_message_id" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_messages_sender_id" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_messages_sent_at" ON "messages" USING btree ("sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_permissions_name" ON "permissions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_server_role_permissions_permission_id" ON "server_role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_server_roles_name_per_server" ON "server_roles" USING btree ("server_id","name");--> statement-breakpoint
CREATE INDEX "idx_server_roles_server_id" ON "server_roles" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_servers_hackathon" ON "servers" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_id" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_comment_attachments_comment_id" ON "comment_attachments" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "idx_comment_reactions_comment_id" ON "comment_reactions" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "idx_comments_post_id" ON "comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_comments_user_id" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_comments_parent_comment_id" ON "comments" USING btree ("parent_comment_id") WHERE "comments"."parent_comment_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_post_attachments_post_id" ON "post_attachments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_post_reactions_post_id" ON "post_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_posts_user_id" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_posts_created_at" ON "posts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_badges_name" ON "badges" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_game_plays_user_id" ON "game_plays" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_game_plays_game_user_day" ON "game_plays" USING btree ("game_id","user_id","played_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_game_plays_leaderboard" ON "game_plays" USING btree ("game_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_games_slug" ON "games" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_games_name" ON "games" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_games_active" ON "games" USING btree ("is_active") WHERE "games"."is_active";--> statement-breakpoint
CREATE INDEX "idx_point_transactions_user_id" ON "point_transactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_user_badges_badge_id" ON "user_badges" USING btree ("badge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cosmetic_items_name" ON "cosmetic_items" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_merch_items_name" ON "merch_items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_merch_order_items_order_id" ON "merch_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_merch_orders_user_id" ON "merch_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_merch_orders_status" ON "merch_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_merch_variants_per_item" ON "merch_variants" USING btree ("merch_id","label");--> statement-breakpoint
CREATE INDEX "idx_merch_variants_merch_id" ON "merch_variants" USING btree ("merch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscription_payments_provider_id" ON "subscription_payments" USING btree ("payment_provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_payments_subscription_id" ON "subscription_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_active" ON "subscriptions" USING btree ("user_id","status") WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_user_cosmetics_cosmetic_id" ON "user_cosmetics" USING btree ("cosmetic_id");--> statement-breakpoint
CREATE INDEX "idx_user_equipped_cosmetics_cosmetic_id" ON "user_equipped_cosmetics" USING btree ("cosmetic_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_unread" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reports_reporter_target" ON "reports" USING btree ("reporter_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_reports_status" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_reports_reporter_id" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "idx_reports_target" ON "reports" USING btree ("target_type","target_id");