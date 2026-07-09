import { describe, expect, it } from "vitest";
import {
  createChannelSchema,
  createConversationSchema,
  editMessageSchema,
  sendChannelMessageSchema,
  toggleReactionSchema,
  updateServerSchema,
} from "../../src/chat/dto";

const UUID = "11111111-1111-1111-1111-111111111111";

/* ── Dopisivanje: slanje poruke ──────────────────────────────── */

describe("sendChannelMessageSchema", () => {
  it("accepts a plain text message and defaults attachments to []", () => {
    const r = sendChannelMessageSchema.safeParse({ content: "Zdravo tim!" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.attachments).toEqual([]);
  });

  it("accepts an attachment-only message (empty content)", () => {
    const r = sendChannelMessageSchema.safeParse({
      attachments: ["/uploads/slika.png"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a message with neither text nor attachment", () => {
    expect(sendChannelMessageSchema.safeParse({}).success).toBe(false);
  });

  it("rejects content longer than 4000 characters", () => {
    expect(sendChannelMessageSchema.safeParse({ content: "a".repeat(4001) }).success).toBe(false);
  });

  it("rejects a non-UUID replyToId", () => {
    expect(sendChannelMessageSchema.safeParse({ content: "hi", replyToId: "42" }).success).toBe(
      false,
    );
  });

  it("rejects more than 10 attachments", () => {
    expect(
      sendChannelMessageSchema.safeParse({
        attachments: Array(11).fill("/uploads/x.png"),
      }).success,
    ).toBe(false);
  });
});

/* ── Poruke: izmena i reakcije ───────────────────────────────── */

describe("editMessageSchema", () => {
  it("accepts non-empty content", () => {
    expect(editMessageSchema.safeParse({ content: "izmenjeno" }).success).toBe(true);
  });

  it("rejects empty content (edit cannot blank a message)", () => {
    expect(editMessageSchema.safeParse({ content: "" }).success).toBe(false);
  });
});

describe("toggleReactionSchema", () => {
  it("accepts a short emoji symbol", () => {
    expect(toggleReactionSchema.safeParse({ symbol: "👍" }).success).toBe(true);
  });

  it("rejects a symbol longer than 8 characters", () => {
    expect(toggleReactionSchema.safeParse({ symbol: "toolongsymbol" }).success).toBe(false);
  });
});

/* ── Grupna ćaskanja: kreiranje konverzacije ─────────────────── */

describe("createConversationSchema", () => {
  it("accepts a group with one member id", () => {
    expect(createConversationSchema.safeParse({ memberIds: [UUID] }).success).toBe(true);
  });

  it("rejects an empty member list", () => {
    expect(createConversationSchema.safeParse({ memberIds: [] }).success).toBe(false);
  });

  it("rejects a non-UUID member id", () => {
    expect(createConversationSchema.safeParse({ memberIds: ["nije-uuid"] }).success).toBe(false);
  });

  it("rejects more than 20 members", () => {
    expect(createConversationSchema.safeParse({ memberIds: Array(21).fill(UUID) }).success).toBe(
      false,
    );
  });
});

/* ── Serveri za komunikaciju: kanali i podešavanja ───────────── */

describe("createChannelSchema", () => {
  const base = { groupId: UUID, name: "opšte" };

  it("accepts a valid channel with a known type", () => {
    expect(createChannelSchema.safeParse({ ...base, type: "announcements" }).success).toBe(true);
  });

  it("rejects an unknown channel type", () => {
    expect(createChannelSchema.safeParse({ ...base, type: "voice" }).success).toBe(false);
  });

  it("rejects an empty channel name", () => {
    expect(createChannelSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
});

describe("updateServerSchema", () => {
  it("accepts a rename", () => {
    expect(updateServerSchema.safeParse({ name: "Novi naziv" }).success).toBe(true);
  });

  it("allows clearing the logo with null", () => {
    expect(updateServerSchema.safeParse({ logoUrl: null }).success).toBe(true);
  });

  it("rejects an empty patch (no field provided)", () => {
    expect(updateServerSchema.safeParse({}).success).toBe(false);
  });
});
