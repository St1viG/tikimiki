import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { userSettings, users } from "../db/schema";
import type { IntegrationProvider, UpdateSettingsInput } from "./dto";

/* ── response types ───────────────────────────────────────── */

export type ProfileVisibility = "all" | "members" | "none";

export interface SettingsDto {
  profileVisibility: ProfileVisibility;
  visibleToRecruiters: boolean;
  showEmail: boolean;
  showLocation: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface IntegrationsDto {
  github: { connected: boolean; username: string | null };
  google: { connected: boolean };
  linkedin: { connected: boolean };
}

/* ── defaults (mirror the DB column defaults) ─────────────── */

const DEFAULT_SETTINGS: SettingsDto = {
  profileVisibility: "all",
  visibleToRecruiters: true,
  showEmail: false,
  showLocation: true,
  emailNotifications: true,
  pushNotifications: true,
};

const PROVIDERS: readonly IntegrationProvider[] = ["github", "google", "linkedin"];

@Injectable()
export class SettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Caller's settings, falling back to defaults when no row exists. */
  async get(userId: string): Promise<SettingsDto> {
    const [row] = await this.db
      .select({
        profileVisibility: userSettings.profileVisibility,
        visibleToRecruiters: userSettings.visibleToRecruiters,
        showEmail: userSettings.showEmail,
        showLocation: userSettings.showLocation,
        emailNotifications: userSettings.emailNotifications,
        pushNotifications: userSettings.pushNotifications,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    return row ?? DEFAULT_SETTINGS;
  }

  /** Upsert the caller's settings with the provided partial, then return all. */
  async update(userId: string, input: UpdateSettingsInput): Promise<SettingsDto> {
    const now = new Date();

    await this.db
      .insert(userSettings)
      .values({ userId, ...input, updatedAt: now })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...input, updatedAt: now },
      });

    return this.get(userId);
  }

  /** OAuth integration status derived from the users id columns. */
  async getIntegrations(userId: string): Promise<IntegrationsDto> {
    const [row] = await this.db
      .select({
        githubId: users.githubId,
        githubUsername: users.githubUsername,
        googleId: users.googleId,
        linkedinId: users.linkedinId,
      })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    return {
      github: {
        connected: row?.githubId != null,
        username: row?.githubUsername ?? null,
      },
      google: { connected: row?.googleId != null },
      linkedin: { connected: row?.linkedinId != null },
    };
  }

  /** Disconnect an OAuth provider by nulling its id column(s). */
  async disconnect(userId: string, provider: string): Promise<IntegrationsDto> {
    if (!PROVIDERS.includes(provider as IntegrationProvider)) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }

    const set =
      provider === "github"
        ? { githubId: null, githubUsername: null, updatedAt: new Date() }
        : provider === "google"
          ? { googleId: null, updatedAt: new Date() }
          : { linkedinId: null, updatedAt: new Date() };

    await this.db.update(users).set(set).where(eq(users.userId, userId));

    return this.getIntegrations(userId);
  }
}
