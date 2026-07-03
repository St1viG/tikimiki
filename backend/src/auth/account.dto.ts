import { z } from "zod";

export const tokenSchema = z.object({ token: z.string().min(1) });
export type TokenInput = z.infer<typeof tokenSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().email() });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changeEmailSchema = z.object({ email: z.string().email() });
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

// `email` carries the same email-or-username identifier the login form uses
// (a banned user appeals with the credentials they just signed in with).
export const appealSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1),
  reason: z.string().trim().min(10).max(2000),
});
export type AppealInput = z.infer<typeof appealSchema>;
