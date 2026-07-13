"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import {
  AdminAppealPopup,
  type AppealAction,
  type AppealRequest,
} from "@/components/popups/AdminAppealPopup";
import { AdminProfilePopup } from "@/components/popups/AdminProfilePopup";
import { USER_PROFILES } from "@/app/admin/_mockProfiles";
import { useT, useLanguage } from "@/components/i18n/LanguageProvider";
import { useRequireRole } from "@/components/auth/AuthProvider";
import {
  getAdminMetrics,
  getAuditLog,
  getAppeals,
  resolveAppeal,
  getReports,
  resolveReport,
  getAdminUsers,
  getAdminOrganizations,
  verifyOrganization,
  rejectOrganization,
  banUser,
  unbanUser,
  ApiError,
  type AdminMetrics,
  type AuditEntry,
  type Appeal,
  type Report,
  type AdminUser,
  type AdminOrg,
} from "@/lib/api";

/* AdminClient — interactive admin panel ("/admin"). */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Platform oversight", sr: "Nadzor platforme" },
  modeBadge: { en: "Admin", sr: "Admin" },
  pageSub: {
    en: "System overview, content reports and account management.",
    sr: "Pregled sistema, prijava sadržaja i upravljanje nalozima.",
  },
  searchLabel: { en: "Search", sr: "Pretraži" },
  searchPh: { en: "Search…", sr: "Pretraži…" },
  lastLogin: { en: "Last login:", sr: "Poslednja prijava:" },
  kpiActive: { en: "Active users (24h)", sr: "Aktivni korisnici (24h)" },
  kpiNewReg: { en: "New registrations (7d)", sr: "Nove registracije (7d)" },
  kpiActiveHacks: { en: "Active hackathons", sr: "Aktivni hackathoni" },
  kpiOpenReports: { en: "Open reports", sr: "Otvorene prijave" },
  tabsLabel: { en: "Oversight sections", sr: "Sekcije nadzora" },
  tabOverview: { en: "Overview", sr: "Pregled" },
  tabReports: { en: "Content reports", sr: "Prijave sadržaja" },
  tabUsers: { en: "Users", sr: "Korisnici" },
  tabOrgs: { en: "Organizations", sr: "Organizacije" },
  tabAudit: { en: "Audit log", sr: "Audit log" },
  tabAppeals: { en: "Appeals", sr: "Žalbe" },
  chartActivity: { en: "Activity (last 7 days)", sr: "Aktivnost (poslednjih 7 dana)" },
  chartHint: { en: "logged-in users", sr: "prijavljeni korisnici" },
  chartReports: { en: "Reports by category (30 days)", sr: "Prijave po kategoriji (30 dana)" },
  chartHealth: { en: "System health", sr: "Zdravlje sistema" },
  filterReportsLabel: { en: "Search reports", sr: "Pretraži prijave" },
  filterReportsPh: {
    en: "Search reports by user or content...",
    sr: "Pretraži prijave po korisniku ili sadržaju...",
  },
  statusOpen: { en: "Status: Open", sr: "Status: Otvorene" },
  category: { en: "Category", sr: "Kategorija" },
  contentType: { en: "Content type", sr: "Tip sadržaja" },
  sortLabel: { en: "Sort:", sr: "Sortiraj:" },
  dismissReport: { en: "Dismiss report", sr: "Odbaci prijavu" },
  viewProfile: { en: "View profile", sr: "Pregledaj profil" },
  loadMore: { en: "Load more", sr: "Učitaj još" },
  filterUsersLabel: { en: "Search users", sr: "Pretraži korisnike" },
  filterUsersPh: {
    en: "Search users by username, email, id...",
    sr: "Pretraži korisnike po username, email-u, id-ju...",
  },
  roleAll: { en: "Role: All", sr: "Uloga: Svi" },
  status: { en: "Status", sr: "Status" },
  regDate: { en: "Registration date", sr: "Datum registracije" },
  sortMostActive: { en: "Most active", sr: "Najaktivniji" },
  colUser: { en: "User", sr: "Korisnik" },
  colEmail: { en: "Email", sr: "Email" },
  colRole: { en: "Role", sr: "Uloga" },
  colStatus: { en: "Status", sr: "Status" },
  colActions: { en: "Actions", sr: "Akcije" },
  profileBtn: { en: "Profile", sr: "Profil" },
  nextPage: { en: "Next page", sr: "Sledeća strana" },
  pendingVerif: { en: "Pending verification", sr: "Na verifikaciji" },
  pendingVerifSub: { en: "Awaiting administrator approval", sr: "Čekaju odobrenje administratora" },
  verifyBtn: { en: "Verify", sr: "Verifikuj" },
  rejectVerifBtn: { en: "Reject", sr: "Odbij" },
  toastVerified: { en: "Organization verified.", sr: "Organizacija je verifikovana." },
  verifiedOrgs: { en: "Verified organizations", sr: "Verifikovane organizacije" },
  rejectedOrgs: { en: "Rejected requests", sr: "Odbijeni zahtevi" },
  noRejectedOrgs: { en: "No rejected requests.", sr: "Nema odbijenih zahteva." },
  orgRejectedOn: { en: "rejected", sr: "odbijen" },
  orgReasonLabel: { en: "Reason", sr: "Razlog" },
  orgSubmittedOn: { en: "submitted", sr: "podnet" },
  revokeVerifBtn: { en: "Revoke verification", sr: "Ukini verifikaciju" },
  // Wired reports / users / orgs
  reportKindPost: { en: "Post report", sr: "Prijava objave" },
  reportKindMessage: { en: "Message report", sr: "Prijava poruke" },
  reportKindProfile: { en: "Profile report", sr: "Prijava profila" },
  reportKindTeam: { en: "Team report", sr: "Prijava tima" },
  reportKindComment: { en: "Comment report", sr: "Prijava komentara" },
  reportKindGeneric: { en: "Report", sr: "Prijava" },
  reportReportedBy: { en: "Reported by", sr: "Prijavio" },
  reportTargetLabel: { en: "Target:", sr: "Cilj:" },
  resolveReportBtn: { en: "Resolve", sr: "Reši" },
  noReports: { en: "No open reports.", sr: "Nema otvorenih prijava." },
  reportsShowOf: { en: "open reports", sr: "otvorenih prijava" },
  toastReportResolved: { en: "Report resolved.", sr: "Prijava je rešena." },
  toastReportDismissed: { en: "Report dismissed.", sr: "Prijava je odbačena." },
  toastReportError: { en: "Could not process the report.", sr: "Nije moguće obraditi prijavu." },
  roleAdmin: { en: "Administrator", sr: "Administrator" },
  roleOrg: { en: "Organization", sr: "Organizacija" },
  roleMember: { en: "Member", sr: "Član" },
  statusActive: { en: "Active", sr: "Aktivan" },
  statusBanned: { en: "Banned", sr: "Banovan" },
  colJoined: { en: "Joined", sr: "Pridružen" },
  banBtn: { en: "Ban", sr: "Banuj" },
  unbanBtn: { en: "Unban", sr: "Ukini ban" },
  noUsers: { en: "No users found.", sr: "Nema pronađenih korisnika." },
  defaultBanReason: { en: "Violation of platform rules", sr: "Kršenje pravila platforme" },
  toastUserBanned: { en: "User banned.", sr: "Korisnik je banovan." },
  toastUserUnbanned: { en: "User unbanned.", sr: "Ban je ukinut." },
  toastUserError: { en: "Could not update the user.", sr: "Nije moguće ažurirati korisnika." },
  noPendingOrgs: {
    en: "No organizations awaiting verification.",
    sr: "Nema organizacija koje čekaju verifikaciju.",
  },
  noVerifiedOrgs: {
    en: "No verified organizations yet.",
    sr: "Još nema verifikovanih organizacija.",
  },
  orgVerifiedOn: { en: "verified", sr: "verifikovan" },
  orgRequested: { en: "verification requested", sr: "zahtev za verifikaciju podnet" },
  defaultRejectReason: {
    en: "Verification requirements not met",
    sr: "Uslovi za verifikaciju nisu ispunjeni",
  },
  toastOrgError: {
    en: "Could not update the organization.",
    sr: "Nije moguće ažurirati organizaciju.",
  },
  auditFilterLabel: { en: "Search audit log", sr: "Pretraži audit log" },
  auditFilterPh: { en: "Search audit log...", sr: "Pretraži audit log..." },
  adminAll: { en: "Administrator: All", sr: "Administrator: Svi" },
  actionType: { en: "Action type", sr: "Tip akcije" },
  period7: { en: "Period: 7 days", sr: "Period: 7 dana" },
  appealsFilterLabel: { en: "Search appeals", sr: "Pretraži žalbe" },
  appealsFilterPh: {
    en: "Search appeals by user or measure...",
    sr: "Pretraži žalbe po korisniku ili meri...",
  },
  appealStatusPending: { en: "Status: Pending", sr: "Status: Na čekanju" },
  measureType: { en: "Measure type", sr: "Tip mere" },
  approveAppealBtn: { en: "Approve appeal", sr: "Prihvati žalbu" },
  rejectAppealBtn: { en: "Reject appeal", sr: "Odbij žalbu" },
  userProfileBtn: { en: "User profile", sr: "Profil korisnika" },
  closedAppeals: { en: "Closed appeals", sr: "Zatvorene žalbe" },
  closedAppealsSub: {
    en: "Processed appeals from the previous period",
    sr: "Obrađene žalbe iz prethodnog perioda",
  },
  footerAbout: { en: "About us", sr: "O nama" },
  footerHandbook: { en: "Administrator handbook", sr: "Administratorski priručnik" },
  footerPrivacy: { en: "Privacy and terms", sr: "Privatnost i uslovi" },
  modalRemoveTitle: { en: "Remove content?", sr: "Ukloni sadržaj?" },
  modalRemoveSub: {
    en: "Content will be removed from the platform and visible only in the audit log. The author will be notified.",
    sr: "Sadržaj će biti uklonjen sa platforme i vidljiv samo u audit logu. Autor će dobiti obaveštenje.",
  },
  modalRemoveTextPh: { en: "Justification (required)...", sr: "Obrazloženje (obavezno)..." },
  modalRemoveTextAria: { en: "Justification", sr: "Obrazloženje" },
  modalRemoveConfirm: { en: "Confirm removal", sr: "Potvrdi uklanjanje" },
  modalSuspendTitle: { en: "Suspend account?", sr: "Suspenduj nalog?" },
  modalSuspendSub: {
    en: "The user will not be able to access the platform during the suspension period.",
    sr: "Korisnik neće moći da pristupi platformi tokom perioda suspenzije.",
  },
  modalSuspendTextPh: {
    en: "Suspension justification (required)...",
    sr: "Obrazloženje suspenzije (obavezno)...",
  },
  modalSuspendTextAria: { en: "Suspension justification", sr: "Obrazloženje suspenzije" },
  modalSuspendConfirm: { en: "Confirm suspension", sr: "Potvrdi suspenziju" },
  modalRejectVerifTitle: {
    en: "Reject verification request?",
    sr: "Odbij zahtev za verifikaciju?",
  },
  modalRejectVerifSub: {
    en: "The organisation will receive a notification with justification and the option to resubmit.",
    sr: "Organizacija će dobiti obaveštenje sa obrazloženjem i mogućnost ponovnog podnošenja zahteva.",
  },
  modalRejectVerifPh: {
    en: "Rejection justification (required)...",
    sr: "Obrazloženje odbijanja (obavezno)...",
  },
  modalRejectVerifAria: { en: "Rejection justification", sr: "Obrazloženje odbijanja" },
  modalRejectVerifConfirm: { en: "Reject request", sr: "Odbij zahtev" },
  toastVerifRejected: {
    en: "Verification request rejected.",
    sr: "Zahtev za verifikaciju je odbijen.",
  },
  modalRevokeTitle: {
    en: "Revoke organisation verification?",
    sr: "Ukini verifikaciju organizacije?",
  },
  modalRevokeSub: {
    en: "The organisation will not be able to create new hackathons until re-verified.",
    sr: "Organizacija neće moći da kreira nove hackathone sve dok se ponovo ne verifikuje.",
  },
  modalRevokePh: { en: "Justification (required)...", sr: "Obrazloženje (obavezno)..." },
  modalRevokeAria: { en: "Justification", sr: "Obrazloženje" },
  modalRevokeConfirm: { en: "Revoke verification", sr: "Ukini verifikaciju" },
  toastRevoked: { en: "Verification revoked.", sr: "Verifikacija je ukinuta." },
  cancelBtn: { en: "Cancel", sr: "Odustani" },
  loadingData: { en: "Loading…", sr: "Učitavanje…" },
  noAuditEntries: { en: "No audit log entries.", sr: "Nema unosa u audit logu." },
  systemActor: { en: "system", sr: "sistem" },
  noReportsData: { en: "No reports in this period.", sr: "Nema prijava u ovom periodu." },
  noPendingAppeals: { en: "No pending appeals.", sr: "Nema žalbi na čekanju." },
  noClosedAppeals: { en: "No closed appeals.", sr: "Nema zatvorenih žalbi." },
  appealKind: { en: "Appeal", sr: "Žalba" },
  appealSubmittedBy: { en: "Submitted by", sr: "Podneo" },
  statusApproved: { en: "Approved", sr: "Prihvaćena" },
  statusRejected: { en: "Rejected", sr: "Odbijena" },
  statusPendingShort: { en: "Pending", sr: "Na čekanju" },
  reviewResponse: { en: "Response:", sr: "Odgovor:" },
  hStatPosts: { en: "Total posts", sr: "Ukupno objava" },
  hStatTeams: { en: "Total teams", sr: "Ukupno timova" },
  hStatHackathons: { en: "Total hackathons", sr: "Ukupno hackathona" },
  hStatPendingAppeals: { en: "Pending appeals", sr: "Žalbe na čekanju" },
  hStatBannedUsers: { en: "Banned users", sr: "Banovani korisnici" },
  healthHintLive: { en: "current", sr: "trenutno" },
  toastAppealApproved: {
    en: "Appeal approved. User notified.",
    sr: "Žalba je prihvaćena. Korisnik je obavešten.",
  },
  toastAppealRejected: {
    en: "Appeal rejected. User notified.",
    sr: "Žalba je odbijena. Korisnik je obavešten.",
  },
  toastAppealError: { en: "Could not resolve the appeal.", sr: "Žalbu nije moguće obraditi." },
} as const;

type TabFilter = "pregled" | "prijave" | "korisnici" | "organizacije" | "audit" | "zalbe";

type ModalId = "modal-remove" | "modal-suspend" | "modal-reject" | "modal-revoke";

type ToastType = "green" | "red";

interface ToastState {
  msg: string;
  type: ToastType;
  show: boolean;
}

export function AdminClient() {
  useRequireRole("admin");
  const t = useT(M);
  const { locale } = useLanguage();
  const [filter, setFilter] = useState<TabFilter>("pregled");
  const [activeModal, setActiveModal] = useState<ModalId | null>(null);
  // Reason text + confirm handler for the reason-driven action modals
  // (remove report / reject org / revoke verification).
  const [modalReason, setModalReason] = useState("");
  const modalActionRef = useRef<((reason: string) => void) | null>(null);
  const [appeal, setAppeal] = useState<AppealRequest | null>(null);
  const [appealId, setAppealId] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ msg: "", type: "green", show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real admin data
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [pendingAppeals, setPendingAppeals] = useState<Appeal[]>([]);
  const [closedAppeals, setClosedAppeals] = useState<Appeal[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportStats, setReportStats] = useState<{
    open: number;
    resolvedToday: number;
    total: number;
  }>({
    open: 0,
    resolvedToday: 0,
    total: 0,
  });
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [orgs, setOrgs] = useState<{
    pending: AdminOrg[];
    verified: AdminOrg[];
    rejected: AdminOrg[];
  }>({
    pending: [],
    verified: [],
    rejected: [],
  });

  // Date formatter bound to the active locale.
  const fmtDateTime = useCallback(
    (iso: string): string => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    },
    [locale],
  );
  const fmtDay = useCallback(
    (iso: string): string => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }).format(d);
    },
    [locale],
  );

  // Map an audit action to a timeline dot colour class.
  const auditDotClass = (action: string): string => {
    const a = action.toLowerCase();
    if (/(suspend|remove|delete|ban|reject|odbij|uklon|suspend|brisanje)/.test(a)) return "danger";
    if (/(verify|approve|lift|verifik|odobr|prihvat)/.test(a)) return "ok";
    if (/(warn|upozor)/.test(a)) return "warn";
    return "info";
  };

  const loadAppeals = useCallback(async () => {
    try {
      const { pending, closed } = await getAppeals();
      setPendingAppeals(pending);
      setClosedAppeals(closed);
    } catch {
      /* leave existing state on failure */
    }
  }, []);

  const loadAudit = useCallback(async (search?: string) => {
    setAuditLoading(true);
    try {
      const entries = await getAuditLog(search?.trim() ? search.trim() : undefined);
      setAuditEntries(entries);
    } catch {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const { reports: list, stats } = await getReports("pending");
      setReports(list);
      setReportStats(stats);
    } catch {
      /* leave existing state on failure */
    }
  }, []);

  const loadUsers = useCallback(async (search?: string) => {
    try {
      const list = await getAdminUsers(search?.trim() ? search.trim() : undefined);
      setAdminUsers(list);
    } catch {
      setAdminUsers([]);
    }
  }, []);

  const loadOrgs = useCallback(async () => {
    try {
      const data = await getAdminOrganizations();
      setOrgs(data);
    } catch {
      /* leave existing state on failure */
    }
  }, []);

  // Load all admin data on mount.
  useEffect(() => {
    let active = true;
    getAdminMetrics()
      .then((m) => {
        if (active) setMetrics(m);
      })
      .catch(() => {
        /* metrics unavailable */
      });
    void loadAudit();
    void loadAppeals();
    void loadReports();
    void loadUsers();
    void loadOrgs();
    return () => {
      active = false;
    };
  }, [loadAudit, loadAppeals, loadReports, loadUsers, loadOrgs]);

  const switchTab = (name: TabFilter) => {
    setFilter(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Open a reason-driven action modal. `onConfirm` receives the trimmed reason
  // and performs the real API call.
  const openModal = (id: ModalId, onConfirm: (reason: string) => void) => {
    modalActionRef.current = onConfirm;
    setModalReason("");
    setActiveModal(id);
  };
  const closeModal = () => {
    setActiveModal(null);
    modalActionRef.current = null;
  };
  const confirmModal = () => {
    const action = modalActionRef.current;
    const reason = modalReason.trim();
    closeModal();
    action?.(reason);
  };

  const showToast = useCallback((msg: string, type: ToastType = "green") => {
    setToast({ msg, type, show: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((st) => ({ ...st, show: false }));
    }, 3500);
  }, []);

  const openAppealModal = (action: AppealAction, userId: string, measure: string, id: string) => {
    setAppealId(id);
    setAppeal({ action, userId, measure });
  };

  const closeAppealModal = () => {
    setAppeal(null);
    setAppealId(null);
  };

  const confirmAppeal = (action: AppealAction, reason: string) => {
    const id = appealId;
    setAppeal(null);
    setAppealId(null);
    if (!id) return;
    const decision = action === "approve" ? "approve" : "reject";
    resolveAppeal(id, decision, reason.trim() || undefined)
      .then(() => {
        showToast(t(action === "approve" ? "toastAppealApproved" : "toastAppealRejected"), "green");
        void loadAppeals();
        // Refresh metrics so the health/pending counters stay in sync.
        getAdminMetrics()
          .then(setMetrics)
          .catch(() => {});
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : t("toastAppealError");
        showToast(msg, "red");
      });
  };

  // Reports
  const runResolveReport = (id: string, status: "resolved" | "dismissed", note?: string) => {
    resolveReport(id, status, note?.trim() ? note.trim() : undefined)
      .then(() => {
        setReports((list) => list.filter((r) => r.reportId !== id));
        setReportStats((st) => ({ ...st, open: Math.max(0, st.open - 1) }));
        showToast(
          t(status === "resolved" ? "toastReportResolved" : "toastReportDismissed"),
          "green",
        );
        getAdminMetrics()
          .then(setMetrics)
          .catch(() => {});
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : t("toastReportError");
        showToast(msg, "red");
      });
  };

  // "Resolve" routes the optional resolution note through the styled remove
  // modal; "Dismiss" needs no note and runs immediately.
  const handleResolveReport = (id: string, status: "resolved" | "dismissed") => {
    if (status === "resolved") {
      openModal("modal-remove", (reason) => runResolveReport(id, "resolved", reason));
    } else {
      runResolveReport(id, "dismissed");
    }
  };

  // Users
  const handleBanUser = (user: AdminUser) => {
    if (user.banned) {
      unbanUser(user.userId)
        .then(() => {
          setAdminUsers((list) =>
            list.map((u) => (u.userId === user.userId ? { ...u, banned: false } : u)),
          );
          showToast(t("toastUserUnbanned"), "green");
          getAdminMetrics()
            .then(setMetrics)
            .catch(() => {});
        })
        .catch((err: unknown) => {
          const msg = err instanceof ApiError ? err.message : t("toastUserError");
          showToast(msg, "red");
        });
      return;
    }
    // Route the ban reason through the styled suspend/ban modal (no native prompt).
    openModal("modal-suspend", (reason) => {
      banUser(user.userId, reason || t("defaultBanReason"))
        .then(() => {
          setAdminUsers((list) =>
            list.map((u) => (u.userId === user.userId ? { ...u, banned: true } : u)),
          );
          showToast(t("toastUserBanned"), "green");
          getAdminMetrics()
            .then(setMetrics)
            .catch(() => {});
        })
        .catch((err: unknown) => {
          const msg = err instanceof ApiError ? err.message : t("toastUserError");
          showToast(msg, "red");
        });
    });
  };

  // Organizations
  const handleVerifyOrg = (userId: string) => {
    verifyOrganization(userId)
      .then(() => {
        showToast(t("toastVerified"), "green");
        void loadOrgs();
        getAdminMetrics()
          .then(setMetrics)
          .catch(() => {});
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : t("toastOrgError");
        showToast(msg, "red");
      });
  };

  const runRejectOrg = (userId: string, reason: string, toastKey: keyof typeof M) => {
    rejectOrganization(userId, reason || t("defaultRejectReason"))
      .then(() => {
        showToast(t(toastKey), "green");
        void loadOrgs();
        getAdminMetrics()
          .then(setMetrics)
          .catch(() => {});
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : t("toastOrgError");
        showToast(msg, "red");
      });
  };

  // Reject a pending verification request (styled reject modal).
  const handleRejectOrg = (userId: string) => {
    openModal("modal-reject", (reason) => runRejectOrg(userId, reason, "toastVerifRejected"));
  };

  // Revoke an existing verification (styled revoke modal). Backed by the same
  // rejectOrganization endpoint — there is no dedicated revoke API.
  const handleRevokeOrg = (userId: string) => {
    openModal("modal-revoke", (reason) => runRejectOrg(userId, reason, "toastRevoked"));
  };

  const reportKindLabel = (targetType: string): string => {
    switch (targetType.toLowerCase()) {
      case "post":
        return t("reportKindPost");
      case "message":
        return t("reportKindMessage");
      case "profile":
      case "user":
        return t("reportKindProfile");
      case "team":
        return t("reportKindTeam");
      case "comment":
        return t("reportKindComment");
      default:
        return t("reportKindGeneric");
    }
  };

  const roleLabel = (role: AdminUser["role"]): string => {
    switch (role) {
      case "admin":
        return t("roleAdmin");
      case "organization":
        return t("roleOrg");
      default:
        return t("roleMember");
    }
  };

  const rolePillClass = (role: AdminUser["role"]): string => {
    switch (role) {
      case "admin":
        return "adm-role-admin";
      case "organization":
        return "adm-role-org";
      default:
        return "adm-role-clan";
    }
  };

  const orgInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const openProfileModal = (userId: string) => setProfileUser(userId);

  const tabs: { id: TabFilter; labelKey: keyof typeof M; count?: number }[] = [
    { id: "pregled", labelKey: "tabOverview" },
    { id: "prijave", labelKey: "tabReports", count: reportStats.open },
    { id: "korisnici", labelKey: "tabUsers" },
    { id: "organizacije", labelKey: "tabOrgs", count: orgs.pending.length },
    { id: "audit", labelKey: "tabAudit" },
    { id: "zalbe", labelKey: "tabAppeals", count: pendingAppeals.length },
  ];

  return (
    <AppShell variant="no-right">
      <main className="adm adm-page" id="adm" data-filter={filter}>
        {/* PAGE HEADER */}
        <div className="page-head">
          <Link className="col-back" href="/" aria-label={t("backLabel")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="shield" /> {t("pageTitle")}{" "}
              <span className="adm-mode-badge">{t("modeBadge")}</span>
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
          <div className="adm-id-chip">
            <span className="avatar av-r is-orb" aria-hidden="true">
              <GenerativeAvatar seed="admin" className="orb-art" />
            </span>
            <div>
              <div className="adm-id-chip-name">Admin Đurić</div>
              <div className="adm-id-chip-sub">{t("lastLogin")} 15.04.2026 14:22</div>
            </div>
          </div>
          <div className="search" role="search">
            <Icon name="search" />
            <input type="search" aria-label={t("searchLabel")} placeholder={t("searchPh")} />
          </div>
        </div>

        {/* KPI ROW */}
        <div className="adm-stats">
          <div className="card adm-stat">
            <div className="adm-stat-label">{t("kpiActive")}</div>
            <div className="adm-stat-val v-violet">
              {metrics ? metrics.totalUsers.toLocaleString() : "—"}
            </div>
            <div className="adm-trend adm-trend-up">12% od prošle nedelje</div>
            <div className="adm-spark" aria-hidden="true">
              <span className="adm-spark-bar" style={{ height: "45%" }} />
              <span className="adm-spark-bar" style={{ height: "60%" }} />
              <span className="adm-spark-bar" style={{ height: "52%" }} />
              <span className="adm-spark-bar" style={{ height: "72%" }} />
              <span className="adm-spark-bar" style={{ height: "68%" }} />
              <span className="adm-spark-bar" style={{ height: "85%" }} />
              <span className="adm-spark-bar" style={{ height: "100%" }} />
            </div>
          </div>

          <div className="card adm-stat">
            <div className="adm-stat-label">{t("kpiNewReg")}</div>
            <div className="adm-stat-val v-green">
              {metrics ? metrics.newRegistrations7d.toLocaleString() : "—"}
            </div>
            <div className="adm-trend adm-trend-up">8% od prošle nedelje</div>
            <div className="adm-spark" aria-hidden="true">
              <span className="adm-spark-bar" style={{ height: "55%" }} />
              <span className="adm-spark-bar" style={{ height: "65%" }} />
              <span className="adm-spark-bar" style={{ height: "48%" }} />
              <span className="adm-spark-bar" style={{ height: "75%" }} />
              <span className="adm-spark-bar" style={{ height: "62%" }} />
              <span className="adm-spark-bar" style={{ height: "70%" }} />
              <span className="adm-spark-bar" style={{ height: "88%" }} />
            </div>
          </div>

          <div className="card adm-stat">
            <div className="adm-stat-label">{t("kpiActiveHacks")}</div>
            <div className="adm-stat-val v-lemon">
              {metrics ? metrics.activeHackathons.toLocaleString() : "—"}
            </div>
            <div className="adm-trend adm-trend-up">2 nova ove nedelje</div>
            <div className="adm-spark" aria-hidden="true">
              <span className="adm-spark-bar" style={{ height: "70%" }} />
              <span className="adm-spark-bar" style={{ height: "70%" }} />
              <span className="adm-spark-bar" style={{ height: "80%" }} />
              <span className="adm-spark-bar" style={{ height: "80%" }} />
              <span className="adm-spark-bar" style={{ height: "85%" }} />
              <span className="adm-spark-bar" style={{ height: "90%" }} />
              <span className="adm-spark-bar" style={{ height: "100%" }} />
            </div>
          </div>

          <div className="card adm-stat">
            <div className="adm-stat-label">{t("kpiOpenReports")}</div>
            <div className="adm-stat-val v-red">
              {metrics ? metrics.openReports.toLocaleString() : "—"}
            </div>
            <div className="adm-trend adm-trend-down">4 od juče</div>
            <div className="adm-spark" aria-hidden="true">
              <span
                className="adm-spark-bar"
                style={{
                  height: "80%",
                  background: "linear-gradient(180deg,rgba(248,113,113,.5),rgba(248,113,113,.12))",
                }}
              />
              <span
                className="adm-spark-bar"
                style={{
                  height: "95%",
                  background: "linear-gradient(180deg,rgba(248,113,113,.55),rgba(248,113,113,.14))",
                }}
              />
              <span
                className="adm-spark-bar"
                style={{
                  height: "70%",
                  background: "linear-gradient(180deg,rgba(248,113,113,.6),rgba(248,113,113,.16))",
                }}
              />
              <span
                className="adm-spark-bar"
                style={{
                  height: "85%",
                  background: "linear-gradient(180deg,rgba(248,113,113,.65),rgba(248,113,113,.18))",
                }}
              />
              <span
                className="adm-spark-bar"
                style={{
                  height: "75%",
                  background: "linear-gradient(180deg,rgba(248,113,113,.7),rgba(248,113,113,.2))",
                }}
              />
              <span
                className="adm-spark-bar"
                style={{
                  height: "65%",
                  background: "linear-gradient(180deg,rgba(248,113,113,.8),rgba(248,113,113,.24))",
                }}
              />
              <span
                className="adm-spark-bar"
                style={{
                  height: "55%",
                  background: "linear-gradient(180deg,var(--red),rgba(248,113,113,.3))",
                }}
              />
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="adm-tabs" role="tablist" aria-label={t("tabsLabel")}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`hk-tab${filter === tab.id ? " hk-tab-active" : ""}`}
              data-filter={tab.id}
              onClick={() => switchTab(tab.id)}
            >
              {t(tab.labelKey)}
              {tab.count !== undefined && <span className="hk-tab-count">{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* Pregled */}
        <section className="adm-section" data-section="pregled" aria-label={t("tabOverview")}>
          <div className="adm-grid-2">
            {/* Activity chart */}
            <div className="card adm-chart-card">
              <div className="adm-chart">
                <div className="adm-chart-head">
                  <div className="adm-chart-title">{t("chartActivity")}</div>
                  <div className="adm-chart-hint">{t("chartHint")}</div>
                </div>
                {(() => {
                  const activity = metrics?.activity ?? [];
                  const maxA = Math.max(1, ...activity.map((a) => a.count));
                  const lastIdx = activity.length - 1;
                  return activity.map((a, i) => {
                    const label = fmtDay(a.date);
                    return (
                      <div className="adm-bar-row" key={a.date}>
                        <div className="adm-bar-label">
                          {i === lastIdx ? <strong>{label}</strong> : label}
                        </div>
                        <div className="adm-bar-track">
                          <div
                            className="adm-bar-fill"
                            style={{ width: `${Math.round((a.count / maxA) * 100)}%` }}
                          />
                        </div>
                        <div className="adm-bar-value">{a.count.toLocaleString()}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Reports by category chart */}
            <div className="card adm-chart-card">
              <div className="adm-chart">
                <div className="adm-chart-head">
                  <div className="adm-chart-title">{t("chartReports")}</div>
                  <div className="adm-chart-hint">
                    {metrics
                      ? metrics.reportsByCategory.reduce((s, r) => s + r.count, 0).toLocaleString()
                      : "—"}
                  </div>
                </div>
                {(() => {
                  const cats = metrics?.reportsByCategory ?? [];
                  if (cats.length === 0) {
                    return (
                      <div className="adm-bar-row">
                        <div className="adm-bar-label" style={{ color: "var(--muted)" }}>
                          {t("noReportsData")}
                        </div>
                      </div>
                    );
                  }
                  const maxC = Math.max(1, ...cats.map((c) => c.count));
                  const fills = ["", "pink", "crit", "warn", "green"];
                  return cats.map((c, i) => (
                    <div className="adm-bar-row" key={c.category}>
                      <div className="adm-bar-label">{c.category}</div>
                      <div className="adm-bar-track">
                        <div
                          className={`adm-bar-fill${fills[i % fills.length] ? ` ${fills[i % fills.length]}` : ""}`}
                          style={{ width: `${Math.round((c.count / maxC) * 100)}%` }}
                        />
                      </div>
                      <div className="adm-bar-value">{c.count.toLocaleString()}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Server health */}
          <div className="card adm-chart-card">
            <div className="adm-chart">
              <div className="adm-chart-head">
                <div className="adm-chart-title">{t("chartHealth")}</div>
                <div className="adm-chart-hint">{t("healthHintLive")}</div>
              </div>
              {(() => {
                const h = metrics?.health;
                const rows: { key: keyof typeof M; value: number; fill: string }[] = h
                  ? [
                      { key: "hStatPosts", value: h.totalPosts, fill: "" },
                      { key: "hStatTeams", value: h.totalTeams, fill: "" },
                      { key: "hStatHackathons", value: h.totalHackathons, fill: "" },
                      { key: "hStatPendingAppeals", value: h.pendingAppeals, fill: "warn" },
                      { key: "hStatBannedUsers", value: h.bannedUsers, fill: "crit" },
                    ]
                  : [];
                const maxH = Math.max(1, ...rows.map((r) => r.value));
                return rows.map((r) => (
                  <div className="adm-bar-row" key={r.key}>
                    <div className="adm-bar-label">{t(r.key)}</div>
                    <div className="adm-bar-track">
                      <div
                        className={`adm-bar-fill${r.fill ? ` ${r.fill}` : ""}`}
                        style={{ width: `${Math.round((r.value / maxH) * 100)}%` }}
                      />
                    </div>
                    <div className="adm-bar-value">{r.value.toLocaleString()}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </section>

        {/* Prijave sadržaja */}
        <section className="adm-section" data-section="prijave" aria-label={t("tabReports")}>
          <div className="hk-filter-bar">
            <div className="hk-search">
              <Icon name="search" />
              <input
                type="text"
                aria-label={t("filterReportsLabel")}
                placeholder={t("filterReportsPh")}
              />
            </div>
            <div className="hk-chips-row">
              <button className="hk-chip hk-chip-active">
                {t("statusOpen")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip">
                {t("category")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip">
                {t("contentType")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip-sort">
                {t("sortLabel")} <strong>Najnovije</strong>{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
            </div>
          </div>

          {reports.length === 0 ? (
            <div className="app-card">
              <div className="app-card-meta" style={{ color: "var(--muted)" }}>
                {t("noReports")}
              </div>
            </div>
          ) : (
            reports.map((rep) => (
              <div className="app-card" key={rep.reportId}>
                <div className="app-header">
                  <div className="app-avatar av-r is-orb" aria-hidden="true">
                    <GenerativeAvatar seed={rep.reporterUsername} className="orb-art" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="app-card-kind">{reportKindLabel(rep.targetType)}</div>
                    <div className="app-card-meta">
                      {t("reportReportedBy")} <strong>@{rep.reporterUsername}</strong> ·{" "}
                      {fmtDateTime(rep.createdAt)}
                    </div>
                  </div>
                  <span className="status-pill s-pending">
                    <Icon name="flag" /> {rep.targetType}
                  </span>
                </div>
                <div className="adm-report-meta">
                  <span>
                    {t("reportTargetLabel")}{" "}
                    <strong>
                      {rep.targetType} #{rep.targetId}
                    </strong>
                  </span>
                </div>
                <div className="adm-report-quote">{rep.reason}</div>
                <div className="adm-report-actions">
                  <button
                    className="adm-btn-xs danger"
                    onClick={() => handleResolveReport(rep.reportId, "resolved")}
                  >
                    {t("resolveReportBtn")}
                  </button>
                  <button
                    className="adm-btn-xs"
                    onClick={() => handleResolveReport(rep.reportId, "dismissed")}
                  >
                    {t("dismissReport")}
                  </button>
                  <button
                    className="adm-btn-xs"
                    style={{ marginLeft: "auto" }}
                    onClick={() => openProfileModal(rep.reporterId)}
                  >
                    {t("viewProfile")}
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="adm-empty-foot">
            {reports.length} / {reportStats.open} {t("reportsShowOf")}
          </div>
        </section>

        {/* Korisnici */}
        <section className="adm-section" data-section="korisnici" aria-label={t("tabUsers")}>
          <div className="hk-filter-bar">
            <div className="hk-search">
              <Icon name="search" />
              <input
                type="text"
                aria-label={t("filterUsersLabel")}
                placeholder={t("filterUsersPh")}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadUsers(userSearch);
                }}
              />
            </div>
            <div className="hk-chips-row">
              <button className="hk-chip hk-chip-active">
                {t("roleAll")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip">
                {t("status")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip">
                {t("regDate")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip-sort">
                {t("sortLabel")} <strong>{t("sortMostActive")}</strong>{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
            </div>
          </div>

          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">{t("colUser")}</th>
                  <th scope="col">{t("colEmail")}</th>
                  <th scope="col">{t("colRole")}</th>
                  <th scope="col">{t("colStatus")}</th>
                  <th scope="col">{t("colJoined")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    {t("colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--muted)" }}>
                      {t("noUsers")}
                    </td>
                  </tr>
                ) : (
                  adminUsers.map((user) => (
                    <tr key={user.userId}>
                      <td>
                        <div className="adm-user-cell">
                          <div className="adm-user-av av-r is-orb" aria-hidden="true">
                            <GenerativeAvatar seed={user.username} className="orb-art" />
                          </div>
                          <div>
                            <div className="adm-user-name">{user.username}</div>
                            <div className="adm-user-handle">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="adm-email">{user.email}</td>
                      <td>
                        <span className={`status-pill ${rolePillClass(user.role)}`}>
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${user.banned ? "adm-status-suspended" : "adm-status-active"}`}
                        >
                          {user.banned ? t("statusBanned") : t("statusActive")}
                        </span>
                      </td>
                      <td className="adm-email">{fmtDateTime(user.createdAt)}</td>
                      <td>
                        <div className="adm-table-actions">
                          <button
                            className="adm-btn-xs"
                            onClick={() => openProfileModal(user.userId)}
                          >
                            {t("profileBtn")}
                          </button>
                          {user.role !== "admin" && (
                            <button
                              className={`adm-btn-xs ${user.banned ? "ok" : "danger"}`}
                              onClick={() => handleBanUser(user)}
                            >
                              {user.banned ? t("unbanBtn") : t("banBtn")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="adm-empty-foot">
            {adminUsers.length} <a>{t("nextPage")}</a>
          </div>
        </section>

        {/* Organizacije */}
        <section className="adm-section" data-section="organizacije" aria-label={t("tabOrgs")}>
          <div className="adm-subsection-title">
            {t("pendingVerif")} <span className="hk-tab-count">{orgs.pending.length}</span>
            <div className="adm-subsection-sub">{t("pendingVerifSub")}</div>
          </div>

          {orgs.pending.length === 0 ? (
            <div className="adm-org-row">
              <div className="adm-org-info">
                <div className="adm-org-sub" style={{ color: "var(--muted)" }}>
                  {t("noPendingOrgs")}
                </div>
              </div>
            </div>
          ) : (
            orgs.pending.map((org) => (
              <div className="adm-org-row pending" key={org.userId}>
                <div className="adm-org-av" aria-hidden="true">
                  {orgInitials(org.name)}
                </div>
                <div className="adm-org-info">
                  <div className="adm-org-name">{org.name}</div>
                  <div className="adm-org-sub">
                    @{org.username} · {org.contactEmail ?? org.accountEmail} · {t("orgSubmittedOn")}{" "}
                    {fmtDateTime(org.submittedAt)}
                    {org.websiteUrl ? ` · ${org.websiteUrl}` : ""}
                  </div>
                </div>
                <div className="adm-org-actions">
                  <button className="adm-btn-xs ok" onClick={() => handleVerifyOrg(org.userId)}>
                    <Icon name="check" /> {t("verifyBtn")}
                  </button>
                  <button className="adm-btn-xs danger" onClick={() => handleRejectOrg(org.userId)}>
                    {t("rejectVerifBtn")}
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="adm-subsection-title" style={{ marginTop: "14px" }}>
            {t("verifiedOrgs")} <span className="hk-tab-count">{orgs.verified.length}</span>
          </div>

          {orgs.verified.length === 0 ? (
            <div className="adm-org-row">
              <div className="adm-org-info">
                <div className="adm-org-sub" style={{ color: "var(--muted)" }}>
                  {t("noVerifiedOrgs")}
                </div>
              </div>
            </div>
          ) : (
            orgs.verified.map((org) => (
              <div className="adm-org-row" key={org.userId}>
                <div className="adm-org-av" aria-hidden="true">
                  {orgInitials(org.name)}
                </div>
                <div className="adm-org-info">
                  <div className="adm-org-name">
                    {org.name}{" "}
                    <span className="hk-verify">
                      <Icon name="check" />
                    </span>
                  </div>
                  <div className="adm-org-sub">
                    {org.websiteUrl ?? org.contactEmail ?? "—"} · {t("orgVerifiedOn")}
                    {org.reviewedAt ? ` ${fmtDateTime(org.reviewedAt)}` : ""}
                  </div>
                </div>
                <div className="adm-org-actions">
                  <button className="adm-btn-xs danger" onClick={() => handleRevokeOrg(org.userId)}>
                    {t("revokeVerifBtn")}
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="adm-subsection-title" style={{ marginTop: "14px" }}>
            {t("rejectedOrgs")} <span className="hk-tab-count">{orgs.rejected.length}</span>
          </div>

          {orgs.rejected.length === 0 ? (
            <div className="adm-org-row">
              <div className="adm-org-info">
                <div className="adm-org-sub" style={{ color: "var(--muted)" }}>
                  {t("noRejectedOrgs")}
                </div>
              </div>
            </div>
          ) : (
            orgs.rejected.map((org) => (
              <div className="adm-org-row" key={org.userId}>
                <div className="adm-org-av" aria-hidden="true">
                  {orgInitials(org.name)}
                </div>
                <div className="adm-org-info">
                  <div className="adm-org-name">{org.name}</div>
                  <div className="adm-org-sub">
                    @{org.username} · {t("orgRejectedOn")}
                    {org.reviewedAt ? ` ${fmtDateTime(org.reviewedAt)}` : ""}
                    {org.rejectionReason ? ` · ${t("orgReasonLabel")}: ${org.rejectionReason}` : ""}
                  </div>
                </div>
                <div className="adm-org-actions">
                  <button className="adm-btn-xs ok" onClick={() => handleVerifyOrg(org.userId)}>
                    <Icon name="check" /> {t("verifyBtn")}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Audit log */}
        <section className="adm-section" data-section="audit" aria-label={t("tabAudit")}>
          <div className="hk-filter-bar">
            <div className="hk-search">
              <Icon name="search" />
              <input
                type="text"
                aria-label={t("auditFilterLabel")}
                placeholder={t("auditFilterPh")}
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadAudit(auditSearch);
                }}
              />
            </div>
            <div className="hk-chips-row">
              <button className="hk-chip hk-chip-active">
                {t("adminAll")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip">
                {t("actionType")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip">
                {t("period7")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip-sort">
                {t("sortLabel")} <strong>Najnovije</strong>{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: "8px" }}>
            <div className="adm-timeline">
              {auditLoading && auditEntries.length === 0 ? (
                <div className="adm-tl-item">
                  <div className="adm-tl-target" style={{ color: "var(--muted)" }}>
                    {t("loadingData")}
                  </div>
                </div>
              ) : auditEntries.length === 0 ? (
                <div className="adm-tl-item">
                  <div className="adm-tl-target" style={{ color: "var(--muted)" }}>
                    {t("noAuditEntries")}
                  </div>
                </div>
              ) : (
                auditEntries.map((entry) => (
                  <div className="adm-tl-item" key={entry.logId}>
                    <div className={`adm-tl-dot ${auditDotClass(entry.action)}`} />
                    <div className="adm-tl-head">
                      <span className="adm-tl-admin">
                        {entry.actorUsername ?? t("systemActor")}
                      </span>
                      <span className="adm-tl-action">{entry.action}</span>
                      <span className="adm-tl-time">{fmtDateTime(entry.createdAt)}</span>
                    </div>
                    <div className="adm-tl-target">{entry.summary}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="adm-empty-foot">
            {auditEntries.length} <a>{t("loadMore")}</a>
          </div>
        </section>

        {/* Žalbe */}
        <section className="adm-section" data-section="zalbe" aria-label={t("tabAppeals")}>
          <div className="hk-filter-bar">
            <div className="hk-search">
              <Icon name="search" />
              <input
                type="text"
                aria-label={t("appealsFilterLabel")}
                placeholder={t("appealsFilterPh")}
              />
            </div>
            <div className="hk-chips-row">
              <button className="hk-chip hk-chip-active">
                {t("appealStatusPending")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip">
                {t("measureType")}{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
              <button className="hk-chip-sort">
                {t("sortLabel")} <strong>Najnovije</strong>{" "}
                <span className="hk-chip-arrow">
                  <Icon name="chevron-down" />
                </span>
              </button>
            </div>
          </div>

          {/* Pending appeals */}
          {pendingAppeals.length === 0 ? (
            <div className="app-card">
              <div className="app-card-meta" style={{ color: "var(--muted)" }}>
                {t("noPendingAppeals")}
              </div>
            </div>
          ) : (
            pendingAppeals.map((ap) => (
              <div className="app-card" key={ap.appealId}>
                <div className="app-header">
                  <div className="app-avatar av-r is-orb" aria-hidden="true">
                    <GenerativeAvatar seed={ap.username} className="orb-art" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="app-card-kind">{t("appealKind")}</div>
                    <div className="app-card-meta">
                      {t("appealSubmittedBy")} <strong>@{ap.username}</strong> ·{" "}
                      {fmtDateTime(ap.createdAt)}
                    </div>
                  </div>
                  <span className="status-pill s-pending">{t("statusPendingShort")}</span>
                </div>
                <div className="adm-report-quote message">{ap.reason}</div>
                <div className="adm-report-actions">
                  <button
                    className="adm-btn-xs ok"
                    onClick={() =>
                      openAppealModal("approve", ap.username, t("appealKind"), ap.appealId)
                    }
                  >
                    <Icon name="check" /> {t("approveAppealBtn")}
                  </button>
                  <button
                    className="adm-btn-xs danger"
                    onClick={() =>
                      openAppealModal("reject", ap.username, t("appealKind"), ap.appealId)
                    }
                  >
                    {t("rejectAppealBtn")}
                  </button>
                  <button
                    className="adm-btn-xs"
                    style={{ marginLeft: "auto" }}
                    onClick={() => openProfileModal(ap.username)}
                  >
                    {t("userProfileBtn")}
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="adm-subsection-title" style={{ marginTop: "10px" }}>
            {t("closedAppeals")}
            <div className="adm-subsection-sub">{t("closedAppealsSub")}</div>
          </div>

          {/* Closed appeals */}
          {closedAppeals.length === 0 ? (
            <div className="app-card" style={{ opacity: 0.7 }}>
              <div className="app-card-meta" style={{ color: "var(--muted)" }}>
                {t("noClosedAppeals")}
              </div>
            </div>
          ) : (
            closedAppeals.map((ap) => {
              const approved = ap.status === "approved";
              return (
                <div className="app-card" style={{ opacity: 0.7 }} key={ap.appealId}>
                  <div className="app-header">
                    <div className="app-avatar av-v is-orb" aria-hidden="true">
                      <GenerativeAvatar seed={ap.username} className="orb-art" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="app-card-kind">{t("appealKind")}</div>
                      <div className="app-card-meta">
                        {t("appealSubmittedBy")} <strong>@{ap.username}</strong> ·{" "}
                        {fmtDateTime(ap.createdAt)}
                      </div>
                    </div>
                    <span
                      className={`status-pill ${approved ? "adm-status-active" : "adm-status-removed"}`}
                    >
                      {approved ? t("statusApproved") : t("statusRejected")}
                    </span>
                  </div>
                  <div className="adm-report-quote message">{ap.reason}</div>
                  <div className="adm-report-actions">
                    {ap.reviewNote ? (
                      <div
                        style={{
                          fontSize: "12px",
                          color: approved ? "var(--green)" : "var(--muted)",
                        }}
                      >
                        {t("reviewResponse")} {ap.reviewNote}
                      </div>
                    ) : null}
                    <button
                      className="adm-btn-xs"
                      style={{ marginLeft: "auto" }}
                      onClick={() => openProfileModal(ap.username)}
                    >
                      {t("profileBtn")}
                    </button>
                  </div>
                </div>
              );
            })
          )}

          <div className="adm-empty-foot">
            {pendingAppeals.length + closedAppeals.length} <a>{t("loadMore")}</a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="adm-footer">
          <div className="adm-footer-links">
            <a>{t("footerAbout")}</a>
            <span className="adm-footer-sep">·</span>
            <a>{t("footerHandbook")}</a>
            <span className="adm-footer-sep">·</span>
            <a>{t("footerPrivacy")}</a>
          </div>
          <div className="adm-footer-cw">
            <b>tiki</b>miki admin © 2026
          </div>
        </footer>
      </main>

      {/* Modals */}

      {/* Remove content modal */}
      <div
        className={`modal-overlay${activeModal === "modal-remove" ? " open" : ""}`}
        id="modal-remove"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-remove-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-title" id="modal-remove-title">
            {t("modalRemoveTitle")}
          </div>
          <div className="modal-sub">{t("modalRemoveSub")}</div>
          <textarea
            aria-label={t("modalRemoveTextAria")}
            placeholder={t("modalRemoveTextPh")}
            value={modalReason}
            onChange={(e) => setModalReason(e.target.value)}
          />
          <div className="modal-actions">
            <button className="modal-cancel" onClick={closeModal}>
              {t("cancelBtn")}
            </button>
            <button className="modal-confirm" onClick={confirmModal}>
              {t("modalRemoveConfirm")}
            </button>
          </div>
        </div>
      </div>

      {/* Suspend / ban modal */}
      <div
        className={`modal-overlay${activeModal === "modal-suspend" ? " open" : ""}`}
        id="modal-suspend"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-suspend-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-title" id="modal-suspend-title">
            {t("modalSuspendTitle")}
          </div>
          <div className="modal-sub">{t("modalSuspendSub")}</div>
          <textarea
            aria-label={t("modalSuspendTextAria")}
            placeholder={t("modalSuspendTextPh")}
            value={modalReason}
            onChange={(e) => setModalReason(e.target.value)}
          />
          <div className="modal-actions">
            <button className="modal-cancel" onClick={closeModal}>
              {t("cancelBtn")}
            </button>
            <button className="modal-confirm" onClick={confirmModal}>
              {t("modalSuspendConfirm")}
            </button>
          </div>
        </div>
      </div>

      {/* Reject verification modal */}
      <div
        className={`modal-overlay${activeModal === "modal-reject" ? " open" : ""}`}
        id="modal-reject"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-reject-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-title" id="modal-reject-title">
            {t("modalRejectVerifTitle")}
          </div>
          <div className="modal-sub">{t("modalRejectVerifSub")}</div>
          <textarea
            aria-label={t("modalRejectVerifAria")}
            placeholder={t("modalRejectVerifPh")}
            value={modalReason}
            onChange={(e) => setModalReason(e.target.value)}
          />
          <div className="modal-actions">
            <button className="modal-cancel" onClick={closeModal}>
              {t("cancelBtn")}
            </button>
            <button className="modal-confirm" onClick={confirmModal}>
              {t("modalRejectVerifConfirm")}
            </button>
          </div>
        </div>
      </div>

      {/* Revoke verification modal */}
      <div
        className={`modal-overlay${activeModal === "modal-revoke" ? " open" : ""}`}
        id="modal-revoke"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-revoke-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-title" id="modal-revoke-title" style={{ color: "var(--red)" }}>
            {t("modalRevokeTitle")}
          </div>
          <div className="modal-sub">{t("modalRevokeSub")}</div>
          <textarea
            aria-label={t("modalRevokeAria")}
            placeholder={t("modalRevokePh")}
            value={modalReason}
            onChange={(e) => setModalReason(e.target.value)}
          />
          <div className="modal-actions">
            <button className="modal-cancel" onClick={closeModal}>
              {t("cancelBtn")}
            </button>
            <button className="modal-confirm" onClick={confirmModal}>
              {t("modalRevokeConfirm")}
            </button>
          </div>
        </div>
      </div>

      {/* Appeal approve/reject modal (component) */}
      <AdminAppealPopup request={appeal} onClose={closeAppealModal} onConfirm={confirmAppeal} />

      {/* User profile modal — resolves the key into the admin fixtures; a miss
          renders the empty modal shell. */}
      <AdminProfilePopup
        profile={profileUser ? (USER_PROFILES[profileUser] ?? null) : null}
        onClose={() => setProfileUser(null)}
      />

      {/* TOAST */}
      <div
        className={`toast t-${toast.type}${toast.show ? " show" : ""}`}
        id="admin-toast"
        role="status"
        aria-live="polite"
      >
        {toast.msg}
      </div>
    </AppShell>
  );
}

export default AdminClient;
