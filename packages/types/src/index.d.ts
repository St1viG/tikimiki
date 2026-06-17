/**
 * @tikimiki/types — canonical domain enums shared by the Next.js frontend and
 * the NestJS backend. Mirrors the v4.3 database schema
 * (docs/database_specification/database_logical_model/database_sql.md).
 *
 * Each enum is exported as a `const` tuple (usable at runtime, e.g. for Zod /
 * select options) plus a derived union type. Keep this in lock-step with the
 * Postgres ENUMs in backend/src/db/schema/_enums.ts.
 */
export * from "./auth";
export * from "./hackathon";
export * from "./feed";
export declare const ORG_VERIFICATION_STATUS: ["pending", "approved", "rejected"];
export type OrgVerificationStatus = (typeof ORG_VERIFICATION_STATUS)[number];
export declare const HACKATHON_TYPE: ["physical", "virtual", "hybrid"];
export type HackathonType = (typeof HACKATHON_TYPE)[number];
export declare const HACKATHON_STATUS: ["upcoming", "ongoing", "finished", "cancelled"];
export type HackathonStatus = (typeof HACKATHON_STATUS)[number];
export declare const TEAM_ROLE: ["leader", "member"];
export type TeamRole = (typeof TEAM_ROLE)[number];
export declare const APPLICATION_STATUS: ["pending", "approved", "rejected", "waitlisted", "withdrawn"];
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];
export declare const PROJECT_STATUS: ["draft", "submitted", "under_review", "judged"];
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export declare const CHANNEL_TYPE: ["general", "announcements", "team", "private"];
export type ChannelType = (typeof CHANNEL_TYPE)[number];
export declare const BADGE_CATEGORY: ["participation", "achievement", "social", "special"];
export type BadgeCategory = (typeof BADGE_CATEGORY)[number];
export declare const COSMETIC_TYPE: ["username_effect", "avatar_decoration", "banner_effect"];
export type CosmeticType = (typeof COSMETIC_TYPE)[number];
export declare const COSMETIC_RARITY: ["common", "rare", "epic", "legendary"];
export type CosmeticRarity = (typeof COSMETIC_RARITY)[number];
export declare const MERCH_ORDER_STATUS: ["pending", "processing", "shipped", "delivered", "cancelled"];
export type MerchOrderStatus = (typeof MERCH_ORDER_STATUS)[number];
export declare const FRIENDSHIP_STATUS: ["pending", "accepted"];
export type FriendshipStatus = (typeof FRIENDSHIP_STATUS)[number];
export declare const POINT_TXN_TYPE: ["game_reward", "badge_award", "hackathon_placement", "bounty_placement", "merch_purchase", "premium_purchase", "admin_adjustment"];
export type PointTxnType = (typeof POINT_TXN_TYPE)[number];
export declare const SUBSCRIPTION_PLAN: ["premium"];
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLAN)[number];
export declare const SUBSCRIPTION_STATUS: ["active", "cancelled", "expired"];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];
export declare const REPORT_TARGET_TYPE: ["user", "post", "comment", "message", "hackathon"];
export type ReportTargetType = (typeof REPORT_TARGET_TYPE)[number];
export declare const REPORT_STATUS: ["pending", "reviewed", "resolved", "dismissed"];
export type ReportStatus = (typeof REPORT_STATUS)[number];
export declare const ENTITY_TYPE: ["user", "hackathon", "application", "team", "project", "post", "comment", "badge", "message", "bounty", "game"];
export type EntityType = (typeof ENTITY_TYPE)[number];
export declare const NOTIFICATION_TYPE: ["application_approved", "application_rejected", "application_waitlisted", "badge_awarded", "hackathon_result_posted", "hackathon_starting_soon", "organization_verified", "organization_rejected", "new_direct_message", "position_assigned", "bounty_result_posted", "merch_order_shipped", "new_follower", "friend_request_received", "friend_request_accepted"];
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];
