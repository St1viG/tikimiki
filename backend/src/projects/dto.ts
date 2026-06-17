import { z } from "zod";

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
  videoUrl: z.string().trim().url().max(2048).optional(),
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
    videoUrl: z.string().trim().url().max(2048).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
