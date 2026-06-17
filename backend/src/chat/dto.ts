import { z } from "zod";

/** Up to 10 attachment URLs (relative upload paths or absolute), image/video. */
const attachmentUrls = z
  .array(z.string().trim().min(1).max(500))
  .max(10)
  .optional()
  .default([]);

/** Body for posting a channel message or a direct message. Content may be empty
 *  when the message carries at least one attachment. */
export const sendChannelMessageSchema = z
  .object({
    content: z.string().trim().max(4000).optional().default(""),
    replyToId: z.string().uuid().optional(),
    attachments: attachmentUrls,
  })
  .refine((b) => b.content.length > 0 || b.attachments.length > 0, {
    message: "Message must have text or an attachment",
  });
export type SendChannelMessageInput = z.infer<typeof sendChannelMessageSchema>;

/** Body for posting a direct (conversation) message. */
export const sendDirectMessageSchema = z
  .object({
    content: z.string().trim().max(4000).optional().default(""),
    replyToId: z.string().uuid().optional(),
    attachments: attachmentUrls,
  })
  .refine((b) => b.content.length > 0 || b.attachments.length > 0, {
    message: "Message must have text or an attachment",
  });
export type SendDirectMessageInput = z.infer<typeof sendDirectMessageSchema>;

/** Body for editing a message's content. */
export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

/** Body for toggling a reaction on a message. */
export const toggleReactionSchema = z.object({
  symbol: z.string().trim().min(1).max(8),
});
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;

/** Body for creating a conversation. */
export const createConversationSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(20),
  name: z.string().trim().min(1).max(100).optional(),
  icon: z.string().trim().min(1).max(512).optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

/** Body for editing a group conversation's name / icon (null clears). */
export const updateConversationSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  icon: z.string().trim().min(1).max(512).nullable().optional(),
});
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

/** Body for adding members to a conversation. */
export const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(20),
});
export type AddMembersInput = z.infer<typeof addMembersSchema>;

/* ── Server / channel moderation ─────────────────────────────── */

/** Body for editing a server's settings (manage_server). All fields optional;
 *  null clears logo/banner. */
export const updateServerSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    logoUrl: z.string().trim().min(1).max(2000).nullable().optional(),
    bannerUrl: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.logoUrl !== undefined ||
      b.bannerUrl !== undefined,
    { message: "Provide at least one field to update" },
  );
export type UpdateServerInput = z.infer<typeof updateServerSchema>;

/** Body for creating a channel group. */
export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/** Body for creating a channel. `team` is rejected (needs a teamId). */
export const createChannelSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  type: z.enum(["general", "announcements", "private", "project", "kanban"]).optional(),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/** Body for editing a channel. */
export const updateChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
