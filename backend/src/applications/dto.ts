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

export const questionType = z.enum([
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
]);

export const createQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  type: questionType.default("short_text"),
  options: z.array(z.string().trim().min(1).max(200)).optional(),
  required: z.boolean().default(false),
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
    position: z.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
