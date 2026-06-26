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
