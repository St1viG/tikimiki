import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Postgres ENUM types — mirror of the v4.3 schema
 * (docs/database_specification/database_logical_model/database_sql.md).
 * Keep in lock-step with packages/types/src/index.ts.
 */

export const orgVerificationStatus = pgEnum("org_verification_status", [
  "pending",
  "approved",
  "rejected",
]);

export const hackathonType = pgEnum("hackathon_type", ["physical", "virtual", "hybrid"]);

export const hackathonStatus = pgEnum("hackathon_status", [
  "upcoming",
  "ongoing",
  "finished",
  "cancelled",
]);

export const teamRole = pgEnum("team_role", ["leader", "member"]);

export const applicationStatus = pgEnum("application_status", [
  "pending",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
]);

export const projectStatus = pgEnum("project_status", [
  "draft",
  "submitted",
  "under_review",
  "judged",
]);

export const channelType = pgEnum("channel_type", [
  "general",
  "announcements",
  "team",
  "private",
  "project",
  "kanban",
]);

export const badgeCategory = pgEnum("badge_category", [
  "participation",
  "achievement",
  "social",
  "special",
]);

export const cosmeticType = pgEnum("cosmetic_type", [
  "username_effect",
  "avatar_decoration",
  "banner_effect",
]);

export const cosmeticRarity = pgEnum("cosmetic_rarity", ["common", "rare", "epic", "legendary"]);

export const merchOrderStatus = pgEnum("merch_order_status", [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

export const friendshipStatus = pgEnum("friendship_status", ["pending", "accepted"]);

export const pointTxnType = pgEnum("point_txn_type", [
  "game_reward",
  "badge_award",
  "hackathon_placement",
  "bounty_placement",
  "merch_purchase",
  "premium_purchase",
  "admin_adjustment",
]);

export const subscriptionPlan = pgEnum("subscription_plan", ["premium"]);

export const subscriptionStatus = pgEnum("subscription_status", ["active", "cancelled", "expired"]);

export const reportTargetType = pgEnum("report_target_type", [
  "user",
  "post",
  "comment",
  "message",
  "hackathon",
]);

export const reportStatus = pgEnum("report_status", [
  "pending",
  "reviewed",
  "resolved",
  "dismissed",
]);

export const entityType = pgEnum("entity_type", [
  "user",
  "hackathon",
  "application",
  "team",
  "project",
  "post",
  "comment",
  "badge",
  "message",
  "bounty",
  "game",
]);

export const notificationType = pgEnum("notification_type", [
  "application_approved",
  "application_rejected",
  "application_waitlisted",
  "badge_awarded",
  "hackathon_result_posted",
  "hackathon_starting_soon",
  "organization_verified",
  "organization_rejected",
  "new_direct_message",
  "position_assigned",
  "bounty_result_posted",
  "merch_order_shipped",
  "new_follower",
  "friend_request_received",
  "friend_request_accepted",
  "team_invitation_received",
  "team_request_received",
  "team_request_accepted",
  "post_comment",
  "post_reaction",
  "mention",
  "new_application",
]);

export const appealStatus = pgEnum("appeal_status", ["pending", "approved", "rejected"]);

export const profileVisibility = pgEnum("profile_visibility", ["all", "members", "none"]);
