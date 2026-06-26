import { z } from "zod";

/** Allowed profile-visibility values (mirrors the `profileVisibility` enum). */
export const profileVisibilitySchema = z.enum(["all", "members", "none"]);

/** PATCH /settings body — every field optional (partial update). */
export const updateSettingsSchema = z
  .object({
    profileVisibility: profileVisibilitySchema,
    visibleToRecruiters: z.boolean(),
    showEmail: z.boolean(),
    showLocation: z.boolean(),
    emailNotifications: z.boolean(),
    pushNotifications: z.boolean(),
  })
  .partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Providers whose OAuth integration can be disconnected. */
export const integrationProviderSchema = z.enum(["github", "google", "linkedin"]);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
