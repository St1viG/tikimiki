import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  addMembersSchema,
  createChannelSchema,
  createConversationSchema,
  createGroupSchema,
  editMessageSchema,
  sendChannelMessageSchema,
  sendDirectMessageSchema,
  toggleReactionSchema,
  updateChannelSchema,
  updateConversationSchema,
  updateServerSchema,
  type AddMembersInput,
  type CreateChannelInput,
  type CreateConversationInput,
  type CreateGroupInput,
  type EditMessageInput,
  type SendChannelMessageInput,
  type SendDirectMessageInput,
  type ToggleReactionInput,
  type UpdateChannelInput,
  type UpdateConversationInput,
  type UpdateServerInput,
} from "./dto";
import { ChatService } from "./chat.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /* ── Servers ────────────────────────────────────────────── */

  @Get("servers")
  listServers(@CurrentUser() userId: string) {
    return this.chat.listServers(userId);
  }

  @Get("servers/:serverId")
  getServer(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
  ) {
    return this.chat.getServerDetail(serverId, userId);
  }

  @Get("servers/:serverId/members")
  listServerMembers(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
  ) {
    return this.chat.listServerMembers(serverId, userId);
  }

  @Patch("servers/:serverId")
  updateServer(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Body(new ZodValidationPipe(updateServerSchema)) body: UpdateServerInput,
  ) {
    return this.chat.updateServer(serverId, userId, body);
  }

  @Post("servers/:serverId/groups")
  createGroup(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Body(new ZodValidationPipe(createGroupSchema)) body: CreateGroupInput,
  ) {
    return this.chat.createGroup(serverId, userId, body.name);
  }

  @Post("servers/:serverId/channels")
  createChannel(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelInput,
  ) {
    return this.chat.createChannel(serverId, userId, body);
  }

  /* ── Channels ───────────────────────────────────────────── */

  @Patch("channels/:channelId")
  updateChannel(
    @CurrentUser() userId: string,
    @Param("channelId", new ParseUUIDPipe()) channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
  ) {
    return this.chat.updateChannel(channelId, userId, body.name);
  }

  @Delete("channels/:channelId")
  deleteChannel(
    @CurrentUser() userId: string,
    @Param("channelId", new ParseUUIDPipe()) channelId: string,
  ) {
    return this.chat.deleteChannel(channelId, userId);
  }

  /* ── Channel messages ───────────────────────────────────── */

  @Get("channels/:channelId/messages")
  listChannelMessages(
    @CurrentUser() userId: string,
    @Param("channelId", new ParseUUIDPipe()) channelId: string,
  ) {
    return this.chat.listChannelMessages(channelId, userId);
  }

  @Post("channels/:channelId/messages")
  sendChannelMessage(
    @CurrentUser() userId: string,
    @Param("channelId", new ParseUUIDPipe()) channelId: string,
    @Body(new ZodValidationPipe(sendChannelMessageSchema))
    body: SendChannelMessageInput,
  ) {
    return this.chat.sendChannelMessage(
      userId,
      channelId,
      body.content,
      body.replyToId,
      body.attachments,
    );
  }

  /* ── Reactions ──────────────────────────────────────────── */

  @Post("messages/:messageId/reactions")
  toggleReaction(
    @CurrentUser() userId: string,
    @Param("messageId", new ParseUUIDPipe()) messageId: string,
    @Body(new ZodValidationPipe(toggleReactionSchema))
    body: ToggleReactionInput,
  ) {
    return this.chat.toggleReaction(userId, messageId, body.symbol);
  }

  @Patch("messages/:messageId")
  editMessage(
    @CurrentUser() userId: string,
    @Param("messageId", new ParseUUIDPipe()) messageId: string,
    @Body(new ZodValidationPipe(editMessageSchema)) body: EditMessageInput,
  ) {
    return this.chat.editMessage(userId, messageId, body.content);
  }

  @Delete("messages/:messageId")
  deleteMessage(
    @CurrentUser() userId: string,
    @Param("messageId", new ParseUUIDPipe()) messageId: string,
  ) {
    return this.chat.deleteMessage(messageId, userId);
  }

  /* ── Conversations ──────────────────────────────────────── */

  @Get("conversations")
  listConversations(@CurrentUser() userId: string) {
    return this.chat.listConversations(userId);
  }

  @Post("conversations")
  createConversation(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createConversationSchema))
    body: CreateConversationInput,
  ) {
    return this.chat.createConversation(
      userId,
      body.memberIds,
      body.name,
      body.icon,
    );
  }

  @Patch("conversations/:conversationId")
  updateConversation(
    @CurrentUser() userId: string,
    @Param("conversationId", new ParseUUIDPipe()) conversationId: string,
    @Body(new ZodValidationPipe(updateConversationSchema))
    body: UpdateConversationInput,
  ) {
    return this.chat.updateConversation(userId, conversationId, body);
  }

  @Post("conversations/:conversationId/members")
  addConversationMembers(
    @CurrentUser() userId: string,
    @Param("conversationId", new ParseUUIDPipe()) conversationId: string,
    @Body(new ZodValidationPipe(addMembersSchema)) body: AddMembersInput,
  ) {
    return this.chat.addConversationMembers(userId, conversationId, body.userIds);
  }

  @Get("conversations/:conversationId/messages")
  listConversationMessages(
    @CurrentUser() userId: string,
    @Param("conversationId", new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.chat.listConversationMessages(userId, conversationId);
  }

  @Post("conversations/:conversationId/messages")
  sendConversationMessage(
    @CurrentUser() userId: string,
    @Param("conversationId", new ParseUUIDPipe()) conversationId: string,
    @Body(new ZodValidationPipe(sendDirectMessageSchema))
    body: SendDirectMessageInput,
  ) {
    return this.chat.sendConversationMessage(
      userId,
      conversationId,
      body.content,
      body.replyToId,
      body.attachments,
    );
  }

  @Post("conversations/:conversationId/read")
  markRead(
    @CurrentUser() userId: string,
    @Param("conversationId", new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.chat.markConversationRead(userId, conversationId);
  }

  /* ── Active hackathon ───────────────────────────────────── */

  @Get("me/active-hackathon")
  activeHackathon(@CurrentUser() userId: string) {
    return this.chat.getMyActiveHackathon(userId);
  }
}
