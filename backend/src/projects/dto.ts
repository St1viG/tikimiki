import { z } from "zod";

/**
 * A project video is either an absolute URL (an externally hosted demo) or a
 * site-relative "/uploads/…" path produced by `POST /uploads/video`.
 *
 * Autor: Stevan Gnjato (2023/0141)
 */
const videoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => v.startsWith("/uploads/") || z.string().url().safeParse(v).success,
    { message: "Must be a URL or an uploaded video path" },
  );

/**
 * Body for `POST /teams/:teamId/project`. A team's project starts as a draft;
 * `title` is the only hard requirement (mirrors the NOT NULL column). Repo /
 * video links are validated as URLs so the showcase + judging views can render
 * them safely.
 */
export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  repositoryUrl: z.string().trim().url().max(2048).optional(),
  videoUrl: videoUrlSchema.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Body for `PATCH /projects/:projectId`. Every field is optional; only the
 * provided ones change. `null` explicitly clears the optional text/link fields.
 */
export const updateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    repositoryUrl: z.string().trim().url().max(2048).nullable().optional(),
    videoUrl: videoUrlSchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
