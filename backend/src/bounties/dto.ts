import { z } from "zod";

/** Body for publishing/replacing the overall hackathon podium. */
export const publishResultsSchema = z.object({
  rankings: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        rank: z.number().int().min(1),
      }),
    )
    .max(100),
});
export type PublishResultsInput = z.infer<typeof publishResultsSchema>;

/** Body for setting (or clearing, with null) a bounty's winning project. */
export const setBountyWinnerSchema = z.object({
  projectId: z.string().uuid().nullable(),
});
export type SetBountyWinnerInput = z.infer<typeof setBountyWinnerSchema>;

/** Body for creating a sponsor bounty (organizer/admin, SSU16). */
export const createBountySchema = z.object({
  sponsorName: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  theme: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).optional(),
  /** Award value of the mirrored prize row (e.g. "500 €"); omit for no prize. */
  prizeAward: z.string().trim().min(1).max(500).optional(),
});
export type CreateBountyInput = z.infer<typeof createBountySchema>;

/** Body for editing a sponsor bounty; `null` clears a nullable field. */
export const updateBountySchema = z
  .object({
    sponsorName: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    theme: z.string().trim().min(1).max(100).nullable().optional(),
    description: z.string().trim().min(1).nullable().optional(),
    /** New award value, or `null` to remove the bounty's prize row. */
    prizeAward: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateBountyInput = z.infer<typeof updateBountySchema>;
