import { z } from "zod";

export const hackathonType = z.enum(["physical", "virtual", "hybrid"]);

/**
 * Body for `POST /hackathons`. Dates are ISO-8601 strings (coerced to Date in
 * the service before insert). Cross-field constraints (date ordering,
 * team-size bounds, physical-location requirements) are enforced in the
 * service, mirroring the DB CHECK constraints, so we can return precise 400s.
 */
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
