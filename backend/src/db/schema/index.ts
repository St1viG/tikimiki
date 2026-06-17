/**
 * Drizzle schema barrel — single source consumed by db.module and drizzle-kit.
 *
 * Full v4.3 schema (59 tables) ported, grouped by domain:
 *   identity     — users, administrators, members, organizations, user_bans,
 *                  follows, friendships
 *   skills       — skills, member_skills
 *   hackathons   — hackathons, hackathon_required_skills, bounties,
 *                  hackathon_prizes, teams, team_members, applications,
 *                  projects, hackathon_results, bounty_submissions, votes
 *   kanban       — kanban_boards, kanban_columns, kanban_cards
 *   cohor        — servers, server_roles, permissions, server_role_permissions,
 *                  user_roles, channel_groups, channels, messages,
 *                  message_attachments, channel_messages, conversations,
 *                  conversation_members, direct_messages, message_reactions
 *   feed         — posts, post_attachments, post_reactions, comments,
 *                  comment_attachments, comment_reactions
 *   gamification — badges, user_badges, games, game_plays, point_transactions
 *   commerce     — cosmetic_items, user_cosmetics, user_equipped_cosmetics,
 *                  merch_items, merch_variants, merch_orders, merch_order_items,
 *                  subscriptions, subscription_payments
 *   platform     — reports, notifications
 */

export * from "./_enums";
export * from "./identity";
export * from "./skills";
export * from "./hackathons";
export * from "./application_form";
export * from "./team_requests";
export * from "./kanban";
export * from "./cohor";
export * from "./feed";
export * from "./gamification";
export * from "./commerce";
export * from "./platform";
