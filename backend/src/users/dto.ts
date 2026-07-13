import { z } from "zod";
import { passwordSchema } from "../auth/dto";

/** An image reference: either a local upload path ("/uploads/…") or an absolute
 *  http(s) URL. Uploaded avatars/banners are served as relative paths, so a
 *  strict `.url()` check wrongly rejected them ("Validation failed"). */
const imageRef = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || /^https?:\/\//i.test(v), {
    message: "must be an upload path or http(s) URL",
  })
  .nullable()
  .optional();

/** PATCH /users/me/profile body. */
export const updateProfileSchema = z
  .object({
    // Same username format rule as registration (auth/dto.ts) — profile edits
    // must not let through names the signup form rejects.
    username: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_.-]+$/, "letters, numbers, . _ - only")
      .optional(),
    displayName: z.string().trim().max(80).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    avatarUrl: imageRef,
    bannerUrl: imageRef,
    skills: z.array(z.string().trim().min(1).max(100)).optional(),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** PATCH /users/me/password body. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    // Same complexity rule as registration and password reset.
    newPassword: passwordSchema,
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
