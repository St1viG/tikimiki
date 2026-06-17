import { z } from "zod";

export const createPostSchema = z
  .object({
    content: z.string().trim().max(5000).default(""),
    // Up to 10 image/video attachment URLs (upload paths), in display order.
    attachments: z
      .array(z.string().trim().max(500))
      .max(10)
      .optional()
      .default([]),
  })
  .refine((b) => b.content.length > 0 || b.attachments.length > 0, {
    message: "A post needs text or at least one image/video.",
  });
export type CreatePostInput = z.infer<typeof createPostSchema>;
