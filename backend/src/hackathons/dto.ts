import { z } from "zod";

export const hackathonType = z.enum(["physical", "virtual", "hybrid"]);
export const hackathonStatus = z.enum([
  "upcoming",
  "ongoing",
  "finished",
  "cancelled",
]);

export const createHackathonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  type: hackathonType,
  theme: z.string().trim().min(1).max(100).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  registrationDeadline: z.string().datetime({ offset: true }),
  maxParticipants: z.number().int().positive().optional(),
  minTeamSize: z.number().int().min(1).default(1),
  maxTeamSize: z.number().int().min(1),
  location: z.string().trim().min(1).max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  logoUrl: z.string().trim().max(2048).optional(),
  bannerUrl: z.string().trim().max(2048).optional(),
});
export type CreateHackathonInput = z.infer<typeof createHackathonSchema>;

export const updateHackathonSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).optional(),
    type: hackathonType.optional(),
    theme: z.string().trim().min(1).max(100).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    registrationDeadline: z.string().datetime({ offset: true }).optional(),
    maxParticipants: z.number().int().positive().nullable().optional(),
    minTeamSize: z.number().int().min(1).optional(),
    maxTeamSize: z.number().int().min(1).optional(),
    location: z.string().trim().min(1).max(200).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    logoUrl: z.string().trim().max(2048).nullable().optional(),
    bannerUrl: z.string().trim().max(2048).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateHackathonInput = z.infer<typeof updateHackathonSchema>;

export const updateStatusSchema = z.object({
  status: hackathonStatus,
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const createPrizeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).optional(),
  rank: z.number().int().positive().optional(),
  awardValue: z.string().trim().min(1).max(500).optional(),
  sponsorName: z.string().trim().min(1).max(100).optional(),
});
export type CreatePrizeInput = z.infer<typeof createPrizeSchema>;

export const updatePrizeSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).nullable().optional(),
    rank: z.number().int().positive().nullable().optional(),
    awardValue: z.string().trim().min(1).max(500).nullable().optional(),
    sponsorName: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdatePrizeInput = z.infer<typeof updatePrizeSchema>;
