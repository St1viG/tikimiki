import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatController } from "../../src/chat/chat.controller";
import type { ChatService } from "../../src/chat/chat.service";

/**
 * Controller unit tests — the service is fully mocked, so no DB is needed.
 * We assert that each endpoint forwards the right arguments to the service
 * and returns the service's result unchanged (delegation contract).
 */
describe("ChatController (unit)", () => {
  const USER = "user-1";
  let chat: Record<string, ReturnType<typeof vi.fn>>;
  let controller: ChatController;

  beforeEach(() => {
    chat = {
      listServers: vi.fn().mockReturnValue(["s1"]),
      createChannel: vi.fn().mockReturnValue({ channelId: "c1" }),
      createConversation: vi.fn().mockReturnValue({ conversationId: "cv1" }),
      sendConversationMessage: vi.fn().mockReturnValue({ messageId: "m1" }),
      toggleReaction: vi.fn().mockReturnValue({ toggled: true }),
    };
    controller = new ChatController(chat as unknown as ChatService);
  });

  it("listServers forwards the current user id and returns the result", () => {
    const result = controller.listServers(USER);
    expect(chat.listServers).toHaveBeenCalledWith(USER);
    expect(result).toEqual(["s1"]);
  });

  it("createChannel forwards serverId, userId and the body", () => {
    const body = { groupId: "g1", name: "opšte" } as never;
    controller.createChannel(USER, "server-1", body);
    expect(chat.createChannel).toHaveBeenCalledWith("server-1", USER, body);
  });

  it("createConversation spreads memberIds, name and icon (group chat)", () => {
    const body = { memberIds: ["u2", "u3"], name: "Ekipa", icon: "🚀" } as never;
    controller.createConversation(USER, body);
    expect(chat.createConversation).toHaveBeenCalledWith(
      USER,
      ["u2", "u3"],
      "Ekipa",
      "🚀",
    );
  });

  it("sendConversationMessage forwards content, replyToId and attachments", () => {
    const body = {
      content: "Zdravo",
      replyToId: undefined,
      attachments: [],
    } as never;
    const result = controller.sendConversationMessage(USER, "cv-1", body);
    expect(chat.sendConversationMessage).toHaveBeenCalledWith(
      USER,
      "cv-1",
      "Zdravo",
      undefined,
      [],
    );
    expect(result).toEqual({ messageId: "m1" });
  });

  it("toggleReaction forwards userId, messageId and symbol", () => {
    controller.toggleReaction(USER, "msg-1", { symbol: "👍" } as never);
    expect(chat.toggleReaction).toHaveBeenCalledWith(USER, "msg-1", "👍");
  });
});
