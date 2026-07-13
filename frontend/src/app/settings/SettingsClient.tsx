"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/Icon";
import { OrbArt } from "@/components/ui/OrbArt";
import { PremiumBadge } from "@/components/ui/PremiumBadge";
import { ImageCropper } from "@/components/ImageCropper";
import { cropImageToRatio } from "@/lib/cropImage";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useLanguage, useT } from "@/components/i18n/LanguageProvider";
import { useAuth, useRequireAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";

/**
 * SettingsClient — the interactive settings surface.
 *
 * Behaviour:
 *  - Sub-nav tab switching (aria-selected + active panel).
 *  - Character counters with the `.warn` threshold at 85% of max.
 *  - The display-name field on "Izgled profila" and on "Nalog" stay in sync, and
 *    both feed the live profile-preview right rail (name / handle / bio).
 *  - Skills editor: add on Enter/comma, remove via the chip ✕; both update the
 *    preview skill chips. Enter/Space activate the role=button remove chips.
 *  - Username-colour picker: selecting a swatch tints `#color-preview` and the
 *    preview name, with the animated lemon ring (CSS .selected).
 *  - Password strength/match hint.
 *  - Per-card save-status check pop (visible for 2.5s).
 *  - Danger zone + logout use native confirm()/alert().
 *  - Premium flow: plan selector, reveal payment form, simulate payment → active
 *    state with computed expiry, cancel auto-renew.
 *
 * The page-specific right rail shares live state with the form, so this component
 * owns the <AppShell> and supplies both the <main> and the custom profile-preview
 * <aside> (via the `right` prop).
 */

type PanelId =
  "izgled-profila" | "nalog" | "integracije" | "privatnost" | "premium" | "opasno" | "odjava";

type Plan = "mesecno" | "godisnje";

// Fixed crop shapes for the identity images. Banner 3:1 matches the recommended
// 1500×500 size; avatar is a plain square.
const AVATAR_RATIO = 1;
const BANNER_RATIO = 3;

/** A freshly-picked static image being positioned before upload. */
interface CropTarget {
  kind: "avatar" | "banner";
  file: File;
  previewUrl: string;
  imgRatio: number;
  focalX: number;
  focalY: number;
  zoom: number;
}

const MONTHS: Record<"en" | "sr", string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  sr: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"],
};

const TABS: {
  id: PanelId;
  icon: string;
  labelKey: keyof typeof M;
  danger?: boolean;
}[] = [
  { id: "izgled-profila", icon: "image", labelKey: "tabProfile" },
  { id: "nalog", icon: "lock", labelKey: "tabAccount" },
  { id: "integracije", icon: "link", labelKey: "tabIntegrations" },
  { id: "privatnost", icon: "shield", labelKey: "tabPrivacy" },
  { id: "premium", icon: "premium", labelKey: "tabPremium" },
  { id: "opasno", icon: "flag", labelKey: "tabDelete", danger: true },
  { id: "odjava", icon: "logout", labelKey: "tabLogout", danger: true },
];

const M = {
  // sub-nav tabs
  tabProfile: { en: "Profile appearance", sr: "Izgled profila" },
  tabAccount: { en: "Account", sr: "Nalog" },
  tabIntegrations: { en: "Integrations", sr: "Integracije" },
  tabPrivacy: { en: "Privacy", sr: "Privatnost" },
  tabPremium: { en: "Premium", sr: "Premium" },
  tabDelete: { en: "Delete profile", sr: "Brisanje profila" },
  tabLogout: { en: "Log out", sr: "Odjavi se" },

  // page head
  pageTitle: { en: "Settings", sr: "Podešavanja" },
  pageSub: {
    en: "Manage your profile, account, privacy and Premium options.",
    sr: "Upravljaj profilom, nalogom, privatnošću i Premium opcijama.",
  },
  back: { en: "Back", sr: "Nazad" },
  subnavAria: { en: "Settings sections", sr: "Sekcije podešavanja" },

  // right rail (profile preview)
  searchAria: { en: "Search", sr: "Pretraži" },
  searchPlaceholder: { en: "Search…", sr: "Pretraži…" },
  profilePreview: { en: "Profile preview", sr: "Pregled profila" },
  badgeHackathon: { en: "Hackathon participant", sr: "Učesnik hackathona" },
  badgeGithub: { en: "GitHub connected", sr: "GitHub integrisan" },
  skills: { en: "Skills", sr: "Veštine" },
  statHackathons: { en: "Hackathons", sr: "Hackathoni" },
  statWins: { en: "Wins", sr: "Pobede" },
  statXp: { en: "XP", sr: "XP" },
  about: { en: "About", sr: "O nama" },
  accessibility: { en: "Accessibility", sr: "Pristupačnost" },
  helpCenter: { en: "Help center", sr: "Centar za pomoć" },
  privacyTerms: { en: "Privacy & terms", sr: "Privatnost i uslovi" },

  // common buttons / save status
  save: { en: "Save", sr: "Sačuvaj" },
  reset: { en: "Reset", sr: "Poništi" },
  saved: { en: "Saved", sr: "Sačuvano" },
  notSavedYet: {
    en: "Saving not available yet",
    sr: "Čuvanje još nije dostupno",
  },

  // language card
  languageTitle: { en: "Language", sr: "Jezik" },
  languageSub: {
    en: "The main language is English — switch to Serbian",
    sr: "Glavni jezik je engleski — promeni na srpski",
  },

  // theme card
  themeTitle: { en: "Site theme", sr: "Tema sajta" },
  themeSub: {
    en: "Look of the whole platform — applies instantly and is remembered",
    sr: "Izgled cele platforme — primenjuje se odmah i pamti se",
  },

  // avatar & banner card
  avatarBannerTitle: { en: "Avatar & banner", sr: "Avatar i baner" },
  avatarBannerSub: {
    en: "Personalize how you look on the platform",
    sr: "Personalizuj kako izgledaš na platformi",
  },
  banner: { en: "Banner", sr: "Baner" },
  changeBanner: { en: "Change banner", sr: "Promeni baner" },
  setBanner: { en: "Set banner", sr: "Postavi baner" },
  cropAvatarLabel: { en: "Avatar 1:1", sr: "Avatar 1:1" },
  cropBannerLabel: { en: "Banner 3:1", sr: "Baner 3:1" },
  cropHint: {
    en: "Drag to reposition · slider to zoom",
    sr: "Prevuci da pomeriš · klizač za zum",
  },
  cropApply: { en: "Apply", sr: "Primeni" },
  bannerPremiumHint: {
    en: "The profile banner is a Premium feature.",
    sr: "Baner na profilu je Premium funkcija.",
  },
  bannerUpload: { en: "Banner upload", sr: "Upload banera" },
  bannerHint: {
    en: "Recommended size: 1500×500px · PNG, JPG, GIF",
    sr: "Preporučena veličina: 1500×500px · PNG, JPG, GIF",
  },
  avatarUpload: { en: "Avatar upload", sr: "Upload avatara" },
  changeImage: { en: "Change image", sr: "Promeni sliku" },
  remove: { en: "Remove", sr: "Ukloni" },
  uploading: { en: "Uploading…", sr: "Otpremanje…" },
  removing: { en: "Removing…", sr: "Uklanjanje…" },
  uploadFailed: {
    en: "Upload failed. Please try again.",
    sr: "Otpremanje nije uspelo. Pokušaj ponovo.",
  },
  removeFailed: {
    en: "Could not remove the image. Please try again.",
    sr: "Uklanjanje slike nije uspelo. Pokušaj ponovo.",
  },
  avatarRemoved: { en: "Avatar removed", sr: "Avatar uklonjen" },
  bannerRemoved: { en: "Banner removed", sr: "Baner uklonjen" },

  // basic info card
  basicInfoTitle: { en: "Basic information", sr: "Osnovne informacije" },
  basicInfoSub: {
    en: "Display name, username and profile description",
    sr: "Prikazano ime, korisničko ime i opis profila",
  },
  displayName: { en: "Display name", sr: "Prikazano ime" },
  username: { en: "Username", sr: "Korisničko ime" },
  bio: { en: "Bio", sr: "Bio" },
  bioPlaceholder: {
    en: "Briefly introduce yourself...",
    sr: "Kratko predstavi sebe...",
  },
  location: { en: "Location", sr: "Lokacija" },
  locationPlaceholder: { en: "City, Country", sr: "Grad, Država" },
  website: { en: "Website", sr: "Vebsajt" },

  // skills card
  skillsSub: {
    en: "Add technologies you use, visible on your profile and used for AI matching",
    sr: "Dodaj tehnologije koje koristiš, vidljive na profilu i koriste se za AI matching",
  },
  techAndTools: { en: "Technologies & tools", sr: "Tehnologije i alati" },
  addSkill: { en: "Add a skill...", sr: "Dodaj veštinu..." },
  addSkillAria: { en: "Add a skill", sr: "Dodaj veštinu" },
  skillsHint: {
    en: "Press Enter or comma to add a skill",
    sr: "Pritisni Enter ili zarez da dodaš veštinu",
  },
  removeSkill: { en: "Remove", sr: "Ukloni" },

  // username color card
  colorTitle: { en: "Username color", sr: "Boja korisničkog imena" },
  colorSub: {
    en: "Choose the color your username is displayed in",
    sr: "Izaberi boju u kojoj se prikazuje tvoje korisničko ime",
  },
  availableColors: { en: "Available colors", sr: "Dostupne boje" },
  colorGroupAria: {
    en: "Username color selection",
    sr: "Izbor boje korisničkog imena",
  },
  colorPurple: { en: "Purple", sr: "Ljubičasta" },
  colorGreen: { en: "Green", sr: "Zelena" },
  colorYellow: { en: "Yellow", sr: "Žuta" },
  colorPink: { en: "Pink", sr: "Roze" },
  colorTeal: { en: "Teal", sr: "Tirkizna" },
  colorRed: { en: "Red", sr: "Crvena" },
  colorLight: { en: "Light", sr: "Svetla" },

  // premium personalization card
  premiumPersTitle: {
    en: "Premium personalization",
    sr: "Premium personalizacija",
  },
  premiumPersSub: {
    en: "Exclusive options available to premium members",
    sr: "Ekskluzivne opcije dostupne premium članovima",
  },
  gifAvatar: { en: "GIF avatar", sr: "GIF avatar" },
  uploadGifAvatar: { en: "Upload GIF avatar", sr: "Upload GIF avatara" },
  gifAvatarHint: { en: "Max 8MB · GIF, APNG", sr: "Maks. 8MB · GIF, APNG" },
  gifBanner: { en: "GIF banner", sr: "GIF baner" },
  gifBannerHint: { en: "Max 15MB · GIF, APNG", sr: "Maks. 15MB · GIF, APNG" },

  // account: display name card
  accDisplayNameSub: {
    en: "The name shown to other users on the platform",
    sr: "Ime koje se prikazuje ostalim korisnicima na platformi",
  },
  displayNameHint: { en: "(display name)", sr: "(display name)" },

  // account: email card
  emailTitle: { en: "Email address", sr: "Email adresa" },
  emailSub: {
    en: "The address where you receive notifications and confirmations",
    sr: "Adresa na koju primaš obaveštenja i potvrde",
  },
  currentEmail: { en: "Current email", sr: "Trenutni email" },
  newEmail: { en: "New email", sr: "Novi email" },
  confirmEmail: { en: "Confirm email", sr: "Potvrdi email" },
  verificationSent: {
    en: "Verification email sent",
    sr: "Poslat verifikacioni mejl",
  },
  changeEmailBtn: { en: "Change email", sr: "Promeni email" },
  verifyEmailBtn: { en: "Verify email", sr: "Verifikuj email" },
  emailChangeSent: {
    en: "A confirmation link was sent to the new address.",
    sr: "Link za potvrdu je poslat na novu adresu.",
  },
  emailChangeFailed: {
    en: "Could not change email. Please try again.",
    sr: "Promena email-a nije uspela. Pokušaj ponovo.",
  },
  emailAlreadyVerified: {
    en: "Your email is already verified.",
    sr: "Tvoj email je već verifikovan.",
  },
  verifyFailed: {
    en: "Could not send verification email. Please try again.",
    sr: "Slanje verifikacionog mejla nije uspelo. Pokušaj ponovo.",
  },
  devVerificationLink: {
    en: "Verification link (dev)",
    sr: "Verifikacioni link (dev)",
  },

  // account: password card
  passwordTitle: { en: "Password", sr: "Lozinka" },
  passwordSub: {
    en: "We recommend a strong password mixing letters, numbers and symbols",
    sr: "Preporučujemo jaku lozinku sa kombinacijom slova, brojeva i simbola",
  },
  currentPassword: { en: "Current password", sr: "Trenutna lozinka" },
  newPassword: { en: "New password", sr: "Nova lozinka" },
  confirmNewPassword: {
    en: "Confirm new password",
    sr: "Potvrdi novu lozinku",
  },
  passwordChanged: { en: "Password changed", sr: "Lozinka promenjena" },
  changePassword: { en: "Change password", sr: "Promeni lozinku" },
  pwMin: {
    en: "Password must be at least 8 characters",
    sr: "Lozinka mora imati najmanje 8 karaktera",
  },
  pwShort: { en: "Password is too short", sr: "Lozinka je prekratka" },
  pwNoMatch: { en: "Passwords do not match", sr: "Lozinke se ne poklapaju" },
  pwMatch: { en: "Passwords match ✓", sr: "Lozinke se poklapaju ✓" },
  pwStrong: { en: "Password is strong enough", sr: "Lozinka je dovoljno jaka" },

  // integrations
  connectedAccountsTitle: { en: "Connected accounts", sr: "Povezani nalozi" },
  connectedAccountsSub: {
    en: "Integrations are used for skill verification and quick sign-in",
    sr: "Integracije se koriste za verifikaciju veština i brzu prijavu",
  },
  contributions: { en: "847 contributions", sr: "847 kontribucija" },
  connected: { en: "Connected", sr: "Povezan" },
  linkedinNotConnected: {
    en: "Not connected. Connect for professional verification",
    sr: "Nije povezan. Poveži za profesionalnu verifikaciju",
  },
  connect: { en: "Connect", sr: "Poveži" },
  disconnect: { en: "Disconnect", sr: "Prekini vezu" },
  notConnected: { en: "Not connected", sr: "Nije povezan" },
  disconnectFailed: {
    en: "Could not disconnect. Please try again.",
    sr: "Prekidanje veze nije uspelo. Pokušaj ponovo.",
  },
  oauthLinked: { en: "Account linked successfully.", sr: "Nalog je uspešno povezan." },
  oauthConflict: {
    en: "That account is already linked to another profile.",
    sr: "Taj nalog je već povezan sa drugim profilom.",
  },
  oauthLinkFailed: {
    en: "Linking failed. Please try again.",
    sr: "Povezivanje nije uspelo. Pokušaj ponovo.",
  },
  syncGithub: { en: "Sync GitHub", sr: "Sinhronizuj GitHub" },
  syncGithubBusy: { en: "Syncing…", sr: "Sinhronizacija…" },
  syncGithubSuccess: {
    en: "GitHub skills synced.",
    sr: "GitHub veštine su sinhronizovane.",
  },
  syncGithubFailed: {
    en: "Could not sync GitHub. Please try again.",
    sr: "Sinhronizacija sa GitHub-om nije uspela. Pokušaj ponovo.",
  },
  settingsSaveFailed: {
    en: "Could not save setting. Please try again.",
    sr: "Čuvanje podešavanja nije uspelo. Pokušaj ponovo.",
  },
  googleSub: {
    en: "Used for sign-in and calendar integration",
    sr: "Koristi se za prijavu i kalendar integraciju",
  },
  skillSyncTitle: { en: "GitHub skill sync", sr: "GitHub skill sync" },
  skillSyncSub: {
    en: "Manage automatic skill synchronization from GitHub",
    sr: "Upravljanje automatskom sinhronizacijom veština sa GitHub-a",
  },
  autoSync: { en: "Automatic synchronization", sr: "Automatska sinhronizacija" },
  autoSyncSub: {
    en: "Pulls data from GitHub once a day and updates the skill card",
    sr: "Jednom dnevno povlači podatke sa GitHub-a i ažurira skill card",
  },
  showGithubActivity: {
    en: "Show GitHub activity on profile",
    sr: "Prikaži GitHub aktivnost na profilu",
  },
  showGithubActivitySub: {
    en: "Contribution graph visible to all users",
    sr: "Contribution graph vidljiv svim korisnicima",
  },
  manualSync: { en: "Manual sync", sr: "Ručna sinhronizacija" },

  // privacy
  visibilityTitle: { en: "Profile visibility", sr: "Vidljivost profila" },
  visibilitySub: {
    en: "Who can see your information",
    sr: "Ko može da vidi tvoje informacije",
  },
  whoCanSee: {
    en: "Who can see my profile",
    sr: "Ko može videti moj profil",
  },
  visAll: {
    en: "All users (including guests)",
    sr: "Svi korisnici (uključujući goste)",
  },
  visMembers: {
    en: "Registered members only",
    sr: "Samo registrovani članovi",
  },
  visNone: { en: "Nobody (private profile)", sr: "Niko (privatan profil)" },
  visibleToRecruiters: {
    en: "Visible to recruiting companies",
    sr: "Vidljiv kompanijama za regrutovanje",
  },
  visibleToRecruitersSub: {
    en: "Partner companies of the platform can find your profile and contact you",
    sr: "Kompanije-partneri platforme mogu pronaći tvoj profil i kontaktirati te",
  },
  showEmail: { en: "Show email on profile", sr: "Prikaži email na profilu" },
  showEmailSub: {
    en: "Email address visible to users viewing your profile",
    sr: "Email adresa vidljiva korisnicima koji pregledaju tvoj profil",
  },
  showLocation: {
    en: "Show location on profile",
    sr: "Prikaži lokaciju na profilu",
  },
  showLocationSub: {
    en: "City and country visible on your public profile",
    sr: "Grad i država vidljivi na javnom profilu",
  },
  notificationsTitle: { en: "Notifications", sr: "Obaveštenja" },
  notificationsSub: {
    en: "Set when and how you receive notifications",
    sr: "Podesi kada i kako primaš notifikacije",
  },
  emailNotifications: { en: "Email notifications", sr: "Email obaveštenja" },
  emailNotificationsSub: {
    en: "Application results, messages, hackathon reminders",
    sr: "Rezultati prijava, poruke, hackathon podsetnici",
  },
  pushNotifications: { en: "Push notifications", sr: "Push obaveštenja" },
  pushNotificationsSub: {
    en: "Direct messages and hackathon activity",
    sr: "Direktne poruke i aktivnost na hackathonima",
  },
  dailyGameReminders: {
    en: "Daily mini-game reminders",
    sr: "Dnevni podsetnici za mini igre",
  },
  dailyGameRemindersSub: {
    en: "A reminder when new daily games are available",
    sr: "Podsetnik kada su dostupne nove dnevne igre",
  },

  // danger zone
  deleteProfileTitle: { en: "Delete profile", sr: "Brisanje profila" },
  deactivateTitle: { en: "Account deactivation", sr: "Deaktivacija naloga" },
  deactivateSub: {
    en: "Temporarily hide your account. You can sign in again at any time.",
    sr: "Privremeno sakrij nalog. Možeš se prijaviti ponovo u svakom momentu.",
  },
  deactivate: { en: "Deactivate", sr: "Deaktiviraj" },
  deleteDataTitle: { en: "Delete all data", sr: "Brisanje svih podataka" },
  deleteDataSub: {
    en: "Permanently deletes all personal data, but keeps anonymized hackathon history.",
    sr: "Trajno briše sve lične podatke, ali čuva anonimizovane istorije hackathona.",
  },
  deleteData: { en: "Delete data", sr: "Obriši podatke" },
  deleteAccountTitle: { en: "Delete account", sr: "Brisanje naloga" },
  deleteAccountSub: {
    en: "Permanently and irreversibly deletes your account and all related data.",
    sr: "Trajno i nepovratno briše nalog i sve povezane podatke.",
  },
  deleteAccount: { en: "Delete account", sr: "Obriši nalog" },
  confirmDeactivate: { en: "Deactivate account?", sr: "Deaktivirati nalog?" },
  confirmDeleteData: {
    en: "Delete all data?",
    sr: "Obrisati sve podatke?",
  },
  confirmDeleteAccount: {
    en: "Permanently delete your account? This action cannot be undone.",
    sr: "Trajno obrisati nalog? Ova akcija ne može biti poništena.",
  },
  requestReceived: { en: "Request received.", sr: "Zahtev je primljen." },

  // premium panel
  premiumStatusTitle: { en: "Premium status", sr: "Premium status" },
  premiumStatusSub: {
    en: "Unlock advanced personalization options and exclusive benefits",
    sr: "Otključaj napredne opcije personalizacije i ekskluzivne benefite",
  },
  featGifName: { en: "GIF avatar & banner", sr: "GIF avatar i baner" },
  featGifSub: {
    en: "Animated images instead of static ones",
    sr: "Animirane slike umesto statičnih",
  },
  featColorName: { en: "Username color", sr: "Boja korisničkog imena" },
  featColorSub: {
    en: "Custom color in the display",
    sr: "Prilagođena boja u prikazu",
  },
  featSpinName: {
    en: "More Daily Spin spins",
    sr: "Više Daily Spin okretaja",
  },
  featSpinSub: {
    en: "More frequent rewards in GameHub",
    sr: "Češće nagrade u GameHub-u",
  },
  featBadgeName: { en: "Premium badge", sr: "Premium bedž" },
  featBadgeSub: {
    en: "Visible mark on your profile",
    sr: "Vidljiva oznaka na profilu",
  },
  activatePremiumTitle: { en: "Activate Premium", sr: "Aktiviraj Premium" },
  activatePremiumSub: {
    en: "Choose a duration and pay by card",
    sr: "Izaberi period trajanja i plati karticom",
  },
  monthly: { en: "Monthly", sr: "Mesečno" },
  perMonth: {
    en: "per month · auto-renews",
    sr: "po mesecu · automatska obnova",
  },
  yearly: { en: "Yearly", sr: "Godišnje" },
  perYear: {
    en: "per year · auto-renews",
    sr: "po godini · automatska obnova",
  },
  selected: { en: "Selected", sr: "Izabrano" },
  choose: { en: "Choose", sr: "Izaberi" },
  save33: { en: "SAVE 33%", sr: "UŠTEDI 33%" },
  cardData: { en: "Card details", sr: "Podaci o kartici" },
  cardNumber: { en: "Card number", sr: "Broj kartice" },
  expiryDate: { en: "Expiry date", sr: "Datum isteka" },
  expiryPlaceholder: { en: "MM/YY", sr: "MM/GG" },
  cvv: { en: "CVV", sr: "CVV" },
  cardholderName: {
    en: "Cardholder name",
    sr: "Ime vlasnika kartice",
  },
  paySecure: {
    en: "Payment is processed by a PCI-DSS compliant gateway. Card data is not stored.",
    sr: "Plaćanje obrađuje PCI-DSS kompatibilan gateway. Podaci o kartici se ne čuvaju.",
  },
  confirmPayment: { en: "Confirm payment", sr: "Potvrdi plaćanje" },
  activatePremium: { en: "Activate Premium", sr: "Aktiviraj Premium" },
  premiumMonthlyName: { en: "Premium Monthly", sr: "Premium Mesečni" },
  premiumYearlyName: { en: "Premium Yearly", sr: "Premium Godišnji" },
  premiumActivated: {
    en: "✓ Premium activated! An invoice has been sent to your email.",
    sr: "✓ Premium aktiviran! Račun je poslat na email.",
  },
  active: { en: "Active", sr: "Aktivan" },
  yourPlan: { en: "Your plan", sr: "Tvoj plan" },
  activePlan: { en: "Active plan", sr: "Aktivan plan" },
  expires: { en: "Expires:", sr: "Ističe:" },
  autoRenewLabel: { en: "Auto-renew:", sr: "Automatska obnova:" },
  on: { en: "On", sr: "Uključena" },
  off: { en: "Off", sr: "Isključena" },
  cancelAutoRenew: {
    en: "Cancel auto-renew",
    sr: "Otkaži automatsku obnovu",
  },
  confirmCancelRenew: {
    en: "Cancel auto-renew? Premium stays active until the expiry date.",
    sr: "Otkazati automatsku obnovu? Premium ostaje aktivan do datuma isteka.",
  },
  removePremium: { en: "Remove Premium", sr: "Ukloni premium" },
  confirmRemovePremium: {
    en: "Remove Premium now? Benefits end immediately and your banner and animated (GIF) avatar will be removed.",
    sr: "Ukloniti premium sada? Pogodnosti prestaju odmah, a baner i animirana (GIF) profilna biće uklonjeni.",
  },
  premiumRemoved: { en: "Premium removed", sr: "Premium uklonjen" },
  cancelRenewFailed: {
    en: "Could not cancel auto-renew. Please try again.",
    sr: "Otkazivanje automatske obnove nije uspelo. Pokušaj ponovo.",
  },

  // confirm dialog
  confirm: { en: "Confirm", sr: "Potvrdi" },
  cancel: { en: "Cancel", sr: "Otkaži" },
  comingSoon: {
    en: "This feature is not available yet.",
    sr: "Ova opcija još nije dostupna.",
  },

  // logout panel
  logoutTitle: { en: "Log out", sr: "Odjava" },
  logoutSub: {
    en: "Log out of your tikimiki account",
    sr: "Odjavite se sa svog tikimiki naloga",
  },
  logout: { en: "Log out", sr: "Odjavi se" },
  confirmLogout: {
    en: "Log out of your tikimiki account?",
    sr: "Odjaviti se sa tikimiki naloga?",
  },
} as const;

export function SettingsClient() {
  const t = useT(M);
  const { locale } = useLanguage();

  // Panel switching
  const [panel, setPanel] = useState<PanelId>("izgled-profila");

  // Profile fields (shared with the live preview)
  // `name` (display name), `location`, `website` and `color` have no backing in
  // the API (MyProfile has no such columns) → they stay local/mock. The rest
  // (username, bio, skills, avatarUrl, bannerUrl, points, email) load from
  // api.getMyProfile() on mount.
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([
    "Python",
    "C",
    "C++",
    "Java",
    "Verilog",
    "HTML",
    "CSS",
  ]);
  const [skillDraft, setSkillDraft] = useState("");
  const [color, setColor] = useState("#A78BFA");
  const skillsInputRef = useRef<HTMLInputElement>(null);

  // API-backed profile fields (no dedicated inputs in the markup, but persisted
  // on save and read back from getMyProfile()).
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [savingCard, setSavingCard] = useState<Record<string, boolean>>({});

  // Avatar / banner image upload
  // Busy + error state per image control, plus refs to the hidden file inputs.
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const gifAvatarFileRef = useRef<HTMLInputElement>(null);
  // Static image awaiting crop/position before it is baked and uploaded.
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);

  // syncPreview() rewrites the preview handle's textContent to
  // "@username · digitalci" (which removes the trophy/GitHub badge icons). That
  // only happens once the user edits a preview-driving field; before then the
  // initial markup (@username + the two badges, no "· digitalci") is shown. This
  // flag reproduces that exact transition.
  const [previewSynced, setPreviewSynced] = useState(false);

  // Password hint
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");

  // Save-status visibility (per card id)
  const [savedCards, setSavedCards] = useState<Record<string, boolean>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Privacy / notification settings (api.getSettings)
  const [settings, setSettings] = useState<api.UserSettings | null>(null);

  // Integrations (api.getIntegrations)
  const [integrations, setIntegrations] = useState<api.Integrations | null>(null);
  const [intBusy, setIntBusy] = useState<Record<string, boolean>>({});

  // Account: change email / verify email
  const [newEmailInput, setNewEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  // Premium
  const [selectedPlan, setSelectedPlan] = useState<Plan>("mesecno");
  const [paymentFormVisible, setPaymentFormVisible] = useState(false);
  const [premiumActive, setPremiumActive] = useState(false);
  const [activePlanName, setActivePlanName] = useState("Premium Mesečni");
  const [activePlanExpiry, setActivePlanExpiry] = useState("14. jun 2026.");
  const [autoRenewOn, setAutoRenewOn] = useState(true);
  const [premiumBusy, setPremiumBusy] = useState(false);

  // Toast (in-page status banner, replaces window.alert)
  const [toast, setToast] = useState<{
    text: string;
    tone: "ok" | "err";
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Confirm dialog (replaces window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  } | null>(null);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Load profile + subscription on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await api.getMyProfile();
        if (cancelled) return;
        setUsername(profile.username);
        setName(profile.displayName ?? profile.username);
        setBio(profile.bio ?? "");
        setSkills(profile.skills);
        setAvatarUrl(profile.avatarUrl);
        setBannerUrl(profile.bannerUrl);
        setIsPremium(profile.isPremium);
        setPoints(profile.points);
        setEmail(profile.email);
      } catch (err) {
        console.error("Failed to load profile", err);
      }
    })();
    (async () => {
      try {
        const { subscription } = await api.getMySubscription();
        if (cancelled || !subscription) return;
        setPremiumActive(subscription.status === "active");
        setActivePlanName(subscription.plan);
        setAutoRenewOn(!subscription.cancelledAt);
        const exp = new Date(subscription.endsAt);
        if (!Number.isNaN(exp.getTime())) {
          setActivePlanExpiry(
            `${exp.getDate()}. ${MONTHS[locale][exp.getMonth()]} ${exp.getFullYear()}.`,
          );
        }
      } catch (err) {
        console.error("Failed to load subscription", err);
      }
    })();
    (async () => {
      try {
        const s = await api.getSettings();
        if (cancelled) return;
        setSettings(s);
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    })();
    (async () => {
      try {
        const i = await api.getIntegrations();
        if (cancelled) return;
        setIntegrations(i);
      } catch (err) {
        console.error("Failed to load integrations", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // locale only affects the expiry formatting; re-running on locale change is
    // unnecessary (and would refetch), so it is intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // updateChar: warn class when len > max * 0.85
  const charCount = (value: string, max: number) => `${value.length} / ${max}`;
  const charWarn = (value: string, max: number) => value.length > max * 0.85;

  const saveCard = useCallback((id: string) => {
    setSavedCards((prev) => ({ ...prev, [id]: true }));
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      setSavedCards((prev) => ({ ...prev, [id]: false }));
    }, 2500);
  }, []);

  // syncPreview() runs on every preview-driving edit.
  const syncPreview = () => setPreviewSynced(true);

  // Persist profile appearance (username / bio / skills / images)
  const saveProfile = useCallback(
    async (cardId: string) => {
      setSavingCard((prev) => ({ ...prev, [cardId]: true }));
      try {
        const updated = await api.updateMyProfile({
          username,
          displayName: name.trim() || null,
          bio,
          avatarUrl,
          bannerUrl,
          skills,
        });
        setUsername(updated.username);
        setName(updated.displayName ?? updated.username);
        setBio(updated.bio ?? "");
        setSkills(updated.skills);
        setAvatarUrl(updated.avatarUrl);
        setBannerUrl(updated.bannerUrl);
        setPoints(updated.points);
        saveCard(cardId);
      } catch (err) {
        console.error("Failed to save profile", err);
        showToast(err instanceof api.ApiError ? err.message : t("settingsSaveFailed"), "err");
      } finally {
        setSavingCard((prev) => ({ ...prev, [cardId]: false }));
      }
    },
    [username, name, bio, avatarUrl, bannerUrl, skills, saveCard, showToast, t],
  );

  // Avatar / banner upload + remove
  const uploadAvatarFile = useCallback(
    async (file: File) => {
      setAvatarMsg(null);
      setAvatarBusy(true);
      try {
        const { avatarUrl: url } = await api.uploadAvatar(file);
        setAvatarUrl(url);
      } catch (err) {
        console.error("Failed to upload avatar", err);
        setAvatarMsg(err instanceof api.ApiError ? err.message : t("uploadFailed"));
      } finally {
        setAvatarBusy(false);
      }
    },
    [t],
  );

  const uploadBannerFile = useCallback(
    async (file: File) => {
      setBannerMsg(null);
      setBannerBusy(true);
      try {
        const { bannerUrl: url } = await api.uploadBanner(file);
        setBannerUrl(url);
      } catch (err) {
        console.error("Failed to upload banner", err);
        setBannerMsg(err instanceof api.ApiError ? err.message : t("uploadFailed"));
      } finally {
        setBannerBusy(false);
      }
    },
    [t],
  );

  // Open the crop overlay for a freshly-picked static image so the user can
  // choose which part fills the avatar/banner frame. Animated GIFs skip it
  // (canvas baking would flatten the animation) and upload as-is.
  const openCropper = useCallback(
    (kind: "avatar" | "banner", file: File) => {
      const previewUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () =>
        setCropTarget({
          kind,
          file,
          previewUrl,
          imgRatio: img.naturalWidth / Math.max(1, img.naturalHeight),
          focalX: 0.5,
          focalY: 0.5,
          zoom: 1,
        });
      img.onerror = () => {
        // Unreadable image → fall back to a plain direct upload.
        URL.revokeObjectURL(previewUrl);
        void (kind === "avatar" ? uploadAvatarFile : uploadBannerFile)(file);
      };
      img.src = previewUrl;
    },
    [uploadAvatarFile, uploadBannerFile],
  );

  const onPickAvatar = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Allow re-picking the same file later by clearing the input value.
      e.target.value = "";
      if (!file) return;
      if (file.type === "image/gif") {
        void uploadAvatarFile(file);
        return;
      }
      openCropper("avatar", file);
    },
    [openCropper, uploadAvatarFile],
  );

  const onRemoveAvatar = useCallback(async () => {
    setAvatarMsg(null);
    setAvatarBusy(true);
    try {
      await api.deleteAvatarImage();
      setAvatarUrl(null);
      setAvatarMsg(t("avatarRemoved"));
    } catch (err) {
      console.error("Failed to remove avatar", err);
      setAvatarMsg(err instanceof api.ApiError ? err.message : t("removeFailed"));
    } finally {
      setAvatarBusy(false);
    }
  }, [t]);

  const onPickBanner = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (file.type === "image/gif") {
        void uploadBannerFile(file);
        return;
      }
      openCropper("banner", file);
    },
    [openCropper, uploadBannerFile],
  );

  const cancelCrop = useCallback(() => {
    setCropTarget((c) => {
      if (c) URL.revokeObjectURL(c.previewUrl);
      return null;
    });
  }, []);

  // Bake the chosen crop (ratio + focal + zoom) to a JPEG and upload it.
  const confirmCrop = useCallback(async () => {
    if (!cropTarget) return;
    const { kind, file, previewUrl, focalX, focalY, zoom } = cropTarget;
    const ratio = kind === "avatar" ? AVATAR_RATIO : BANNER_RATIO;
    const maxWidth = kind === "avatar" ? 512 : 1500;
    setCropTarget(null);
    try {
      const blob = await cropImageToRatio(file, ratio, focalX, focalY, zoom, maxWidth);
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      const baked = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      if (kind === "avatar") await uploadAvatarFile(baked);
      else await uploadBannerFile(baked);
    } catch (err) {
      console.error("Failed to crop image", err);
      (kind === "avatar" ? setAvatarMsg : setBannerMsg)(t("uploadFailed"));
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  }, [cropTarget, uploadAvatarFile, uploadBannerFile, t]);

  const onRemoveBanner = useCallback(async () => {
    setBannerMsg(null);
    setBannerBusy(true);
    try {
      await api.deleteBannerImage();
      setBannerUrl(null);
      setBannerMsg(t("bannerRemoved"));
    } catch (err) {
      console.error("Failed to remove banner", err);
      setBannerMsg(err instanceof api.ApiError ? err.message : t("removeFailed"));
    } finally {
      setBannerBusy(false);
    }
  }, [t]);

  // Change password
  const handleChangePassword = useCallback(async () => {
    if (pwNew.length < 8 || pwNew !== pwConfirm) return;
    setSavingCard((prev) => ({ ...prev, pw: true }));
    try {
      await api.changePassword(pwCurrent, pwNew);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      saveCard("pw");
    } catch (err) {
      console.error("Failed to change password", err);
      showToast(err instanceof api.ApiError ? err.message : t("pwShort"), "err");
    } finally {
      setSavingCard((prev) => ({ ...prev, pw: false }));
    }
  }, [pwCurrent, pwNew, pwConfirm, saveCard, showToast, t]);

  // Privacy / notification settings
  // Optimistically applies the patch, then reconciles with the server
  // response (reverting on failure).
  const updateSetting = useCallback(
    async <K extends keyof api.UserSettings>(field: K, value: api.UserSettings[K]) => {
      const patch: Partial<api.UserSettings> = { [field]: value };
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      try {
        const updated = await api.updateSettings(patch);
        setSettings(updated);
      } catch (err) {
        console.error("Failed to update settings", err);
        // Reload authoritative state on failure.
        try {
          setSettings(await api.getSettings());
        } catch {
          /* keep optimistic value if reload also fails */
        }
        showToast(err instanceof api.ApiError ? err.message : t("settingsSaveFailed"), "err");
      }
    },
    [showToast, t],
  );

  // Integrations: connect / disconnect. Connect uses the LINK variant of the
  // OAuth flow (?link=1): the provider is attached to the current account —
  // the plain flow would find-or-create a user and could silently switch the
  // session to a brand-new account when the emails don't match.
  const connectIntegration = useCallback((provider: "github" | "google") => {
    window.location.href = api.oauthUrl(provider, { link: true });
  }, []);

  // Link-flow outcome: the OAuth callback bounces back to
  // /settings?oauth=linked|conflict|error|unconfigured — toast it, open the
  // integrations panel, and strip the param so refresh doesn't re-toast.
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("oauth");
    if (!status) return;
    setPanel("integracije");
    if (status === "linked") showToast(t("oauthLinked"), "ok");
    else if (status === "conflict") showToast(t("oauthConflict"), "err");
    else showToast(t("oauthLinkFailed"), "err");
    window.history.replaceState(null, "", window.location.pathname);
    // Run once on mount: the param only exists on the redirect landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = useCallback(
    async (provider: "github" | "google" | "linkedin") => {
      setIntBusy((prev) => ({ ...prev, [provider]: true }));
      try {
        const updated = await api.disconnectIntegration(provider);
        setIntegrations(updated);
      } catch (err) {
        console.error("Failed to disconnect integration", err);
        showToast(err instanceof api.ApiError ? err.message : t("disconnectFailed"), "err");
      } finally {
        setIntBusy((prev) => ({ ...prev, [provider]: false }));
      }
    },
    [showToast, t],
  );

  /** Refresh GitHub repo/language stats and re-derive verified skill tags (N04). */
  const handleSyncGithub = useCallback(async () => {
    setIntBusy((prev) => ({ ...prev, githubSync: true }));
    try {
      await api.syncGithubSkills();
      showToast(t("syncGithubSuccess"), "ok");
    } catch (err) {
      console.error("Failed to sync GitHub skills", err);
      showToast(err instanceof api.ApiError ? err.message : t("syncGithubFailed"), "err");
    } finally {
      setIntBusy((prev) => ({ ...prev, githubSync: false }));
    }
  }, [showToast, t]);

  // Account: change email / verify email
  const handleChangeEmail = useCallback(async () => {
    const next = newEmailInput.trim();
    if (!next) return;
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await api.changeEmail(next);
      setNewEmailInput("");
      setEmailMsg(
        res.devLink
          ? `${t("emailChangeSent")} ${t("devVerificationLink")}: ${res.devLink}`
          : t("emailChangeSent"),
      );
    } catch (err) {
      console.error("Failed to change email", err);
      setEmailMsg(err instanceof api.ApiError ? err.message : t("emailChangeFailed"));
    } finally {
      setEmailBusy(false);
    }
  }, [newEmailInput, t]);

  const handleVerifyEmail = useCallback(async () => {
    setVerifyMsg(null);
    setVerifyBusy(true);
    try {
      const res = await api.requestEmailVerification();
      if (res.alreadyVerified) {
        setVerifyMsg(t("emailAlreadyVerified"));
      } else {
        setVerifyMsg(
          res.devLink
            ? `${t("verificationSent")} ${t("devVerificationLink")}: ${res.devLink}`
            : t("verificationSent"),
        );
      }
    } catch (err) {
      console.error("Failed to request email verification", err);
      setVerifyMsg(err instanceof api.ApiError ? err.message : t("verifyFailed"));
    } finally {
      setVerifyBusy(false);
    }
  }, [t]);

  // Skills
  const addSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const val = skillDraft.replace(",", "").trim();
    if (!val) return;
    setSkills((prev) => [...prev, val]);
    setSkillDraft("");
    syncPreview();
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
    syncPreview();
  };

  // Password hint
  let pwHintText = t("pwMin");
  let pwHintColor = "var(--muted)";
  if (pwNew) {
    if (pwNew.length < 8) {
      pwHintText = t("pwShort");
      pwHintColor = "var(--red)";
    } else if (pwConfirm && pwNew !== pwConfirm) {
      pwHintText = t("pwNoMatch");
      pwHintColor = "var(--red)";
    } else if (pwConfirm && pwNew === pwConfirm) {
      pwHintText = t("pwMatch");
      pwHintColor = "var(--green)";
    } else {
      pwHintText = t("pwStrong");
      pwHintColor = "var(--green)";
    }
  }

  const router = useRouter();
  const { logout } = useAuth();
  useRequireAuth();

  // Danger / confirm
  // NOTE: there is no api.ts endpoint for deactivate / delete-data /
  // delete-account, so these still only acknowledge the request. The native
  // confirm()/alert() are replaced by the in-app confirm dialog + toast.
  // TODO(api): wire to real account-deletion endpoints once they exist.
  const confirmDanger = (msg: string) => {
    setConfirmDialog({
      message: msg,
      danger: true,
      onConfirm: () => {
        console.warn(
          "[settings] Danger-zone action acknowledged but NOT persisted — " +
            "no account deletion/deactivation API exists yet.",
        );
        showToast(t("requestReceived"), "ok");
      },
    });
  };

  const handleLogout = () => {
    setConfirmDialog({
      message: t("confirmLogout"),
      danger: true,
      onConfirm: async () => {
        await logout();
        router.push("/login");
      },
    });
  };

  // Premium handlers
  // The activation step now calls the real api.activateSubscription endpoint.
  // The collected card fields are NOT sent to any payment processor — there is
  // no payment-gateway integration. Flagged for manual review.
  const handlePremiumBtn = async () => {
    if (!paymentFormVisible) {
      setPaymentFormVisible(true);
      return;
    }
    console.warn(
      "[settings] Premium activation: no payment gateway is wired up. " +
        "Card fields are collected but never charged; activateSubscription() " +
        "is called directly. Manual review required before production.",
    );
    setPremiumBusy(true);
    try {
      const sub = await api.activateSubscription(selectedPlan === "mesecno" ? "monthly" : "annual");
      setPremiumActive(sub.status === "active");
      setActivePlanName(sub.plan);
      setAutoRenewOn(!sub.cancelledAt);
      const exp = new Date(sub.endsAt);
      if (!Number.isNaN(exp.getTime())) {
        setActivePlanExpiry(
          `${exp.getDate()}. ${MONTHS[locale][exp.getMonth()]} ${exp.getFullYear()}.`,
        );
      }
      showToast(t("premiumActivated"), "ok");
    } catch (err) {
      console.error("Failed to activate subscription", err);
      showToast(err instanceof api.ApiError ? err.message : t("settingsSaveFailed"), "err");
    } finally {
      setPremiumBusy(false);
    }
  };

  // Remove Premium immediately. The server also clears the banner (a Premium
  // feature) and an animated GIF avatar, so we re-read the profile to reflect
  // whatever it wiped and drop the local premium flags/badges.
  const removePremium = () => {
    setConfirmDialog({
      message: t("confirmRemovePremium"),
      danger: true,
      onConfirm: async () => {
        try {
          await api.cancelSubscription();
          setPremiumActive(false);
          setAutoRenewOn(false);
          setIsPremium(false);
          try {
            const profile = await api.getMyProfile();
            setAvatarUrl(profile.avatarUrl);
            setBannerUrl(profile.bannerUrl);
            setIsPremium(profile.isPremium);
          } catch (err) {
            console.error("Failed to refresh profile after removing premium", err);
          }
          showToast(t("premiumRemoved"), "ok");
        } catch (err) {
          console.error("Failed to remove premium", err);
          showToast(err instanceof api.ApiError ? err.message : t("cancelRenewFailed"), "err");
        }
      },
    });
  };

  const SaveStatus = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <span className={`ep-save-status${savedCards[id] ? " visible" : ""}`} id={`status-${id}`}>
      <Icon name="check" /> {children}
    </span>
  );

  return (
    <AppShell
      right={
        <aside className="rail-right" aria-label={t("profilePreview")}>
          <div className="search" role="search">
            <Icon name="search" />
            <input
              type="search"
              aria-label={t("searchAria")}
              placeholder={t("searchPlaceholder")}
            />
          </div>
          <section className="ppc" aria-labelledby="ppc-card-title">
            <header className="ppc-header">
              <h2 className="ppc-title" id="ppc-card-title">
                {t("profilePreview")}
              </h2>
            </header>

            <div
              className="ppc-banner"
              id="ppc-banner"
              aria-hidden="true"
              style={
                bannerUrl
                  ? {
                      backgroundImage: `url(${bannerUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            />

            <div className="ppc-avatar-row">
              <div className="ppc-avatar is-orb" id="ppc-avatar" aria-hidden="true">
                <OrbArt url={avatarUrl} seed={username} />
                <span className="ppc-status-ring" />
              </div>
            </div>

            <div className="ppc-info">
              <div
                className="ppc-name"
                id="ppc-name"
                style={{ color, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {name}
                {isPremium && <PremiumBadge size={13} />}
              </div>
              <div className="ppc-handle" id="ppc-handle">
                {previewSynced ? (
                  `@${username} · digitalci`
                ) : (
                  <>
                    @{username}
                    <span className="ppc-badge-item" title={t("badgeHackathon")}>
                      <Icon name="trophy" />
                    </span>
                    <span className="ppc-badge-item" title={t("badgeGithub")}>
                      <Icon name="server" />
                    </span>
                  </>
                )}
              </div>

              <div className="ppc-bio" id="ppc-bio">
                {bio}
              </div>

              <div className="ppc-section">{t("skills")}</div>
              <div className="ppc-skills" id="ppc-skills">
                {skills.map((s, i) => (
                  <span className="ppc-skill-chip" key={`${s}-${i}`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Only XP has a real backing field (MyProfile.points). The former
                hardcoded Hackathons/Wins counts had no data source and were
                removed rather than showing fake numbers. */}
            <div className="ppc-stats-row">
              <div className="ppc-stat">
                <div className="ppc-stat-val">{points == null ? "—" : points.toLocaleString()}</div>
                <div className="ppc-stat-lbl">{t("statXp")}</div>
              </div>
            </div>
          </section>

          <footer className="mini">
            <Link href="/about">{t("about")}</Link> ·{" "}
            <Link href="/accessibility">{t("accessibility")}</Link> ·{" "}
            <Link href="/help">{t("helpCenter")}</Link> ·{" "}
            <Link href="/privacy">{t("privacyTerms")}</Link>
            <br />
            <span className="cw">
              <b>tiki</b>miki
            </span>{" "}
            © 2026
          </footer>
        </aside>
      }
    >
      <main className="feed" id="main">
        <div className="page-head">
          <Link className="col-back" href="/" aria-label={t("back")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="settings" /> {t("pageTitle")}
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        {/* Secondary panel navigation (moved out of the left rail) */}
        <div className="set-subnav" role="tablist" aria-label={t("subnavAria")}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`set-tab${tab.danger ? " danger" : ""}`}
              role="tab"
              aria-selected={panel === tab.id}
              data-panel={tab.id}
              onClick={() => setPanel(tab.id)}
            >
              <Icon name={tab.icon} /> {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* PANEL: IZGLED PROFILA */}
        <div
          className={`ep-panel${panel === "izgled-profila" ? " active" : ""}`}
          id="panel-izgled-profila"
        >
          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("languageTitle")}</div>
              <div className="ep-card-sub">{t("languageSub")}</div>
            </div>
            <div className="ep-card-body">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("themeTitle")}</div>
              <div className="ep-card-sub">{t("themeSub")}</div>
            </div>
            <div className="ep-card-body">
              <ThemeSwitcher />
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("avatarBannerTitle")}</div>
              <div className="ep-card-sub">{t("avatarBannerSub")}</div>
            </div>
            <div className="ep-card-body">
              <div>
                <div className="ep-label" style={{ marginBottom: "8px" }}>
                  {t("banner")}
                </div>
                <input
                  ref={bannerFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onPickBanner}
                />
                <button
                  className="ep-banner-wrap"
                  type="button"
                  aria-label={t("changeBanner")}
                  disabled={bannerBusy || !isPremium}
                  onClick={() => bannerFileRef.current?.click()}
                >
                  <div
                    className="ep-banner"
                    id="preview-banner-bg"
                    aria-hidden="true"
                    style={
                      bannerUrl
                        ? {
                            backgroundImage: `url(${bannerUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                  />
                  <div
                    className="ep-banner-overlay"
                    style={!bannerUrl || !isPremium ? { opacity: 1 } : undefined}
                  >
                    <Icon name={isPremium ? "image" : "premium"} />{" "}
                    {bannerBusy
                      ? t("uploading")
                      : !isPremium
                        ? t("tabPremium")
                        : bannerUrl
                          ? t("changeBanner")
                          : t("setBanner")}
                  </div>
                </button>
                <div className="ep-banner-hint">{t("bannerHint")}</div>
                {!isPremium && (
                  <div
                    className="ep-avatar-btns"
                    style={{ marginTop: "8px", alignItems: "center" }}
                  >
                    <span className="ep-banner-hint">
                      <Icon name="premium" /> {t("bannerPremiumHint")}
                    </span>
                    <button
                      className="btn btn-ghost ep-mini-btn"
                      type="button"
                      onClick={() => setPanel("premium")}
                    >
                      <Icon name="premium" /> {t("tabPremium")}
                    </button>
                  </div>
                )}
                {isPremium && (
                  <div className="ep-avatar-btns" style={{ marginTop: "8px" }}>
                    <button
                      className="btn btn-ghost ep-mini-btn"
                      type="button"
                      disabled={bannerBusy}
                      onClick={() => bannerFileRef.current?.click()}
                    >
                      <Icon name="image" />{" "}
                      {bannerBusy ? t("uploading") : bannerUrl ? t("changeBanner") : t("setBanner")}
                    </button>
                    {bannerUrl && (
                      <button
                        className="ep-btn-danger ep-mini-btn"
                        type="button"
                        disabled={bannerBusy}
                        onClick={onRemoveBanner}
                      >
                        <Icon name="x" /> {bannerBusy ? t("removing") : t("remove")}
                      </button>
                    )}
                  </div>
                )}
                {bannerMsg && (
                  <div
                    className="ep-banner-hint"
                    role="status"
                    style={{ marginTop: "6px", color: "var(--muted)" }}
                  >
                    {bannerMsg}
                  </div>
                )}
              </div>

              <div className="ep-avatar-section">
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onPickAvatar}
                />
                <button
                  className="ep-avatar-wrap"
                  type="button"
                  aria-label={t("avatarUpload")}
                  disabled={avatarBusy}
                  onClick={() => avatarFileRef.current?.click()}
                >
                  {avatarUrl ? (
                    <img
                      className="ep-avatar-img"
                      id="preview-avatar-initials"
                      src={avatarUrl}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="ep-avatar-img is-orb"
                      id="preview-avatar-initials"
                      aria-hidden="true"
                    >
                      <OrbArt url={avatarUrl} seed={username} />
                    </span>
                  )}
                  <span className="ep-avatar-edit" aria-hidden="true">
                    <Icon name="plus" />
                  </span>
                </button>
                <div className="ep-avatar-info">
                  <div className="ep-avatar-name" id="preview-name-inline">
                    {name}
                  </div>
                  <div className="ep-avatar-handle">@{username}</div>
                  <div className="ep-avatar-btns">
                    <button
                      className="btn btn-ghost ep-mini-btn"
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => avatarFileRef.current?.click()}
                    >
                      {avatarBusy ? t("uploading") : t("changeImage")}
                    </button>
                    {avatarUrl && (
                      <button
                        className="ep-btn-danger ep-mini-btn"
                        type="button"
                        disabled={avatarBusy}
                        onClick={onRemoveAvatar}
                      >
                        <Icon name="x" /> {avatarBusy ? t("removing") : t("remove")}
                      </button>
                    )}
                  </div>
                  {avatarMsg && (
                    <div
                      className="ep-banner-hint"
                      role="status"
                      style={{ marginTop: "6px", color: "var(--muted)" }}
                    >
                      {avatarMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="ep-card-footer">
              <SaveStatus id="avatar">{t("saved")}</SaveStatus>
              <button
                className="btn btn-primary"
                disabled={savingCard.avatar}
                onClick={() => saveProfile("avatar")}
              >
                {t("save")}
              </button>
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("basicInfoTitle")}</div>
              <div className="ep-card-sub">{t("basicInfoSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-field">
                <label className="ep-label" htmlFor="inp-ime">
                  {t("displayName")}
                </label>
                <input
                  className="ep-input"
                  type="text"
                  value={name}
                  id="inp-ime"
                  onChange={(e) => {
                    setName(e.target.value);
                    syncPreview();
                  }}
                />
                <div className={`ep-char-count${charWarn(name, 40) ? " warn" : ""}`} id="cnt-ime">
                  {charCount(name, 40)}
                </div>
              </div>

              <div className="ep-field">
                <label className="ep-label" htmlFor="inp-username">
                  {t("username")}
                </label>
                <div className="ep-input-wrap">
                  <span className="ep-input-prefix" aria-hidden="true">
                    @
                  </span>
                  <input
                    className="ep-input has-prefix"
                    type="text"
                    value={username}
                    id="inp-username"
                    onChange={(e) => {
                      setUsername(e.target.value);
                      syncPreview();
                    }}
                  />
                </div>
                <div
                  className={`ep-char-count${charWarn(username, 20) ? " warn" : ""}`}
                  id="cnt-username"
                >
                  {charCount(username, 20)}
                </div>
              </div>

              <div className="ep-field">
                <label className="ep-label" htmlFor="inp-bio">
                  {t("bio")}
                </label>
                <textarea
                  className="ep-input"
                  id="inp-bio"
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    syncPreview();
                  }}
                  placeholder={t("bioPlaceholder")}
                />
                <div className={`ep-char-count${charWarn(bio, 160) ? " warn" : ""}`} id="cnt-bio">
                  {charCount(bio, 160)}
                </div>
              </div>

              <div className="ep-two-col">
                <div className="ep-field">
                  <label className="ep-label" htmlFor="inp-lokacija">
                    {t("location")}
                  </label>
                  <input
                    className="ep-input"
                    type="text"
                    defaultValue="Beograd, Srbija"
                    id="inp-lokacija"
                    placeholder={t("locationPlaceholder")}
                    onInput={syncPreview}
                  />
                </div>
                <div className="ep-field">
                  <label className="ep-label" htmlFor="inp-web">
                    {t("website")}
                  </label>
                  <input className="ep-input" type="url" id="inp-web" placeholder="https://" />
                </div>
              </div>
            </div>
            <div className="ep-card-footer">
              <SaveStatus id="info">{t("saved")}</SaveStatus>
              <button
                className="btn btn-primary"
                disabled={savingCard.info}
                onClick={() => saveProfile("info")}
              >
                {t("save")}
              </button>
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("skills")}</div>
              <div className="ep-card-sub">{t("skillsSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-field">
                <label className="ep-label" htmlFor="skills-inp">
                  {t("techAndTools")}
                </label>
                <div
                  className="ep-skills-wrap"
                  id="skills-wrap"
                  onClick={() => skillsInputRef.current?.focus()}
                >
                  {skills.map((s, i) => (
                    <span className="ep-skill-tag" key={`${s}-${i}`}>
                      {s}{" "}
                      <span
                        className="ep-skill-remove"
                        role="button"
                        tabIndex={0}
                        aria-label={`${t("removeSkill")} ${s}`}
                        onClick={() => removeSkill(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            removeSkill(i);
                          }
                        }}
                      >
                        <Icon name="x" />
                      </span>
                    </span>
                  ))}
                  <input
                    id="skills-inp"
                    ref={skillsInputRef}
                    className="ep-skills-input"
                    placeholder={t("addSkill")}
                    aria-label={t("addSkillAria")}
                    value={skillDraft}
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onKeyDown={addSkill}
                  />
                </div>
                <div className="ep-skills-hint">{t("skillsHint")}</div>
              </div>
            </div>
            <div className="ep-card-footer">
              <SaveStatus id="skills">{t("saved")}</SaveStatus>
              <button
                className="btn btn-primary"
                disabled={savingCard.skills}
                onClick={() => {
                  syncPreview();
                  void saveProfile("skills");
                }}
              >
                {t("save")}
              </button>
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("colorTitle")}</div>
              <div className="ep-card-sub">{t("colorSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-field">
                <span className="ep-label">{t("availableColors")}</span>
                <div className="ep-color-row" role="group" aria-label={t("colorGroupAria")}>
                  {[
                    { c: "#A78BFA", label: t("colorPurple") },
                    { c: "#5DCAA5", label: t("colorGreen") },
                    { c: "#EDD94B", label: t("colorYellow") },
                    { c: "#ff9ff3", label: t("colorPink") },
                    { c: "#00f5ff", label: t("colorTeal") },
                    { c: "#E74C3C", label: t("colorRed") },
                    { c: "#E0D9FF", label: t("colorLight") },
                  ].map((sw) => (
                    <button
                      key={sw.c}
                      type="button"
                      className={`ep-color-swatch${color === sw.c ? " selected" : ""}`}
                      style={{ background: sw.c }}
                      aria-label={sw.label}
                      onClick={() => setColor(sw.c)}
                    />
                  ))}
                  <span className="ep-color-preview" id="color-preview" style={{ color }}>
                    {name}
                  </span>
                </div>
              </div>
            </div>
            <div className="ep-card-footer">
              {/* Username color is not persisted — MyProfile has no `color`
                  column and api.ts exposes no endpoint for it. Disabled rather
                  than flashing a false "Saved". */}
              <span className="ep-not-saved-hint">{t("notSavedYet")}</span>
              <button className="btn btn-primary" disabled title={t("notSavedYet")}>
                {t("save")}
              </button>
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("premiumPersTitle")}</div>
              <div className="ep-card-sub">{t("premiumPersSub")}</div>
            </div>
            <div className="ep-card-body">
              {/* Non-premium members see the controls as a locked preview; the
                  actual GIF avatar upload (image/gif) is gated to Premium both
                  here and on the server. Static images stay open to everyone in
                  the "Avatar & banner" card above. */}
              <div className={isPremium ? undefined : "ep-premium-lock"}>
                <div className="ep-field">
                  <span className="ep-label">{t("gifAvatar")}</span>
                  <input
                    ref={gifAvatarFileRef}
                    type="file"
                    accept="image/gif"
                    hidden
                    onChange={onPickAvatar}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: "14px",
                      alignItems: "center",
                    }}
                  >
                    <div className="ep-mini-av is-orb" aria-hidden="true">
                      <OrbArt url={avatarUrl} seed={username} />
                    </div>
                    <div>
                      <button
                        className="btn btn-ghost ep-mini-btn"
                        disabled={!isPremium || avatarBusy}
                        onClick={() => gifAvatarFileRef.current?.click()}
                      >
                        {avatarBusy ? t("uploading") : t("uploadGifAvatar")}
                      </button>
                      <div className="ep-banner-hint" style={{ marginTop: "6px" }}>
                        {t("gifAvatarHint")}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ep-field">
                  <span className="ep-label">{t("gifBanner")}</span>
                  <button
                    className="ep-banner-wrap"
                    type="button"
                    aria-label={t("changeBanner")}
                    disabled={!isPremium || bannerBusy}
                    onClick={() => bannerFileRef.current?.click()}
                  >
                    <div
                      className="ep-banner"
                      style={{
                        height: "72px",
                        ...(bannerUrl
                          ? {
                              backgroundImage: `url(${bannerUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : {}),
                      }}
                      aria-hidden="true"
                    />
                  </button>
                  <div className="ep-banner-hint">{t("gifBannerHint")}</div>
                </div>
              </div>
            </div>
            <div className="ep-card-footer">
              {isPremium ? (
                <span className="ep-banner-hint">{t("premiumPersSub")}</span>
              ) : (
                <>
                  <span className="ep-not-saved-hint">
                    <Icon name="premium" /> {t("premiumStatusSub")}
                  </span>
                  <button className="btn btn-primary" onClick={() => setPanel("premium")}>
                    <Icon name="premium" /> {t("tabPremium")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* PANEL: NALOG */}
        <div className={`ep-panel${panel === "nalog" ? " active" : ""}`} id="panel-nalog">
          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("displayName")}</div>
              <div className="ep-card-sub">{t("accDisplayNameSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-field">
                <label className="ep-label" htmlFor="inp-ime-nalog">
                  {t("displayName")} <span className="ep-label-hint">{t("displayNameHint")}</span>
                </label>
                <input
                  className="ep-input"
                  type="text"
                  value={name}
                  id="inp-ime-nalog"
                  onChange={(e) => {
                    setName(e.target.value);
                    syncPreview();
                  }}
                />
                <div
                  className={`ep-char-count${charWarn(name, 40) ? " warn" : ""}`}
                  id="cnt-ime-nalog"
                >
                  {charCount(name, 40)}
                </div>
              </div>
            </div>
            <div className="ep-card-footer">
              <SaveStatus id="name-acc">{t("saved")}</SaveStatus>
              <button
                className="btn btn-primary"
                disabled={savingCard["name-acc"]}
                onClick={() => saveProfile("name-acc")}
              >
                {t("save")}
              </button>
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("emailTitle")}</div>
              <div className="ep-card-sub">{t("emailSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-field">
                <label className="ep-label" htmlFor="inp-email-cur">
                  {t("currentEmail")}
                </label>
                <input
                  className="ep-input"
                  id="inp-email-cur"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                />
              </div>
              <div className="ep-field">
                <label className="ep-label" htmlFor="inp-email-new">
                  {t("newEmail")}
                </label>
                <input
                  className="ep-input"
                  id="inp-email-new"
                  type="email"
                  placeholder="novi@email.com"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                />
              </div>
              {emailMsg && (
                <div className="ep-toggle-sub" style={{ wordBreak: "break-all" }}>
                  {emailMsg}
                </div>
              )}
              {verifyMsg && (
                <div className="ep-toggle-sub" style={{ wordBreak: "break-all" }}>
                  {verifyMsg}
                </div>
              )}
            </div>
            <div className="ep-card-footer">
              <button className="btn btn-ghost" onClick={handleVerifyEmail} disabled={verifyBusy}>
                {t("verifyEmailBtn")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleChangeEmail}
                disabled={emailBusy || !newEmailInput.trim()}
              >
                {t("changeEmailBtn")}
              </button>
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("passwordTitle")}</div>
              <div className="ep-card-sub">{t("passwordSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-field">
                <label className="ep-label" htmlFor="pw-cur">
                  {t("currentPassword")}
                </label>
                <input
                  className="ep-input"
                  id="pw-cur"
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                />
              </div>
              <div className="ep-two-col">
                <div className="ep-field">
                  <label className="ep-label" htmlFor="pw-new">
                    {t("newPassword")}
                  </label>
                  <input
                    className="ep-input"
                    type="password"
                    id="pw-new"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                  />
                </div>
                <div className="ep-field">
                  <label className="ep-label" htmlFor="pw-confirm">
                    {t("confirmNewPassword")}
                  </label>
                  <input
                    className="ep-input"
                    type="password"
                    id="pw-confirm"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                  />
                </div>
              </div>
              <div id="pw-hint" style={{ fontSize: "12.5px", color: pwHintColor }}>
                {pwHintText}
              </div>
            </div>
            <div className="ep-card-footer">
              <SaveStatus id="pw">{t("passwordChanged")}</SaveStatus>
              <button
                className="btn btn-primary"
                disabled={savingCard.pw || pwNew.length < 8 || pwNew !== pwConfirm || !pwCurrent}
                onClick={handleChangePassword}
              >
                {t("changePassword")}
              </button>
            </div>
          </div>
        </div>

        {/* PANEL: INTEGRACIJE */}
        <div
          className={`ep-panel${panel === "integracije" ? " active" : ""}`}
          id="panel-integracije"
        >
          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("connectedAccountsTitle")}</div>
              <div className="ep-card-sub">{t("connectedAccountsSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-int-card">
                <span className="ep-int-ico" aria-hidden="true">
                  <Icon name="server" />
                </span>
                <div className="ep-int-info">
                  <div className="ep-int-name">
                    {integrations?.github.connected && integrations.github.username
                      ? `GitHub · ${integrations.github.username}`
                      : "GitHub"}
                  </div>
                  <div className="ep-int-sub">
                    {integrations?.github.connected ? t("contributions") : t("notConnected")}
                  </div>
                </div>
                {integrations?.github.connected ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn btn-ghost ep-int-btn"
                      onClick={handleSyncGithub}
                      disabled={intBusy.githubSync}
                    >
                      {intBusy.githubSync ? t("syncGithubBusy") : t("syncGithub")}
                    </button>
                    <button
                      className="btn btn-ghost ep-int-btn"
                      onClick={() => handleDisconnect("github")}
                      disabled={intBusy.github}
                    >
                      {t("disconnect")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost ep-int-btn"
                    onClick={() => connectIntegration("github")}
                  >
                    {t("connect")}
                  </button>
                )}
              </div>

              <div className="ep-int-card">
                <span className="ep-int-ico" aria-hidden="true">
                  <Icon name="teams" />
                </span>
                <div className="ep-int-info">
                  <div className="ep-int-name">LinkedIn</div>
                  <div className="ep-int-sub">
                    {integrations?.linkedin.connected ? t("connected") : t("linkedinNotConnected")}
                  </div>
                </div>
                {integrations?.linkedin.connected ? (
                  <button
                    className="btn btn-ghost ep-int-btn"
                    onClick={() => handleDisconnect("linkedin")}
                    disabled={intBusy.linkedin}
                  >
                    {t("disconnect")}
                  </button>
                ) : (
                  <button className="btn btn-ghost ep-int-btn" disabled>
                    {t("connect")}
                  </button>
                )}
              </div>

              <div className="ep-int-card">
                <span className="ep-int-ico g" aria-hidden="true">
                  G
                </span>
                <div className="ep-int-info">
                  <div className="ep-int-name">Google</div>
                  <div className="ep-int-sub">
                    {integrations?.google.connected ? t("googleSub") : t("notConnected")}
                  </div>
                </div>
                {integrations?.google.connected ? (
                  <button
                    className="btn btn-ghost ep-int-btn"
                    onClick={() => handleDisconnect("google")}
                    disabled={intBusy.google}
                  >
                    {t("disconnect")}
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost ep-int-btn"
                    onClick={() => connectIntegration("google")}
                  >
                    {t("connect")}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("skillSyncTitle")}</div>
              <div className="ep-card-sub">{t("skillSyncSub")}</div>
            </div>
            <div className="ep-card-body">
              {/* GitHub auto-sync settings and manual sync have no api.ts
                  endpoint (UserSettings carries no GitHub fields and there is
                  no sync route). The controls are disabled so they cannot
                  silently no-op, and the mock Save/Reset footer was removed. */}
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("autoSync")}</div>
                  <div className="ep-toggle-sub">{t("autoSyncSub")}</div>
                </div>
                <label className="ep-toggle">
                  <input type="checkbox" defaultChecked disabled aria-label={t("autoSync")} />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("showGithubActivity")}</div>
                  <div className="ep-toggle-sub">{t("showGithubActivitySub")}</div>
                </div>
                <label className="ep-toggle">
                  <input
                    type="checkbox"
                    defaultChecked
                    disabled
                    aria-label={t("showGithubActivity")}
                  />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
              <button className="btn btn-ghost ep-sync-btn" disabled>
                <Icon name="clock" /> {t("manualSync")}
              </button>
            </div>
          </div>
        </div>

        {/* PANEL: PRIVATNOST */}
        <div className={`ep-panel${panel === "privatnost" ? " active" : ""}`} id="panel-privatnost">
          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("visibilityTitle")}</div>
              <div className="ep-card-sub">{t("visibilitySub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-field">
                <label className="ep-label" htmlFor="sel-vis">
                  {t("whoCanSee")}
                </label>
                <select
                  className="ep-select"
                  id="sel-vis"
                  value={settings?.profileVisibility ?? "members"}
                  disabled={!settings}
                  onChange={(e) =>
                    updateSetting(
                      "profileVisibility",
                      e.target.value as api.UserSettings["profileVisibility"],
                    )
                  }
                >
                  <option value="all">{t("visAll")}</option>
                  <option value="members">{t("visMembers")}</option>
                  <option value="none">{t("visNone")}</option>
                </select>
              </div>
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("visibleToRecruiters")}</div>
                  <div className="ep-toggle-sub">{t("visibleToRecruitersSub")}</div>
                </div>
                <label className="ep-toggle">
                  <input
                    type="checkbox"
                    checked={settings?.visibleToRecruiters ?? false}
                    disabled={!settings}
                    onChange={(e) => updateSetting("visibleToRecruiters", e.target.checked)}
                    aria-label={t("visibleToRecruiters")}
                  />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("showEmail")}</div>
                  <div className="ep-toggle-sub">{t("showEmailSub")}</div>
                </div>
                <label className="ep-toggle">
                  <input
                    type="checkbox"
                    checked={settings?.showEmail ?? false}
                    disabled={!settings}
                    onChange={(e) => updateSetting("showEmail", e.target.checked)}
                    aria-label={t("showEmail")}
                  />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("showLocation")}</div>
                  <div className="ep-toggle-sub">{t("showLocationSub")}</div>
                </div>
                <label className="ep-toggle">
                  <input
                    type="checkbox"
                    checked={settings?.showLocation ?? false}
                    disabled={!settings}
                    onChange={(e) => updateSetting("showLocation", e.target.checked)}
                    aria-label={t("showLocation")}
                  />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
            </div>
            {/* Each toggle/select auto-persists via updateSetting() — the
                card-level Save/Reset footer was redundant and removed. */}
          </div>

          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("notificationsTitle")}</div>
              <div className="ep-card-sub">{t("notificationsSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("emailNotifications")}</div>
                  <div className="ep-toggle-sub">{t("emailNotificationsSub")}</div>
                </div>
                <label className="ep-toggle">
                  <input
                    type="checkbox"
                    checked={settings?.emailNotifications ?? false}
                    disabled={!settings}
                    onChange={(e) => updateSetting("emailNotifications", e.target.checked)}
                    aria-label={t("emailNotifications")}
                  />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("pushNotifications")}</div>
                  <div className="ep-toggle-sub">{t("pushNotificationsSub")}</div>
                </div>
                <label className="ep-toggle">
                  <input
                    type="checkbox"
                    checked={settings?.pushNotifications ?? false}
                    disabled={!settings}
                    onChange={(e) => updateSetting("pushNotifications", e.target.checked)}
                    aria-label={t("pushNotifications")}
                  />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
              <div className="ep-toggle-row">
                <div className="ep-toggle-info">
                  <div className="ep-toggle-title">{t("dailyGameReminders")}</div>
                  <div className="ep-toggle-sub">{t("dailyGameRemindersSub")}</div>
                </div>
                {/* No UserSettings field backs daily-game reminders, so this
                    toggle is disabled rather than silently discarding input. */}
                <label className="ep-toggle">
                  <input type="checkbox" disabled aria-label={t("dailyGameReminders")} />
                  <span className="ep-toggle-track" aria-hidden="true" />
                  <span className="ep-toggle-thumb" aria-hidden="true" />
                </label>
              </div>
            </div>
            {/* Email/push notifications auto-persist via updateSetting() — the
                card-level Save/Reset footer was redundant and removed. */}
          </div>
        </div>

        {/* PANEL: OPASNO */}
        <div className={`ep-panel${panel === "opasno" ? " active" : ""}`} id="panel-opasno">
          <div className="ep-danger-card">
            <div className="ep-danger-header">
              <div className="ep-danger-title">
                <Icon name="flag" /> {t("deleteProfileTitle")}
              </div>
            </div>
            <div className="ep-danger-body">
              <div className="ep-danger-row">
                <div className="ep-danger-info">
                  <div className="ep-toggle-title">{t("deactivateTitle")}</div>
                  <div className="ep-toggle-sub">{t("deactivateSub")}</div>
                </div>
                <button
                  className="ep-btn-danger"
                  onClick={() => confirmDanger(t("confirmDeactivate"))}
                >
                  {t("deactivate")}
                </button>
              </div>

              <div className="ep-danger-divider" />

              <div className="ep-danger-row">
                <div className="ep-danger-info">
                  <div className="ep-toggle-title">{t("deleteDataTitle")}</div>
                  <div className="ep-toggle-sub">{t("deleteDataSub")}</div>
                </div>
                <button
                  className="ep-btn-danger"
                  onClick={() => confirmDanger(t("confirmDeleteData"))}
                >
                  {t("deleteData")}
                </button>
              </div>

              <div className="ep-danger-divider" />

              <div className="ep-danger-row">
                <div className="ep-danger-info">
                  <div className="ep-toggle-title">{t("deleteAccountTitle")}</div>
                  <div className="ep-toggle-sub ep-danger-sub-red">{t("deleteAccountSub")}</div>
                </div>
                <button
                  className="ep-btn-danger strong"
                  onClick={() => confirmDanger(t("confirmDeleteAccount"))}
                >
                  <Icon name="x" /> {t("deleteAccount")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL: PREMIUM */}
        <div className={`ep-panel${panel === "premium" ? " active" : ""}`} id="panel-premium">
          {/* Features overview */}
          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("premiumStatusTitle")}</div>
              <div className="ep-card-sub">{t("premiumStatusSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-feat-grid">
                <div className="ep-feat">
                  <Icon name="image" />
                  <div>
                    <div className="ep-feat-name">{t("featGifName")}</div>
                    <div className="ep-feat-sub">{t("featGifSub")}</div>
                  </div>
                </div>
                <div className="ep-feat">
                  <Icon name="flame" />
                  <div>
                    <div className="ep-feat-name">{t("featColorName")}</div>
                    <div className="ep-feat-sub">{t("featColorSub")}</div>
                  </div>
                </div>
                <div className="ep-feat">
                  <Icon name="gamehub" />
                  <div>
                    <div className="ep-feat-name">{t("featSpinName")}</div>
                    <div className="ep-feat-sub">{t("featSpinSub")}</div>
                  </div>
                </div>
                <div className="ep-feat gold">
                  <Icon name="premium" />
                  <div>
                    <div className="ep-feat-name">{t("featBadgeName")}</div>
                    <div className="ep-feat-sub">{t("featBadgeSub")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Activation form (non-premium state) */}
          <div id="premium-form-wrap" style={{ display: premiumActive ? "none" : undefined }}>
            <div className="ep-card">
              <div className="ep-card-header">
                <div className="ep-card-title">{t("activatePremiumTitle")}</div>
                <div className="ep-card-sub">{t("activatePremiumSub")}</div>
              </div>
              <div className="ep-card-body">
                {/* Plan selection */}
                <div className="ep-plan-grid" id="plan-selector">
                  <button
                    type="button"
                    className={`ep-plan${selectedPlan === "mesecno" ? " selected" : ""}`}
                    id="plan-mesecno"
                    onClick={() => setSelectedPlan("mesecno")}
                  >
                    <div className="ep-plan-tier">{t("monthly")}</div>
                    <div className="ep-plan-price">€4.99</div>
                    <div className="ep-plan-note">{t("perMonth")}</div>
                    <div className="ep-plan-state">
                      {selectedPlan === "mesecno" ? t("selected") : t("choose")}
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`ep-plan${selectedPlan === "godisnje" ? " selected" : ""}`}
                    id="plan-godisnje"
                    onClick={() => setSelectedPlan("godisnje")}
                  >
                    <span className="ep-plan-save">{t("save33")}</span>
                    <div className="ep-plan-tier">{t("yearly")}</div>
                    <div className="ep-plan-price">€39.99</div>
                    <div className="ep-plan-note">{t("perYear")}</div>
                    <div className="ep-plan-state">
                      {selectedPlan === "godisnje" ? t("selected") : t("choose")}
                    </div>
                  </button>
                </div>

                {/* Payment form (initially hidden) */}
                <div
                  id="premium-payment-form"
                  className="ep-pay-form"
                  style={{ display: paymentFormVisible ? "flex" : undefined }}
                >
                  <div className="ep-pay-title">{t("cardData")}</div>
                  <div className="ep-field">
                    <label className="ep-label" htmlFor="pay-card">
                      {t("cardNumber")}
                    </label>
                    <input
                      className="ep-input"
                      id="pay-card"
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      inputMode="numeric"
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.value = el.value
                          .replace(/[^0-9]/g, "")
                          .replace(/(.{4})/g, "$1 ")
                          .trim();
                      }}
                    />
                  </div>
                  <div className="ep-two-col">
                    <div className="ep-field">
                      <label className="ep-label" htmlFor="pay-exp">
                        {t("expiryDate")}
                      </label>
                      <input
                        className="ep-input"
                        id="pay-exp"
                        type="text"
                        placeholder={t("expiryPlaceholder")}
                        maxLength={5}
                      />
                    </div>
                    <div className="ep-field">
                      <label className="ep-label" htmlFor="pay-cvv">
                        {t("cvv")}
                      </label>
                      <input
                        className="ep-input"
                        id="pay-cvv"
                        type="text"
                        placeholder="•••"
                        maxLength={3}
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                  <div className="ep-field">
                    <label className="ep-label" htmlFor="pay-name">
                      {t("cardholderName")}
                    </label>
                    <input
                      className="ep-input"
                      id="pay-name"
                      type="text"
                      placeholder="Andrej Čolić"
                    />
                  </div>
                  <div className="ep-pay-secure">
                    <Icon name="lock" /> {t("paySecure")}
                  </div>
                </div>
              </div>
              <div className="ep-card-footer">
                <button
                  className="btn btn-violet"
                  id="premium-main-btn"
                  onClick={handlePremiumBtn}
                  disabled={premiumBusy}
                >
                  {paymentFormVisible ? (
                    <>
                      <Icon name="check" /> {t("confirmPayment")}
                    </>
                  ) : (
                    <>
                      <Icon name="premium" /> {t("activatePremium")}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Active premium state (hidden initially) */}
          <div id="premium-active-wrap" style={{ display: premiumActive ? "block" : "none" }}>
            <div className="ep-card">
              <div className="ep-card-header">
                <div className="ep-card-title">
                  <span className="ep-badge-active">
                    <Icon name="premium" /> {t("active")}
                  </span>{" "}
                  {t("yourPlan")}
                </div>
              </div>
              <div className="ep-card-body">
                <div className="ep-plan-active-box">
                  <div className="ep-plan-active-lbl">{t("activePlan")}</div>
                  <div className="ep-plan-active-name" id="active-plan-name">
                    {activePlanName}
                  </div>
                  <div className="ep-plan-active-meta">
                    {t("expires")} <strong id="active-plan-expiry">{activePlanExpiry}</strong> ·{" "}
                    {t("autoRenewLabel")}{" "}
                    <strong
                      id="auto-renew-status"
                      style={{ color: autoRenewOn ? "var(--green)" : "var(--red)" }}
                    >
                      {autoRenewOn ? t("on") : t("off")}
                    </strong>
                  </div>
                </div>
                <button
                  className="ep-btn-danger"
                  style={{ width: "fit-content" }}
                  onClick={removePremium}
                >
                  <Icon name="x" /> {t("removePremium")}
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* end panel-premium */}

        {/* PANEL: ODJAVA */}
        <div className={`ep-panel${panel === "odjava" ? " active" : ""}`} id="panel-odjava">
          <div className="ep-card">
            <div className="ep-card-header">
              <div className="ep-card-title">{t("logoutTitle")}</div>
              <div className="ep-card-sub">{t("logoutSub")}</div>
            </div>
            <div className="ep-card-body">
              <div className="ep-logout-row">
                <span
                  className="avatar brand is-orb"
                  style={{ width: "46px", height: "46px", fontSize: "14px" }}
                  aria-hidden="true"
                >
                  <OrbArt url={avatarUrl} seed={username} />
                </span>
                <div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--ink)",
                    }}
                  >
                    Andrej Čolić
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>
                    @andrej · an•••@gmail.com
                  </div>
                </div>
              </div>
            </div>
            <div className="ep-card-footer">
              <button
                className="ep-btn-danger"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  fontSize: "14px",
                  padding: "11px 0",
                }}
                onClick={handleLogout}
              >
                <Icon name="logout" /> {t("logout")}
              </button>
            </div>
          </div>
        </div>

        {/* In-app confirm dialog (replaces window.confirm) */}
        {confirmDialog && (
          <div
            className="set-modal-overlay"
            role="presentation"
            onClick={() => setConfirmDialog(null)}
          >
            <div
              className="set-modal"
              role="alertdialog"
              aria-modal="true"
              aria-label={confirmDialog.message}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="set-modal-msg">{confirmDialog.message}</div>
              <div className="set-modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                >
                  {t("cancel")}
                </button>
                <button
                  className={confirmDialog.danger ? "ep-btn-danger" : "btn btn-primary"}
                  type="button"
                  onClick={() => {
                    const fn = confirmDialog.onConfirm;
                    setConfirmDialog(null);
                    fn();
                  }}
                >
                  {t("confirm")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-app toast (replaces window.alert) */}
        <div
          className={`set-toast${toast ? " visible" : ""}${toast?.tone === "err" ? " err" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast && (
            <>
              <Icon name={toast.tone === "err" ? "flag" : "check"} />
              <span>{toast.text}</span>
            </>
          )}
        </div>
      </main>

      {cropTarget && (
        <ImageCropper
          src={cropTarget.previewUrl}
          imgRatio={cropTarget.imgRatio}
          focalX={cropTarget.focalX}
          focalY={cropTarget.focalY}
          zoom={cropTarget.zoom}
          lockedRatio={cropTarget.kind === "avatar" ? AVATAR_RATIO : BANNER_RATIO}
          lockedLabel={cropTarget.kind === "avatar" ? t("cropAvatarLabel") : t("cropBannerLabel")}
          onChange={(fx, fy, z) =>
            setCropTarget((c) => (c ? { ...c, focalX: fx, focalY: fy, zoom: z } : c))
          }
          onClose={cancelCrop}
          onDone={confirmCrop}
          hint={t("cropHint")}
          done={t("cropApply")}
        />
      )}
    </AppShell>
  );
}

export default SettingsClient;
