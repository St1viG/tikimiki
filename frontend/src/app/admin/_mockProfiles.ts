/**
 * MOCK DATA — admin user-profile fixtures.
 *
 * Static placeholder profiles. These are NOT real users and contain no live
 * data — they exist only so the `AdminProfilePopup` has something to render
 * until a real `GET /admin/users/:id/profile` endpoint exists.
 *
 * Decoupled from the presentational `AdminProfilePopup` (which is now
 * prop-driven). Callers resolve a key into this map and pass the resulting
 * `UserProfile` (or `null`) to the popup.
 */

export interface ActivityItem {
  time: string;
  action: string;
  detail: string;
}

export interface MeasureItem {
  time: string;
  type: string;
  detail: string;
  by: string;
}

export interface UserProfile {
  av: string;
  avCls: string;
  name: string;
  handle: string;
  email: string;
  role: string;
  roleCls: string;
  status: string;
  statusCls: string;
  joined: string;
  reports: number;
  activity: ActivityItem[];
  measures: MeasureItem[];
}

export const USER_PROFILES: Record<string, UserProfile> = {
  stivig: {
    av: "SG",
    avCls: "av-v",
    name: "Stevan Gnjato",
    handle: "@stivig",
    email: "stevan.gnjato@etf.edu.rs",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Aktivan",
    statusCls: "adm-status-active",
    joined: "12.09.2023",
    reports: 0,
    activity: [
      { time: "16.04.2026 10:15", action: "Prijavio se na hackathon", detail: "ETF HackWeek 2026" },
      { time: "15.04.2026 22:30", action: "Objavio komentar", detail: "ETF HackWeek 2026 – opšti kanal" },
      { time: "15.04.2026 18:00", action: "Odigrao Daily Spin", detail: "Osvojio 50 XP" },
      { time: "14.04.2026 14:22", action: "Prijavio sadržaj", detail: "@real_elon_musk – lažni identitet" },
    ],
    measures: [],
  },
  andrejc: {
    av: "AČ",
    avCls: "av-t",
    name: "Andrej Čolić",
    handle: "@andrejc",
    email: "andrej.colic@etf.edu.rs",
    role: "Moderator",
    roleCls: "adm-role-mod",
    status: "Aktivan",
    statusCls: "adm-status-active",
    joined: "05.10.2023",
    reports: 1,
    activity: [
      { time: "16.04.2026 09:00", action: "Pregledao prijave sadržaja", detail: "3 prijave zatvorene" },
      { time: "14.04.2026 11:30", action: "Objavio komentar", detail: "ETF HackWeek 2026 – opšti kanal" },
      { time: "12.04.2026 17:00", action: "Odigrao Daily Minigame", detail: "Rezultat 5/5, +150 XP" },
    ],
    measures: [
      { time: "10.03.2026", type: "Upozorenje", detail: "Neprikladna komunikacija u kanalu", by: "Admin Đurić" },
    ],
  },
  xUser99: {
    av: "XU",
    avCls: "av-r",
    name: "xUser99",
    handle: "@xUser99",
    email: "xuser99@protonmail.com",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Suspendovan do 16.05.2026",
    statusCls: "adm-status-suspended",
    joined: "01.02.2026",
    reports: 8,
    activity: [
      { time: "14.04.2026 13:50", action: "Poslao 14 direktnih poruka", detail: "@annap – za 2h (uznemiravanje)" },
      { time: "13.04.2026 20:10", action: "Objavio komentar", detail: "ETF HackWeek 2026 – opšti kanal" },
      { time: "10.04.2026 11:00", action: "Prijavio se na hackathon", detail: "ETF HackWeek 2026" },
    ],
    measures: [
      { time: "14.04.2026", type: "Suspenzija (30 dana)", detail: "Uznemiravanje – 3 prijave", by: "Admin Đurić" },
      { time: "16.04.2026", type: "Upozorenje", detail: "Neprimereno ponašanje u komentarima", by: "Admin Đurić" },
    ],
  },
  crypto_bot_42: {
    av: "CB",
    avCls: "av-r",
    name: "crypto_bot_42",
    handle: "@crypto_bot_42",
    email: "bot42@tempmail.xyz",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Suspendovan do 23.04.2026",
    statusCls: "adm-status-suspended",
    joined: "10.03.2026",
    reports: 14,
    activity: [
      { time: "16.04.2026 10:00", action: "Poslao 11 direktnih poruka", detail: "Spam/invest sadržaj" },
      { time: "15.04.2026 22:00", action: "Registrovao nalog", detail: "Kreiran sa tempmail adresom" },
    ],
    measures: [
      { time: "16.04.2026", type: "Suspenzija (7 dana)", detail: "Spam poruke – 11 prijava", by: "Admin Đurić" },
    ],
  },
  nenads: {
    av: "NS",
    avCls: "av-v",
    name: "Nenad Skoković",
    handle: "@nenads",
    email: "nenad.skokovic@etf.edu.rs",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Aktivan",
    statusCls: "adm-status-active",
    joined: "15.09.2023",
    reports: 0,
    activity: [
      { time: "15.04.2026 16:00", action: "Prijavio se na hackathon", detail: "Nordeus Game Jam 2026" },
      { time: "14.04.2026 12:00", action: "Odigrao Daily Minigame", detail: "Rezultat 4/5, +120 XP" },
      { time: "13.04.2026 09:30", action: "Odigrao Daily Spin", detail: "Osvojio 100 XP" },
    ],
    measures: [],
  },
  dimitrijep: {
    av: "DP",
    avCls: "av-v",
    name: "Dimitrije Pešić",
    handle: "@dimitrijep",
    email: "dimitrije.pesic@etf.edu.rs",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Aktivan",
    statusCls: "adm-status-active",
    joined: "20.09.2023",
    reports: 2,
    activity: [
      { time: "16.04.2026 08:00", action: "Prijavio objavu", detail: "@fakeNews – lažne informacije" },
      { time: "15.04.2026 15:30", action: "Kreirao tim", detail: '"Hack Attack Squad"' },
      { time: "14.04.2026 10:00", action: "Prijavio se na hackathon", detail: "ETF HackWeek 2026" },
    ],
    measures: [],
  },
  anon_player: {
    av: "AP",
    avCls: "av-r",
    name: "anon_player",
    handle: "@anon_player",
    email: "—",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Aktivan",
    statusCls: "adm-status-active",
    joined: "05.03.2026",
    reports: 4,
    activity: [
      { time: "16.04.2026 09:30", action: "Objavio komentar", detail: "ETF HackWeek 2026 – opšti kanal (uvredljiv sadržaj)" },
      { time: "10.03.2026 14:00", action: "Registrovao nalog", detail: "Bez GitHub veze" },
    ],
    measures: [],
  },
  real_elon_musk: {
    av: "EM",
    avCls: "av-r",
    name: "real_elon_musk",
    handle: "@real_elon_musk",
    email: "—",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Aktivan",
    statusCls: "adm-status-active",
    joined: "13.04.2026",
    reports: 7,
    activity: [
      { time: "13.04.2026 20:00", action: "Kreirao profil", detail: "Lažni identitet – verifikacija nije podneta" },
      { time: "13.04.2026 20:05", action: "Objavio na feed-u", detail: "Lažne tvrdnje o identitetu" },
    ],
    measures: [],
  },
  fakeNews: {
    av: "FN",
    avCls: "av-r",
    name: "fakeNews",
    handle: "@fakeNews",
    email: "—",
    role: "Član",
    roleCls: "adm-role-clan",
    status: "Aktivan",
    statusCls: "adm-status-active",
    joined: "01.04.2026",
    reports: 2,
    activity: [
      { time: "16.04.2026 07:30", action: "Objavio na feed-u", detail: "Lažne informacije o HackWeek 2026 otkazivanju" },
      { time: "01.04.2026 12:00", action: "Registrovao nalog", detail: "" },
    ],
    measures: [],
  },
};
