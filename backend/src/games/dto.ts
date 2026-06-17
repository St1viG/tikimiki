import { z } from "zod";

export const createPlaySchema = z.object({
  /** The game's metric (e.g. correct answers, tries, seconds) — recorded as-is.
   *  The point reward is derived server-side from this score (capped by the
   *  game's maxPointsPerPlay); the client cannot specify the reward. */
  score: z.number().int().min(0),
});
export type CreatePlayInput = z.infer<typeof createPlaySchema>;
