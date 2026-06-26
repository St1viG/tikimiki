import { z } from "zod";

export const createReportSchema = z.object({
  targetType: z.enum(["user", "post", "comment", "message", "hackathon"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  note: z.string().trim().min(1).max(1000).optional(),
});
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

export const listReportsQuerySchema = z.object({
  status: z.enum(["pending", "resolved", "all"]).default("pending"),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
