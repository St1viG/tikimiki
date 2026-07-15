/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { z } from "zod";

export const proposeTeamSchema = z.object({
  excludeUserIds: z.array(z.string().uuid()).optional().default([]),
});
export type ProposeTeamInput = z.infer<typeof proposeTeamSchema>;

export const acceptProposalSchema = z.object({
  teamName: z.string().trim().min(1).max(100),
  memberUserIds: z.array(z.string().uuid()),
});
export type AcceptProposalInput = z.infer<typeof acceptProposalSchema>;
