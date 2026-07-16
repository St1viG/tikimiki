import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  hackathonId: z.string().uuid(),
  /** Teammates to invite on creation — picked by the leader, capped at maxTeamSize - 1. */
  inviteeUserIds: z.array(z.string().uuid()).max(100).optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const joinRequestSchema = z.object({
  message: z.string().trim().max(500).optional(),
});
export type JoinRequestInput = z.infer<typeof joinRequestSchema>;

export const inviteSchema = z.object({
  userId: z.string().uuid(),
  message: z.string().trim().max(500).optional(),
});
export type InviteInput = z.infer<typeof inviteSchema>;
