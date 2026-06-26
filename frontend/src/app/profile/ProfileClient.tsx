"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * ProfileClient — canonical "/profile" entry point.
 *
 * "/profile" is not a real page: the real profile lives at "/u/<username>".
 * This client resolves the session and redirects:
 *  - authenticated  → /u/<username> (their own profile)
 *  - unauthenticated → /login
 * While the session is still loading it renders a minimal skeleton loading
 * state (reusing the global .skel placeholders) so there is no flash of empty
 * chrome before the redirect fires.
 */

const M = {
  loading: { en: "Loading your profile…", sr: "Učitavanje tvog profila…" },
} as const;

export function ProfileClient() {
  const t = useT(M);
  const router = useRouter();
  const { user, status } = useAuth();

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(`/u/${user.username}`);
    } else if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, user, router]);

  return (
    <AppShell variant="no-right">
      <main id="main">
        <div className="card" aria-busy="true" aria-label={t("loading")}>
          <div className="skel skel-line" style={{ width: "40%" }} />
          <div className="skel skel-line" style={{ width: "70%", marginTop: 14 }} />
          <div className="skel skel-line" style={{ width: "55%", marginTop: 10 }} />
        </div>
      </main>
    </AppShell>
  );
}

export default ProfileClient;
