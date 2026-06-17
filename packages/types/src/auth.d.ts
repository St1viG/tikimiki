/**
 * Auth contract shared by the Next.js frontend and the NestJS backend (F-01).
 * Response shapes returned by /api/v1/auth/*.
 */
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
/** POST /auth/register, /auth/login → access token in body, refresh in cookie. */
export interface AuthResponse {
    user: PublicUser;
    accessToken: string;
}
/** POST /auth/refresh */
export interface RefreshResponse {
    accessToken: string;
}
/** GET /auth/me */
export interface MeResponse extends PublicUser {
    roles: AuthRoles;
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
