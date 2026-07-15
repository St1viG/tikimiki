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

// Guests identify with a client-generated fingerprint instead of a JWT (SSU14).
export const castVoteSchema = z.object({
  fingerprint: z.string().trim().min(8).max(128).optional(),
});
export type CastVoteInput = z.infer<typeof castVoteSchema>;

// Organizer-configured audience-voting window. `closesAt` may be null to keep
// voting open until the organizer closes it; both null clears the window.
export const votingWindowSchema = z
  .object({
    opensAt: z.string().datetime().nullable(),
    closesAt: z.string().datetime().nullable(),
  })
  .refine(
    (b) =>
      b.opensAt == null ||
      b.closesAt == null ||
      new Date(b.opensAt).getTime() < new Date(b.closesAt).getTime(),
    { message: "opensAt must be before closesAt" },
  )
  .refine((b) => !(b.opensAt == null && b.closesAt != null), {
    message: "closesAt requires opensAt",
  });
export type VotingWindowInput = z.infer<typeof votingWindowSchema>;
