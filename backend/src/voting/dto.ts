import { z } from "zod";

/** Path params for the project-listing / vote endpoints. */
export const hackathonParamsSchema = z.object({
  hackathonId: z.string().uuid(),
});
export type HackathonParams = z.infer<typeof hackathonParamsSchema>;

export const voteParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  projectId: z.string().uuid(),
});
export type VoteParams = z.infer<typeof voteParamsSchema>;
