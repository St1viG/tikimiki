import { z } from "zod";

export const listUsersQuerySchema = z.object({
  search: z.string().trim().min(1).max(254).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const rejectOrgSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type RejectOrgInput = z.infer<typeof rejectOrgSchema>;

export const banUserSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  /** ISO timestamp the ban auto-expires at; omitted = permanent ban (SSU21). */
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
export type BanUserInput = z.infer<typeof banUserSchema>;

export const auditQuerySchema = z.object({
  search: z.string().trim().min(1).max(254).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const resolveAppealSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(2000).optional(),
});
export type ResolveAppealInput = z.infer<typeof resolveAppealSchema>;
