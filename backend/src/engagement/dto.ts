import { z } from "zod";

export const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  parentCommentId: z.string().uuid().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
