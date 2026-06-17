"use strict";
/**
 * @tikimiki/types — canonical domain enums shared by the Next.js frontend and
 * the NestJS backend. Mirrors the v4.3 database schema
 * (docs/database_specification/database_logical_model/database_sql.md).
 *
 * Each enum is exported as a `const` tuple (usable at runtime, e.g. for Zod /
 * select options) plus a derived union type. Keep this in lock-step with the
 * Postgres ENUMs in backend/src/db/schema/_enums.ts.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATION_TYPE = exports.ENTITY_TYPE = exports.REPORT_STATUS = exports.REPORT_TARGET_TYPE = exports.SUBSCRIPTION_STATUS = exports.SUBSCRIPTION_PLAN = exports.POINT_TXN_TYPE = exports.FRIENDSHIP_STATUS = exports.MERCH_ORDER_STATUS = exports.COSMETIC_RARITY = exports.COSMETIC_TYPE = exports.BADGE_CATEGORY = exports.CHANNEL_TYPE = exports.PROJECT_STATUS = exports.APPLICATION_STATUS = exports.TEAM_ROLE = exports.HACKATHON_STATUS = exports.HACKATHON_TYPE = exports.ORG_VERIFICATION_STATUS = void 0;
__exportStar(require("./auth"), exports);
__exportStar(require("./hackathon"), exports);
__exportStar(require("./feed"), exports);
const tuple = (...v) => v;
exports.ORG_VERIFICATION_STATUS = tuple("pending", "approved", "rejected");
exports.HACKATHON_TYPE = tuple("physical", "virtual", "hybrid");
exports.HACKATHON_STATUS = tuple("upcoming", "ongoing", "finished", "cancelled");
exports.TEAM_ROLE = tuple("leader", "member");
exports.APPLICATION_STATUS = tuple("pending", "approved", "rejected", "waitlisted", "withdrawn");
exports.PROJECT_STATUS = tuple("draft", "submitted", "under_review", "judged");
exports.CHANNEL_TYPE = tuple("general", "announcements", "team", "private");
exports.BADGE_CATEGORY = tuple("participation", "achievement", "social", "special");
exports.COSMETIC_TYPE = tuple("username_effect", "avatar_decoration", "banner_effect");
exports.COSMETIC_RARITY = tuple("common", "rare", "epic", "legendary");
exports.MERCH_ORDER_STATUS = tuple("pending", "processing", "shipped", "delivered", "cancelled");
exports.FRIENDSHIP_STATUS = tuple("pending", "accepted");
exports.POINT_TXN_TYPE = tuple("game_reward", "badge_award", "hackathon_placement", "bounty_placement", "merch_purchase", "premium_purchase", "admin_adjustment");
exports.SUBSCRIPTION_PLAN = tuple("premium");
exports.SUBSCRIPTION_STATUS = tuple("active", "cancelled", "expired");
exports.REPORT_TARGET_TYPE = tuple("user", "post", "comment", "message", "hackathon");
exports.REPORT_STATUS = tuple("pending", "reviewed", "resolved", "dismissed");
exports.ENTITY_TYPE = tuple("user", "hackathon", "application", "team", "project", "post", "comment", "badge", "message", "bounty", "game");
exports.NOTIFICATION_TYPE = tuple("application_approved", "application_rejected", "application_waitlisted", "badge_awarded", "hackathon_result_posted", "hackathon_starting_soon", "organization_verified", "organization_rejected", "new_direct_message", "position_assigned", "bounty_result_posted", "merch_order_shipped", "new_follower", "friend_request_received", "friend_request_accepted");
