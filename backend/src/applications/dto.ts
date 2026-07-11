/**
 * Autor: Andrej Colić (2023/0492)
 */
import { z } from "zod";

export const createApplicationSchema = z.object({
  hackathonId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        answer: z.string().max(5000),
      }),
    )
    .optional(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
});
export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;

export const withdrawApplicationSchema = z.object({});
export type WithdrawApplicationInput = z.infer<typeof withdrawApplicationSchema>;

export const createTeamApplicationSchema = z.object({
  hackathonId: z.string().uuid(),
  teamId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        answer: z.string().max(5000),
      }),
    )
    .optional(),
});
export type CreateTeamApplicationInput = z.infer<typeof createTeamApplicationSchema>;

export const questionType = z.enum(["short_text", "long_text", "single_choice", "multi_choice"]);

export const createQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  type: questionType.default("short_text"),
  options: z.array(z.string().trim().min(1).max(200)).optional(),
  required: z.boolean().default(false),
  /** Choice questions only: offer an "Other" choice with a free-text field. */
  allowOther: z.boolean().default(false),
  position: z.number().int().min(0).optional(),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/**
 * Body for `PATCH /applications/questions/:questionId`. Every field is
 * optional; only provided fields are updated. Same `options`-required-for-
 * choice-types constraint as create, enforced in the service against the
 * effective (merged) type.
 */
export const updateQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1).max(500).optional(),
    type: questionType.optional(),
    options: z.array(z.string().trim().min(1).max(200)).optional(),
    required: z.boolean().optional(),
    allowOther: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

/**
 * Normalises a query parameter that may arrive as a single string, a repeated
 * key (`?skills=a&skills=b`) or a comma-separated list (`?skills=a,b`) into a
 * clean, de-blanked `string[]`.
 */
const stringList = z.union([z.string(), z.array(z.string())]).transform((value) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0),
);

/** How `GET /applications/hackathon/:hackathonId` orders its applicants. */
export const applicantSortOptions = ["recent", "skills", "github"] as const;

/**
 * Query for `GET /applications/hackathon/:hackathonId`. `skills` narrows to
 * applicants who have at least one of the given skills (case-insensitive
 * name match); `githubVerified` narrows to applicants who do (`true`) or
 * don't (`false`) have at least one GitHub-verified skill.
 */
export const applicantFilterSchema = z.object({
  skills: stringList.optional(),
  githubVerified: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sortBy: z.enum(applicantSortOptions).default("recent"),
});
export type ApplicantFilterInput = z.infer<typeof applicantFilterSchema>;
