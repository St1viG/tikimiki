/**
 * Autor: Andrej Colić (2023/0492)
 */
import { describe, expect, it } from "vitest";
import {
  applicantFilterSchema,
  createApplicationSchema,
  createQuestionSchema,
  rejectApplicationSchema,
  updateQuestionSchema,
} from "../../src/applications/dto";

const UUID = "33333333-3333-3333-3333-333333333333";

/* ── Prijava na hakaton ──────────────────────────────────────── */

describe("createApplicationSchema", () => {
  it("accepts a solo application with just a hackathon id", () => {
    expect(createApplicationSchema.safeParse({ hackathonId: UUID }).success).toBe(true);
  });

  it("accepts an application with answers", () => {
    const r = createApplicationSchema.safeParse({
      hackathonId: UUID,
      answers: [{ questionId: UUID, answer: "Moj odgovor" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing hackathon id", () => {
    expect(createApplicationSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-UUID hackathon id", () => {
    expect(createApplicationSchema.safeParse({ hackathonId: "abc" }).success).toBe(false);
  });

  it("rejects an answer longer than 5000 characters", () => {
    expect(
      createApplicationSchema.safeParse({
        hackathonId: UUID,
        answers: [{ questionId: UUID, answer: "a".repeat(5001) }],
      }).success,
    ).toBe(false);
  });
});

/* ── Pitanja u formi za prijavu ──────────────────────────────── */

describe("createQuestionSchema", () => {
  it("defaults type to short_text and required to false", () => {
    const r = createQuestionSchema.safeParse({ prompt: "Vaše ime?" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe("short_text");
      expect(r.data.required).toBe(false);
    }
  });

  it("accepts a choice question with options", () => {
    expect(
      createQuestionSchema.safeParse({
        prompt: "Nivo iskustva?",
        type: "single_choice",
        options: ["Početnik", "Napredni"],
      }).success,
    ).toBe(true);
  });

  it("rejects an empty prompt", () => {
    expect(createQuestionSchema.safeParse({ prompt: "" }).success).toBe(false);
  });

  it("rejects an unknown question type", () => {
    expect(createQuestionSchema.safeParse({ prompt: "x", type: "rating" }).success).toBe(false);
  });
});

describe("updateQuestionSchema", () => {
  it("accepts a single-field update", () => {
    expect(updateQuestionSchema.safeParse({ required: true }).success).toBe(true);
  });

  it("rejects an empty patch (no field provided)", () => {
    expect(updateQuestionSchema.safeParse({}).success).toBe(false);
  });
});

/* ── Odbijanje prijave ───────────────────────────────────────── */

describe("rejectApplicationSchema", () => {
  it("accepts an optional reason", () => {
    expect(rejectApplicationSchema.safeParse({ reason: "Nepotpuna prijava" }).success).toBe(true);
  });

  it("accepts a rejection with no reason", () => {
    expect(rejectApplicationSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a reason longer than 2000 characters", () => {
    expect(rejectApplicationSchema.safeParse({ reason: "a".repeat(2001) }).success).toBe(false);
  });
});

/* ── Filter/sort prijavljenih ────────────────────────────────── */

describe("applicantFilterSchema", () => {
  it("defaults sortBy to recent with no filters", () => {
    const r = applicantFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe("recent");
      expect(r.data.skills).toBeUndefined();
      expect(r.data.githubVerified).toBeUndefined();
    }
  });

  it("splits a comma-separated skills list and trims entries", () => {
    const r = applicantFilterSchema.safeParse({ skills: "React, Go ,SQL" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.skills).toEqual(["React", "Go", "SQL"]);
  });

  it("accepts a repeated skills query key as an array", () => {
    const r = applicantFilterSchema.safeParse({ skills: ["React", "Go"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.skills).toEqual(["React", "Go"]);
  });

  it("parses githubVerified=true/false to a boolean", () => {
    const t = applicantFilterSchema.safeParse({ githubVerified: "true" });
    const f = applicantFilterSchema.safeParse({ githubVerified: "false" });
    expect(t.success && t.data.githubVerified).toBe(true);
    expect(f.success && f.data.githubVerified).toBe(false);
  });

  it("rejects a non-boolean githubVerified value", () => {
    expect(applicantFilterSchema.safeParse({ githubVerified: "yes" }).success).toBe(false);
  });

  it("rejects an unknown sortBy value", () => {
    expect(applicantFilterSchema.safeParse({ sortBy: "oldest" }).success).toBe(false);
  });

  it("accepts each documented sortBy option", () => {
    for (const sortBy of ["recent", "skills", "github"]) {
      expect(applicantFilterSchema.safeParse({ sortBy }).success).toBe(true);
    }
  });
});
