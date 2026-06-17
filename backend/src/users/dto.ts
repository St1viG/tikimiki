import { z } from "zod";

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
    username: z.string().trim().min(3).max(32).optional(),
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
    newPassword: z.string().min(8).max(256),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
