import { z } from "zod";

export const createReportSchema = z.object({
  targetType: z.enum(["user", "post", "comment", "message", "hackathon"]),
  targetId: z.string().uuid(),
  category: z.enum(["spam", "harassment", "inappropriate_content", "other"]),
  reason: z.string().trim().min(1).max(1000).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z
  .object({
    status: z.enum(["resolved", "dismissed"]),
    note: z.string().trim().min(1).max(1000).optional(),
    /** Soft-deletes the reported post/comment. Only meaningful with status "resolved". */
    removeContent: z.boolean().optional().default(false),
    /** Bans the content's author (or the reported user directly). Only meaningful with status "resolved". */
    banUser: z.boolean().optional().default(false),
  })
  .refine((v) => v.status === "resolved" || (!v.removeContent && !v.banUser), {
    message: "removeContent/banUser only apply when resolving as 'resolved'",
    path: ["status"],
  });
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

export const listReportsQuerySchema = z.object({
  status: z.enum(["pending", "resolved", "all"]).default("pending"),
  /**
   * Scope to a single Cohor server's message reports (its hackathon's
   * organizer / assigned server moderators / admins). Omitted → the
   * platform-wide, admin-only view across every report type.
   */
  serverId: z.string().uuid().optional(),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
