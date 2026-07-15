/**
 * Auth contract shared by the Next.js frontend and the NestJS backend (F-01).
 * Response shapes returned by /api/v1/auth/*.
 */

import type { EquippedCosmeticRef } from "./feed";

export type AccountType = "member" | "organization";

export interface PublicUser {
  userId: string;
  username: string;
  email: string;
  isEmailVerified: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  createdAt: string;
}

export interface AuthRoles {
  isAdmin: boolean;
  isMember: boolean;
  isOrganization: boolean;
}

export type OrgVerificationStatus = "pending" | "approved" | "rejected";

/** Verification state of the caller's own organization account. */
export interface MeOrganization {
  name: string;
  verificationStatus: OrgVerificationStatus;
  rejectionReason: string | null;
}

/**
 * POST /auth/register, /auth/login → access token in body, refresh in cookie.
 * SSU1: organization registrations return NO tokens — the account waits for
 * administrator approval (`pendingApproval` is set instead).
 */
export interface AuthResponse {
  user: PublicUser;
  accessToken?: string;
  pendingApproval?: boolean;
}

/** POST /auth/refresh */
export interface RefreshResponse {
  accessToken: string;
}

/** GET /auth/me */
export interface MeResponse extends PublicUser {
  roles: AuthRoles;
  /** Present only for organization accounts. */
  organization?: MeOrganization;
  /** The caller's equipped username effect (e.g. neon name), null when none. */
  usernameEffect?: EquippedCosmeticRef | null;
}

export interface RegisterBody {
  username: string;
  email: string;
  password: string;
  accountType: AccountType;
  organizationName?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}
