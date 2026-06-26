"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { LoginBody, MeResponse, RegisterBody } from "@tikimiki/types";
import * as api from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: MeResponse | null;
  status: AuthStatus;
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Global auth session (F-01). On mount it restores the session from the httpOnly
 * refresh cookie (silent refresh → /me); login/register/logout keep it in sync.
 * Wrap the app in layout.tsx and read it anywhere via {@link useAuth}.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadMe = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!api.getAccessToken()) await api.refreshSession();
        const me = await api.me();
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (body: LoginBody) => {
      await api.login(body);
      await loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (body: RegisterBody) => {
      await api.register(body);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, refresh: loadMe }),
    [user, status, login, register, logout, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * Redirects to /login once the session is known to be unauthenticated.
 * Use at the top of a protected page's client component.
 */
export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.status === "unauthenticated") router.replace("/login");
  }, [auth.status, router]);
  return auth;
}

type AppRole = "admin" | "organization" | "member";

/**
 * Like {@link useRequireAuth}, but also requires a specific role. Unauthenticated
 * → /login; authenticated without the role → home (/). Role check is global
 * (per-hackathon moderation is enforced separately via server roles).
 */
export function useRequireRole(role: AppRole): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (auth.status === "authenticated" && auth.user) {
      const ok =
        role === "admin"
          ? auth.user.roles.isAdmin
          : role === "organization"
            ? auth.user.roles.isOrganization
            : auth.user.roles.isMember;
      if (!ok) router.replace("/");
    }
  }, [auth.status, auth.user, role, router]);
  return auth;
}
