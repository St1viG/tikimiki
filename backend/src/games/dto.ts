import { z } from "zod";

export const createPlaySchema = z.object({
  /** The game's metric (e.g. correct answers, tries, seconds) — recorded as-is.
   *  The point reward is derived server-side from this score (capped by the
   *  game's maxPointsPerPlay); the client cannot specify the reward. */
  score: z.number().int().min(0),
  /** Whether the game was completed flawlessly (e.g. Grupe with zero mistakes).
   *  Drives achievement badges; the server still gates each badge on the game
   *  slug + a score sanity check. */
  perfect: z.boolean().optional(),
});
export type CreatePlayInput = z.infer<typeof createPlaySchema>;
