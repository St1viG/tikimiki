import { z } from "zod";

export const accountTypeSchema = z.enum(["member", "organization"]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const registerSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_.-]+$/, "letters, numbers, . _ - only"),
    email: z.string().email().max(254),
    password: z.string().min(8).max(200),
    accountType: accountTypeSchema.default("member"),
    organizationName: z.string().min(2).max(100).optional(),
  })
  .refine(
    (d) => d.accountType !== "organization" || !!d.organizationName,
    { message: "organizationName is required for organization accounts", path: ["organizationName"] },
  );
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;
