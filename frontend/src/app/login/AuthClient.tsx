"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { Wordmark } from "@/components/auth/Wordmark";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ApiError,
  checkAvailability,
  forgotPassword,
  me,
  oauthUrl,
  refreshSession,
  submitBanAppeal,
} from "@/lib/api";

/**
 * AuthClient — the shared /login + /signup card.
 *
 * One card, two modes: sign-in first, registration reached through the
 * "Don't have an account?" switch under the social buttons (and back).
 * `initialMode` comes from the route; switching modes swaps the URL with
 * history.replaceState so deep links stay honest without remounting (a
 * remount would wipe the user's half-typed fields).
 *
 * Everything is wired to the real API: credentials via useAuth
 * login/register, live availability via GET /auth/availability, social
 * buttons via the OAuth entrypoints (the return leg lands back here as
 * /login?oauth=…), "Forgot password?" via /auth/password/forgot (emailed
 * link → /reset-password), and the banned-account appeal via
 * /auth/appeals. The captcha is the same client-side Turnstile
 * placeholder the old pages had.
 *
 * Validation model ("reward early, punish late"): errors are computed on
 * every render but only *displayed* after the field's first blur (or a
 * failed submit). Once visible they re-evaluate on each keystroke, so an
 * error clears the moment it is fixed. The green check shows as soon as a
 * field validates, even before blur. Exception: typing in the confirm
 * field hides its mismatch error until the next blur — the user is
 * already correcting it, no need to keep repeating it.
 */

const M = {
  headingLogin: { en: "Welcome back", sr: "Zdravo opet" },
  headingRegister: { en: "Create your account", sr: "Napravi nalog" },

  identifierLabel: { en: "Email or username", sr: "Email ili korisničko ime" },
  emailLabel: { en: "Email", sr: "Email" },
  usernameLabel: { en: "Username", sr: "Korisničko ime" },
  passwordLabel: { en: "Password", sr: "Lozinka" },
  confirmLabel: { en: "Confirm password", sr: "Potvrdi lozinku" },

  identifierRequired: {
    en: "Enter your email or username.",
    sr: "Unesi email ili korisničko ime.",
  },
  emailRequired: { en: "Enter your email.", sr: "Unesi email adresu." },
  emailNoSpaces: { en: "Email can't contain spaces.", sr: "Email ne sme da sadrži razmake." },
  emailMissingAt: { en: "Email is missing an @.", sr: "Email adresi nedostaje @." },
  emailOneAt: { en: "Email has more than one @.", sr: "Email ima više od jednog @." },
  emailMissingLocal: { en: "There's nothing before the @.", sr: "Nedostaje deo pre @." },
  emailMissingDomain: {
    en: "Add a domain after the @, like gmail.com.",
    sr: "Dodaj domen posle @, npr. gmail.com.",
  },
  emailDomainDot: {
    en: "The domain needs a dot, like gmail.com.",
    sr: "Domenu nedostaje tačka, npr. gmail.com.",
  },
  emailTaken: { en: "This email is already registered.", sr: "Ovaj email je već registrovan." },
  useLoginInstead: { en: "Sign in instead", sr: "Prijavi se umesto toga" },
  checking: { en: "Checking availability…", sr: "Proveravamo dostupnost…" },
  emailFree: { en: "This email is available.", sr: "Ovaj email je slobodan." },

  usernameRequired: { en: "Choose a username.", sr: "Izaberi korisničko ime." },
  usernameNoSpaces: {
    en: "Usernames can't contain spaces.",
    sr: "Korisničko ime ne sme da sadrži razmake.",
  },
  usernameChars: {
    en: "Only letters, numbers, and . _ - are allowed.",
    sr: "Dozvoljena su samo slova, brojevi i . _ -",
  },
  usernameTooShort: {
    en: "Username needs at least 3 characters.",
    sr: "Korisničko ime mora imati bar 3 karaktera.",
  },
  usernameTooLong: {
    en: "Username can have at most 32 characters.",
    sr: "Korisničko ime može imati najviše 32 karaktera.",
  },
  usernameTaken: { en: "This username is taken.", sr: "Ovo korisničko ime je zauzeto." },
  usernameFree: { en: "This username is available.", sr: "Ovo korisničko ime je slobodno." },

  pwRequired: { en: "Enter your password.", sr: "Unesi lozinku." },
  pwTooShort: {
    en: "Password needs at least 8 characters.",
    sr: "Lozinka mora imati bar 8 karaktera.",
  },
  pwNeedsUpper: { en: "Add an uppercase letter (A–Z).", sr: "Dodaj veliko slovo (A–Z)." },
  pwNeedsNumber: { en: "Add a number (0–9).", sr: "Dodaj broj (0–9)." },
  pwNeedsSymbol: { en: "Add a symbol, like ! or #.", sr: "Dodaj simbol, npr. ! ili #." },
  confirmRequired: { en: "Repeat your password.", sr: "Ponovi lozinku." },
  confirmMismatch: { en: "Passwords don't match.", sr: "Lozinke se ne poklapaju." },

  reqsLabel: { en: "Password requirements", sr: "Zahtevi za lozinku" },
  reqLen: { en: "8+ characters", sr: "8+ karaktera" },
  reqUpper: { en: "Uppercase letter", sr: "Veliko slovo" },
  reqNumber: { en: "Number", sr: "Broj" },
  reqSymbol: { en: "Symbol", sr: "Simbol" },
  reqMet: { en: "met", sr: "ispunjeno" },
  reqUnmet: { en: "not met", sr: "nedostaje" },

  capsLock: { en: "Caps Lock is on.", sr: "Uključen je Caps Lock." },
  showPw: { en: "Show password", sr: "Prikaži lozinku" },
  hidePw: { en: "Hide password", sr: "Sakrij lozinku" },
  rememberMe: { en: "Remember me", sr: "Zapamti me" },
  notARobot: { en: "I'm not a robot", sr: "Nisam robot" },
  captchaLabel: { en: "I am not a robot", sr: "Nisam robot" },
  privacyTerms: { en: "Privacy · Terms", sr: "Privatnost · Uslovi" },
  captchaRequired: { en: "Confirm you're not a robot.", sr: "Potvrdi da nisi robot." },
  forgot: { en: "Forgot password?", sr: "Zaboravljena lozinka?" },
  forgotNeedEmail: { en: "Enter your email first.", sr: "Prvo unesi email." },
  forgotSent: {
    en: "If that email is registered, a reset link is on its way.",
    sr: "Ako je taj email registrovan, link za reset stiže uskoro.",
  },
  forgotDevLink: { en: "Reset link (dev):", sr: "Link za reset (dev):" },

  submitLogin: { en: "Sign in", sr: "Prijavi se" },
  submitRegister: { en: "Create account", sr: "Napravi nalog" },
  submittingLogin: { en: "Signing in…", sr: "Prijavljivanje…" },
  submittingRegister: { en: "Creating account…", sr: "Pravimo nalog…" },
  loginFailed: {
    en: "Invalid credentials. Check your email or username and password.",
    sr: "Pogrešni podaci. Proveri email ili korisničko ime i lozinku.",
  },
  registerTaken: {
    en: "That email or username is already taken.",
    sr: "Taj email ili korisničko ime je već zauzeto.",
  },
  genericError: {
    en: "Something went wrong. Try again.",
    sr: "Nešto je pošlo naopako. Pokušaj ponovo.",
  },
  fixFields: { en: "Check the highlighted fields.", sr: "Proveri označena polja." },

  oauthError: {
    en: "Could not sign you in. Please try again.",
    sr: "Prijava nije uspela. Pokušaj ponovo.",
  },
  oauthUnconfigured: {
    en: "This sign-in method isn't enabled yet.",
    sr: "Ovaj način prijave još nije omogućen.",
  },

  bannedTitle: { en: "Your account is suspended", sr: "Tvoj nalog je suspendovan" },
  bannedReason: { en: "Reason:", sr: "Razlog:" },
  appealLabel: { en: "Submit an appeal", sr: "Podnesi žalbu" },
  appealSubmit: { en: "Submit appeal", sr: "Pošalji žalbu" },
  appealSubmitting: { en: "Submitting…", sr: "Slanje…" },
  appealSubmitted: {
    en: "Appeal submitted. We'll review it soon.",
    sr: "Žalba je poslata. Pregledaćemo je uskoro.",
  },
  appealPending: {
    en: "You already have an appeal pending review.",
    sr: "Već imaš žalbu na čekanju.",
  },
  appealError: {
    en: "Could not submit your appeal. Try again.",
    sr: "Slanje žalbe nije uspelo. Pokušaj ponovo.",
  },
  appealNeedReason: {
    en: "Describe your appeal in at least 10 characters.",
    sr: "Opiši žalbu u bar 10 karaktera.",
  },

  orContinueWith: { en: "or continue with", sr: "ili nastavi sa" },
  continueWithGoogle: { en: "Continue with Google", sr: "Nastavi sa Google-om" },
  continueWithGithub: { en: "Continue with GitHub", sr: "Nastavi sa GitHub-om" },
  continueWithLinkedin: { en: "Continue with LinkedIn", sr: "Nastavi sa LinkedIn-om" },

  noAccount: { en: "Don't have an account?", sr: "Nemaš nalog?" },
  switchSignUp: { en: "Sign up", sr: "Registruj se" },
  haveAccount: { en: "Already have an account?", sr: "Već imaš nalog?" },
  switchSignIn: { en: "Sign in", sr: "Prijavi se" },
  registeringForOrg: {
    en: "Registering on behalf of a company?",
    sr: "Registruješ se u ime firme?",
  },
  createOrgAccount: { en: "Create organization account", sr: "Kreiraj organizacioni nalog" },
} as const;

type MsgKey = keyof typeof M;
type Mode = "login" | "register";
type Fld = "identifier" | "email" | "username" | "loginPw" | "regPw" | "confirm";
type Avail = "idle" | "checking" | "free" | "taken";
type Provider = "google" | "github" | "linkedin";

const PW_REQS = [
  { key: "reqLen", err: "pwTooShort", test: (p: string) => p.length >= 8 },
  { key: "reqUpper", err: "pwNeedsUpper", test: (p: string) => /[A-Z]/.test(p) },
  { key: "reqNumber", err: "pwNeedsNumber", test: (p: string) => /\d/.test(p) },
  { key: "reqSymbol", err: "pwNeedsSymbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const satisfies ReadonlyArray<{ key: MsgKey; err: MsgKey; test: (p: string) => boolean }>;

/* Step-wise so the message names the exact problem, not "invalid input". */
function emailError(value: string): MsgKey | null {
  const s = value.trim();
  if (!s) return "emailRequired";
  if (/\s/.test(s)) return "emailNoSpaces";
  if (!s.includes("@")) return "emailMissingAt";
  const parts = s.split("@");
  if (parts.length > 2) return "emailOneAt";
  const [local, domain] = parts;
  if (!local) return "emailMissingLocal";
  if (!domain) return "emailMissingDomain";
  if (!/^[^\s@]+\.[A-Za-z]{2,}$/.test(domain)) return "emailDomainDot";
  return null;
}

/* Mirrors registerSchema in backend/src/auth/dto.ts: 3–32, [a-zA-Z0-9_.-]. */
function usernameError(value: string): MsgKey | null {
  const s = value.trim();
  if (!s) return "usernameRequired";
  if (/\s/.test(s)) return "usernameNoSpaces";
  if (!/^[a-zA-Z0-9_.-]+$/.test(s)) return "usernameChars";
  if (s.length < 3) return "usernameTooShort";
  if (s.length > 32) return "usernameTooLong";
  return null;
}

/* Login accepts either form, matching the backend login endpoint. */
function identifierError(value: string): MsgKey | null {
  const s = value.trim();
  if (!s) return "identifierRequired";
  return s.includes("@") ? emailError(s) : usernameError(s);
}

/* Availability probes against the real endpoint; a missing key or a network
   failure counts as "unknown", which we treat as free — register's 409 is
   the authoritative backstop. */
const probeEmail = (v: string) => checkAvailability({ email: v }).then((r) => r.email !== false);
const probeUsername = (v: string) =>
  checkAvailability({ username: v }).then((r) => r.username !== false);

/* Debounced availability: 500ms of typing silence, then the request. seq
   guards against a stale response landing after a newer one; the returned
   setter lets submit-time re-checks override the state. */
function useAvailability(
  active: boolean,
  value: string,
  hasError: boolean,
  check: (v: string) => Promise<boolean>,
) {
  const [state, setState] = useState<Avail>("idle");
  const seq = useRef(0);
  useEffect(() => {
    if (!active || hasError) {
      seq.current++; /* invalidate any in-flight response */
      setState("idle");
      return;
    }
    setState("idle");
    const s = ++seq.current;
    const timer = setTimeout(async () => {
      setState("checking");
      try {
        const free = await check(value.trim());
        if (seq.current === s) setState(free ? "free" : "taken");
      } catch {
        if (seq.current === s) setState("idle");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [active, value, hasError, check]);
  return [state, setState] as const;
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      fill="#0A66C2"
      d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
    />
  </svg>
);

export function AuthClient({ initialMode }: { initialMode: Mode }) {
  const t = useT(M);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register } = useAuth();
  const uid = useId();
  const ids = {
    identifier: `${uid}identifier`,
    identifierMsg: `${uid}identifier-msg`,
    email: `${uid}email`,
    emailMsg: `${uid}email-msg`,
    username: `${uid}username`,
    usernameMsg: `${uid}username-msg`,
    loginPw: `${uid}login-pw`,
    loginPwMsg: `${uid}login-pw-msg`,
    regPw: `${uid}reg-pw`,
    regPwMsg: `${uid}reg-pw-msg`,
    confirm: `${uid}confirm`,
    confirmMsg: `${uid}confirm-msg`,
    reqs: `${uid}reqs`,
    captchaMsg: `${uid}captcha-msg`,
    appeal: `${uid}appeal`,
  };

  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [regPw, setRegPw] = useState("");
  const [confirm, setConfirm] = useState("");

  /* dirty = user typed in the field at least once; showErr = errors visible */
  const noFlags = {
    identifier: false,
    email: false,
    username: false,
    loginPw: false,
    regPw: false,
    confirm: false,
  };
  const dirty = useRef<Record<Fld, boolean>>({ ...noFlags });
  const [showErr, setShowErr] = useState<Record<Fld, boolean>>({ ...noFlags });

  const [pwVisible, setPwVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [caps, setCaps] = useState<Fld | null>(null);
  const [remember, setRemember] = useState(false);
  const [captchaShown, setCaptchaShown] = useState(false);
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [captchaErr, setCaptchaErr] = useState(false);
  const [submitting, setSubmitting] = useState<false | "form" | Provider>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [liveMsg, setLiveMsg] = useState("");
  const liveNudge = useRef(false);

  /* banned-account appeal (login 403 with details.banned) */
  const [bannedReason, setBannedReason] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealDone, setAppealDone] = useState(false);

  const inputRefs = {
    identifier: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    username: useRef<HTMLInputElement>(null),
    loginPw: useRef<HTMLInputElement>(null),
    regPw: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const captchaRef = useRef<HTMLButtonElement>(null);
  /* set when a mode switch should land focus in a specific field (the switch
     control may unmount or lose context, which would drop focus to body) */
  const pendingFocus = useRef<Fld | null>(null);

  /* Autofocus the first field once on mount (not on every mode switch). */
  useEffect(() => {
    inputRefs[initialMode === "login" ? "identifier" : "email"].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingFocus.current) {
      inputRefs[pendingFocus.current].current?.focus();
      pendingFocus.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /* Handle the OAuth return: the backend redirects back to
     /login?oauth=success | error | unconfigured. */
  const oauthHandled = useRef(false);
  useEffect(() => {
    const oauth = searchParams?.get("oauth");
    if (!oauth || oauthHandled.current) return;
    oauthHandled.current = true;
    if (oauth === "success") {
      (async () => {
        try {
          await refreshSession();
          await me();
          router.push("/");
        } catch {
          setFormError(t("oauthError"));
        }
      })();
    } else if (oauth === "error") {
      setFormError(t("oauthError"));
    } else if (oauth === "unconfigured") {
      setInfo(t("oauthUnconfigured"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* The captcha stays out of the way until the user has actually filled the
     form; once revealed it stays (no flickering when a field is cleared). */
  const allFilled =
    mode === "login"
      ? identifier.trim() !== "" && loginPw !== ""
      : email.trim() !== "" && username.trim() !== "" && regPw !== "" && confirm !== "";
  useEffect(() => {
    if (allFilled) setCaptchaShown(true);
  }, [allFilled]);

  useEffect(() => {
    if (captchaErr) captchaRef.current?.focus();
  }, [captchaErr]);

  /* ----- validation (computed live, displayed late) ----- */
  const identifierErr = identifierError(identifier);
  const identifierShownErr = showErr.identifier ? identifierErr : null;
  const identifierValid = !identifierErr && identifier.trim() !== "";

  const emailSyntaxErr = emailError(email);
  const [emailAvail, setEmailAvail] = useAvailability(
    mode === "register",
    email,
    emailSyntaxErr !== null,
    probeEmail,
  );
  const emailShownErr: MsgKey | null =
    showErr.email && emailSyntaxErr
      ? emailSyntaxErr
      : !emailSyntaxErr && emailAvail === "taken"
        ? "emailTaken"
        : null;
  const emailValid = !emailSyntaxErr && email.trim() !== "" && emailAvail === "free";

  const usernameSyntaxErr = usernameError(username);
  const [usernameAvail, setUsernameAvail] = useAvailability(
    mode === "register",
    username,
    usernameSyntaxErr !== null,
    probeUsername,
  );
  const usernameShownErr: MsgKey | null =
    showErr.username && usernameSyntaxErr
      ? usernameSyntaxErr
      : !usernameSyntaxErr && usernameAvail === "taken"
        ? "usernameTaken"
        : null;
  const usernameValid = !usernameSyntaxErr && username.trim() !== "" && usernameAvail === "free";

  const loginPwErr: MsgKey | null = loginPw ? null : "pwRequired";
  const loginPwShownErr = showErr.loginPw ? loginPwErr : null;

  const regPwErr: MsgKey | null = !regPw
    ? "pwRequired"
    : (PW_REQS.find((r) => !r.test(regPw))?.err ?? null);
  const regPwShownErr = showErr.regPw ? regPwErr : null;
  const regPwValid = regPw !== "" && regPwErr === null;

  const confirmErr: MsgKey | null = !confirm
    ? "confirmRequired"
    : confirm !== regPw
      ? "confirmMismatch"
      : null;
  const confirmShownErr = showErr.confirm ? confirmErr : null;
  const confirmValid = confirm !== "" && confirmErr === null;

  /* ----- handlers ----- */
  const change = (f: Fld, set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    dirty.current[f] = true;
    set(e.target.value);
  };
  const markBlur = (f: Fld) => {
    if (dirty.current[f]) setShowErr((s) => (s[f] ? s : { ...s, [f]: true }));
  };
  const capsCheck = (f: Fld) => (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCaps(e.getModifierState("CapsLock") ? f : null);
  const pwBlur = (f: Fld) => () => {
    markBlur(f);
    setCaps((c) => (c === f ? null : c));
  };

  /* Enter walks the form; only the last field of each mode submits
     (login: loginPw, register: confirm — those get no advance entry). */
  const NEXT_FIELD: Partial<Record<Fld, Fld>> = {
    identifier: "loginPw",
    email: "username",
    username: "regPw",
    regPw: "confirm",
  };
  const enterAdvance = (f: Fld) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const next = NEXT_FIELD[f];
    if (e.key === "Enter" && next) {
      e.preventDefault();
      inputRefs[next].current?.focus();
    }
  };
  const pwKeyDown = (f: Fld) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    capsCheck(f)(e);
    enterAdvance(f)(e);
  };

  const announce = (text: string) => {
    /* alternate a trailing NBSP so repeating the same error re-announces */
    liveNudge.current = !liveNudge.current;
    setLiveMsg(text + (liveNudge.current ? "\u00A0" : ""));
  };

  const switchMode = (m: Mode) => {
    if (m === mode || submitting) return;
    /* carry genuinely shared data across modes, never clear anything */
    if (m === "register" && !email && identifier && !emailError(identifier))
      setEmail(identifier.trim());
    if (m === "login" && !identifier && email && !emailError(email)) setIdentifier(email.trim());
    setMode(m);
    setFormError(null);
    setInfo(null);
    setCaps(null);
    setPwVisible(false);
    setConfirmVisible(false);
    setBannedReason(null);
    setAppealError(null);
    setAppealDone(false);
    /* each form asks for its own human check */
    setCaptchaShown(false);
    setCaptchaChecked(false);
    setCaptchaErr(false);
    /* keep the URL honest without a remount (a remount would clear fields) */
    window.history.replaceState(null, "", m === "login" ? "/login" : "/signup");
  };

  const onSwitch = () => {
    pendingFocus.current = mode === "login" ? "email" : "identifier";
    switchMode(mode === "login" ? "register" : "login");
  };

  const errFor = (f: Fld): MsgKey | null => {
    switch (f) {
      case "identifier":
        return identifierErr;
      case "email":
        return emailSyntaxErr ?? (emailAvail === "taken" ? "emailTaken" : null);
      case "username":
        return usernameSyntaxErr ?? (usernameAvail === "taken" ? "usernameTaken" : null);
      case "loginPw":
        return loginPwErr;
      case "regPw":
        return regPwErr;
      case "confirm":
        return confirmErr;
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setInfo(null);
    setBannedReason(null);
    setAppealError(null);
    setAppealDone(false);

    const fields: Fld[] =
      mode === "login" ? ["identifier", "loginPw"] : ["email", "username", "regPw", "confirm"];
    const errs = fields
      .map((f) => [f, errFor(f)] as const)
      .filter((pair): pair is readonly [Fld, MsgKey] => pair[1] !== null);

    if (errs.length > 0) {
      setShowErr((s) => ({ ...s, ...Object.fromEntries(fields.map((f) => [f, true])) }));
      const [firstField, firstErr] = errs[0];
      inputRefs[firstField].current?.focus();
      announce(errs.length > 1 ? `${t("fixFields")} ${t(firstErr)}` : t(firstErr));
      return;
    }

    if (!captchaChecked) {
      /* focusing happens in an effect: the captcha may only mount now */
      setCaptchaShown(true);
      setCaptchaErr(true);
      announce(t("captchaRequired"));
      return;
    }

    setSubmitting("form");
    try {
      if (mode === "login") {
        await login({ email: identifier.trim(), password: loginPw });
      } else {
        await register({
          username: username.trim(),
          email: email.trim(),
          password: regPw,
          accountType: "member",
        });
      }
      router.push("/");
    } catch (err) {
      if (mode === "login" && err instanceof ApiError && err.status === 403) {
        const details = err.details as { banned?: boolean; reason?: string } | undefined;
        if (details?.banned) {
          setBannedReason(details.reason ?? "");
          return;
        }
      }
      if (mode === "register" && err instanceof ApiError && err.status === 409) {
        /* find out which identifier clashed and pin it to the right field */
        try {
          const avail = await checkAvailability({
            email: email.trim(),
            username: username.trim(),
          });
          if (avail.email === false || avail.username === false) {
            if (avail.email === false) setEmailAvail("taken");
            if (avail.username === false) setUsernameAvail("taken");
            const f: Fld = avail.email === false ? "email" : "username";
            inputRefs[f].current?.focus();
            announce(t(avail.email === false ? "emailTaken" : "usernameTaken"));
            return;
          }
        } catch {
          /* fall through to the generic taken banner */
        }
        setFormError(t("registerTaken"));
        return;
      }
      setFormError(
        mode === "login" && err instanceof ApiError && err.status === 401
          ? t("loginFailed")
          : t("genericError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* Real OAuth: full-page navigation to the backend entrypoint. The spinner
     stays up until the browser leaves; the return leg lands back here. */
  const onSocial = (provider: Provider) => {
    if (submitting) return;
    setFormError(null);
    setInfo(null);
    setSubmitting(provider);
    window.location.href = oauthUrl(provider);
  };

  /* Real forgot-password: the backend emails a reset link (surfaced as
     devLink in development) that opens the /reset-password screen. */
  const onForgot = async () => {
    setFormError(null);
    const asEmail = identifier.includes("@") && !emailError(identifier);
    if (!asEmail) {
      setInfo(t("forgotNeedEmail"));
      inputRefs.identifier.current?.focus();
      return;
    }
    try {
      const res = await forgotPassword(identifier.trim());
      setInfo(
        res.devLink ? `${t("forgotSent")} ${t("forgotDevLink")} ${res.devLink}` : t("forgotSent"),
      );
    } catch {
      /* same neutral copy either way — no account enumeration */
      setInfo(t("forgotSent"));
    }
  };

  const onAppeal = async () => {
    setAppealError(null);
    if (appealReason.trim().length < 10) {
      setAppealError(t("appealNeedReason"));
      return;
    }
    setAppealLoading(true);
    try {
      await submitBanAppeal(identifier.trim(), loginPw, appealReason.trim());
      setAppealDone(true);
    } catch (err) {
      setAppealError(
        err instanceof ApiError && err.status === 409 ? t("appealPending") : t("appealError"),
      );
    } finally {
      setAppealLoading(false);
    }
  };

  const inputCls = (err: MsgKey | null, ok: boolean, extra = "") =>
    `au-input${extra}${err ? " is-err" : ok ? " is-ok" : ""}`;

  return (
    <div className="au-page">
      <Wordmark />

      <main className="au-card">
        <form key={mode} className="au-panel" noValidate onSubmit={onSubmit}>
          <h1 className="au-heading">{t(mode === "login" ? "headingLogin" : "headingRegister")}</h1>

          {mode === "login" ? (
            <>
              {/* Email or username */}
              <div className="au-field">
                <label className="au-label" htmlFor={ids.identifier}>
                  {t("identifierLabel")}
                </label>
                <div className="au-input-wrap">
                  <input
                    ref={inputRefs.identifier}
                    id={ids.identifier}
                    name="identifier"
                    className={inputCls(identifierShownErr, identifierValid)}
                    type="text"
                    autoComplete="username"
                    enterKeyHint="next"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={identifier}
                    onChange={change("identifier", setIdentifier)}
                    onKeyDown={enterAdvance("identifier")}
                    onBlur={() => markBlur("identifier")}
                    aria-invalid={identifierShownErr ? true : undefined}
                    aria-describedby={identifierShownErr ? ids.identifierMsg : undefined}
                  />
                  {identifierValid && (
                    <span className="au-status ok" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                  )}
                </div>
                <div aria-live="polite">
                  {identifierShownErr && (
                    <p className="au-msg err" id={ids.identifierMsg}>
                      <Icon name="alert" />
                      <span>{t(identifierShownErr)}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Login password */}
              <div className="au-field">
                <label className="au-label" htmlFor={ids.loginPw}>
                  {t("passwordLabel")}
                </label>
                <div className="au-input-wrap">
                  <input
                    ref={inputRefs.loginPw}
                    id={ids.loginPw}
                    name="password"
                    className={inputCls(loginPwShownErr, false, " has-eye")}
                    type={pwVisible ? "text" : "password"}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    value={loginPw}
                    onChange={change("loginPw", setLoginPw)}
                    onKeyDown={capsCheck("loginPw")}
                    onKeyUp={capsCheck("loginPw")}
                    onBlur={pwBlur("loginPw")}
                    aria-invalid={loginPwShownErr ? true : undefined}
                    aria-describedby={loginPwShownErr ? ids.loginPwMsg : undefined}
                  />
                  <button
                    type="button"
                    className="au-eye"
                    onClick={() => setPwVisible((v) => !v)}
                    aria-label={t(pwVisible ? "hidePw" : "showPw")}
                  >
                    <Icon name={pwVisible ? "eye-off" : "eye"} />
                  </button>
                </div>
                <div aria-live="polite">
                  {loginPwShownErr ? (
                    <p className="au-msg err" id={ids.loginPwMsg}>
                      <Icon name="alert" />
                      <span>{t(loginPwShownErr)}</span>
                    </p>
                  ) : caps === "loginPw" ? (
                    <p className="au-msg warn">
                      <Icon name="alert" />
                      <span>{t("capsLock")}</span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="au-remember-row">
                <label className="au-check-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="au-check-mark" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                  {t("rememberMe")}
                </label>
                <button type="button" className="au-linkbtn" onClick={onForgot}>
                  {t("forgot")}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Email — carried over from login mode when it looks like one */}
              <div className="au-field">
                <label className="au-label" htmlFor={ids.email}>
                  {t("emailLabel")}
                </label>
                <div className="au-input-wrap">
                  <input
                    ref={inputRefs.email}
                    id={ids.email}
                    name="email"
                    className={inputCls(emailShownErr, emailValid)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    enterKeyHint="next"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={change("email", setEmail)}
                    onKeyDown={enterAdvance("email")}
                    onBlur={() => markBlur("email")}
                    aria-invalid={emailShownErr ? true : undefined}
                    aria-describedby={
                      emailShownErr || emailAvail === "checking" ? ids.emailMsg : undefined
                    }
                  />
                  {emailValid && (
                    <span className="au-status ok" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                  )}
                  {emailAvail === "checking" && (
                    <span className="au-status" aria-hidden="true">
                      <span className="au-spin" />
                    </span>
                  )}
                </div>
                <div aria-live="polite">
                  {emailShownErr ? (
                    <p className="au-msg err" id={ids.emailMsg}>
                      <Icon name="alert" />
                      <span>
                        {t(emailShownErr)}
                        {emailShownErr === "emailTaken" && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="au-linkbtn"
                              onClick={() => {
                                pendingFocus.current = "loginPw";
                                switchMode("login");
                              }}
                            >
                              {t("useLoginInstead")}
                            </button>
                          </>
                        )}
                      </span>
                    </p>
                  ) : emailAvail === "checking" ? (
                    <p className="au-msg hint" id={ids.emailMsg}>
                      {t("checking")}
                    </p>
                  ) : emailValid ? (
                    /* the green check is aria-hidden; say it out loud too */
                    <p className="au-sr">{t("emailFree")}</p>
                  ) : null}
                </div>
              </div>

              {/* Username — same rules as the register API (3–32, letters/numbers/._-) */}
              <div className="au-field">
                <label className="au-label" htmlFor={ids.username}>
                  {t("usernameLabel")}
                </label>
                <div className="au-input-wrap">
                  <span className="au-input-prefix" aria-hidden="true">
                    @
                  </span>
                  <input
                    ref={inputRefs.username}
                    id={ids.username}
                    name="username"
                    className={inputCls(usernameShownErr, usernameValid, " has-prefix")}
                    type="text"
                    autoComplete="username"
                    enterKeyHint="next"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={change("username", setUsername)}
                    onKeyDown={enterAdvance("username")}
                    onBlur={() => markBlur("username")}
                    aria-invalid={usernameShownErr ? true : undefined}
                    aria-describedby={
                      usernameShownErr || usernameAvail === "checking" ? ids.usernameMsg : undefined
                    }
                  />
                  {usernameValid && (
                    <span className="au-status ok" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                  )}
                  {usernameAvail === "checking" && (
                    <span className="au-status" aria-hidden="true">
                      <span className="au-spin" />
                    </span>
                  )}
                </div>
                <div aria-live="polite">
                  {usernameShownErr ? (
                    <p className="au-msg err" id={ids.usernameMsg}>
                      <Icon name="alert" />
                      <span>{t(usernameShownErr)}</span>
                    </p>
                  ) : usernameAvail === "checking" ? (
                    <p className="au-msg hint" id={ids.usernameMsg}>
                      {t("checking")}
                    </p>
                  ) : usernameValid ? (
                    <p className="au-sr">{t("usernameFree")}</p>
                  ) : null}
                </div>
              </div>

              {/* Registration password + requirements checklist */}
              <div className="au-field">
                <label className="au-label" htmlFor={ids.regPw}>
                  {t("passwordLabel")}
                </label>
                <div className="au-input-wrap">
                  <input
                    ref={inputRefs.regPw}
                    id={ids.regPw}
                    name="new-password"
                    className={inputCls(regPwShownErr, regPwValid, " has-eye")}
                    type={pwVisible ? "text" : "password"}
                    autoComplete="new-password"
                    enterKeyHint="next"
                    value={regPw}
                    onChange={change("regPw", setRegPw)}
                    onKeyDown={pwKeyDown("regPw")}
                    onKeyUp={capsCheck("regPw")}
                    onBlur={pwBlur("regPw")}
                    aria-invalid={regPwShownErr ? true : undefined}
                    aria-describedby={regPwShownErr ? `${ids.regPwMsg} ${ids.reqs}` : ids.reqs}
                  />
                  {regPwValid && (
                    <span className="au-status ok pw" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                  )}
                  <button
                    type="button"
                    className="au-eye"
                    onClick={() => setPwVisible((v) => !v)}
                    aria-label={t(pwVisible ? "hidePw" : "showPw")}
                  >
                    <Icon name={pwVisible ? "eye-off" : "eye"} />
                  </button>
                </div>
                <div aria-live="polite">
                  {regPwShownErr ? (
                    <p className="au-msg err" id={ids.regPwMsg}>
                      <Icon name="alert" />
                      <span>{t(regPwShownErr)}</span>
                    </p>
                  ) : caps === "regPw" ? (
                    <p className="au-msg warn">
                      <Icon name="alert" />
                      <span>{t("capsLock")}</span>
                    </p>
                  ) : null}
                </div>

                <ul className="au-reqs" id={ids.reqs} aria-label={t("reqsLabel")}>
                  {PW_REQS.map((r) => {
                    const ok = r.test(regPw);
                    return (
                      <li key={r.key} className={ok ? "au-req met" : "au-req"}>
                        <span className="au-req-dot" aria-hidden="true">
                          <Icon name="check" />
                        </span>
                        {t(r.key)}
                        <span className="au-sr"> ({t(ok ? "reqMet" : "reqUnmet")})</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Confirm password — live once both fields are in play */}
              <div className="au-field">
                <label className="au-label" htmlFor={ids.confirm}>
                  {t("confirmLabel")}
                </label>
                <div className="au-input-wrap">
                  <input
                    ref={inputRefs.confirm}
                    id={ids.confirm}
                    name="confirm-password"
                    className={inputCls(confirmShownErr, confirmValid, " has-eye")}
                    type={confirmVisible ? "text" : "password"}
                    autoComplete="new-password"
                    enterKeyHint="go"
                    value={confirm}
                    onChange={(e) => {
                      dirty.current.confirm = true;
                      setConfirm(e.target.value);
                      /* typing here means they're correcting the mismatch;
                         hide the error until the next blur instead of
                         repeating it on every keystroke */
                      setShowErr((s) => (s.confirm ? { ...s, confirm: false } : s));
                    }}
                    onKeyDown={capsCheck("confirm")}
                    onKeyUp={capsCheck("confirm")}
                    onBlur={pwBlur("confirm")}
                    aria-invalid={confirmShownErr ? true : undefined}
                    aria-describedby={confirmShownErr ? ids.confirmMsg : undefined}
                  />
                  {confirmValid && (
                    <span className="au-status ok pw" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                  )}
                  <button
                    type="button"
                    className="au-eye"
                    onClick={() => setConfirmVisible((v) => !v)}
                    aria-label={t(confirmVisible ? "hidePw" : "showPw")}
                  >
                    <Icon name={confirmVisible ? "eye-off" : "eye"} />
                  </button>
                </div>
                <div aria-live="polite">
                  {confirmShownErr ? (
                    <p className="au-msg err" id={ids.confirmMsg}>
                      <Icon name="alert" />
                      <span>{t(confirmShownErr)}</span>
                    </p>
                  ) : caps === "confirm" ? (
                    <p className="au-msg warn">
                      <Icon name="alert" />
                      <span>{t("capsLock")}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          )}

          {captchaShown && (
            <div className="au-field au-captcha-field">
              <div className="au-captcha">
                <button
                  type="button"
                  ref={captchaRef}
                  className={`au-captcha-check${captchaChecked ? " checked" : ""}`}
                  role="checkbox"
                  aria-checked={captchaChecked}
                  aria-label={t("captchaLabel")}
                  aria-describedby={captchaErr ? ids.captchaMsg : undefined}
                  onClick={() => {
                    setCaptchaChecked((v) => !v);
                    setCaptchaErr(false);
                  }}
                >
                  <Icon name="check" />
                </button>
                <div className="au-captcha-info">
                  <div className="au-captcha-text">{t("notARobot")}</div>
                  <div className="au-captcha-sub">{t("privacyTerms")}</div>
                </div>
                <div className="au-captcha-brand" aria-hidden="true">
                  <Icon name="shield" />
                  <span>Cloudflare</span>
                </div>
              </div>
              <div aria-live="polite">
                {captchaErr && !captchaChecked && (
                  <p className="au-msg err" id={ids.captchaMsg}>
                    <Icon name="alert" />
                    <span>{t("captchaRequired")}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {bannedReason !== null && (
            <div className="au-banned" role="alert">
              <p className="au-banned-title">{t("bannedTitle")}</p>
              {bannedReason && (
                <p className="au-banned-reason">
                  {t("bannedReason")} {bannedReason}
                </p>
              )}
              {appealDone ? (
                <p className="au-msg hint" role="status">
                  {t("appealSubmitted")}
                </p>
              ) : (
                <div className="au-field">
                  <label className="au-label" htmlFor={ids.appeal}>
                    {t("appealLabel")}
                  </label>
                  <textarea
                    className="au-input"
                    id={ids.appeal}
                    rows={3}
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    aria-invalid={appealError ? true : undefined}
                  />
                  {appealError && (
                    <p className="au-msg err" role="alert">
                      <Icon name="alert" />
                      <span>{appealError}</span>
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={appealLoading}
                    onClick={onAppeal}
                  >
                    {appealLoading ? t("appealSubmitting") : t("appealSubmit")}
                  </button>
                </div>
              )}
            </div>
          )}

          {formError && (
            <div className="au-alert" role="alert">
              <Icon name="alert" />
              <span>{formError}</span>
            </div>
          )}
          {info && (
            <div className="au-alert is-info" role="status">
              <Icon name="mail" />
              <span>{info}</span>
            </div>
          )}

          {/* aria-disabled (not disabled) so the focused button doesn't
              drop focus to <body>; the onSubmit guard blocks re-entry */}
          <button
            type="submit"
            className="btn btn-primary au-submit"
            aria-disabled={submitting !== false || undefined}
            aria-busy={submitting === "form" || undefined}
          >
            {submitting === "form" && <span className="au-spin on-accent" aria-hidden="true" />}
            {submitting === "form"
              ? t(mode === "login" ? "submittingLogin" : "submittingRegister")
              : t(mode === "login" ? "submitLogin" : "submitRegister")}
          </button>
        </form>

        <div className="au-divider">
          <span>{t("orContinueWith")}</span>
        </div>

        <div className="au-oauth">
          <button
            type="button"
            className="au-oauth-btn"
            aria-disabled={submitting !== false || undefined}
            aria-busy={submitting === "google" || undefined}
            aria-label={t("continueWithGoogle")}
            onClick={() => onSocial("google")}
          >
            {submitting === "google" ? (
              <span className="au-spin" aria-hidden="true" />
            ) : (
              <GoogleIcon />
            )}
            <span>Google</span>
          </button>
          <button
            type="button"
            className="au-oauth-btn"
            aria-disabled={submitting !== false || undefined}
            aria-busy={submitting === "github" || undefined}
            aria-label={t("continueWithGithub")}
            onClick={() => onSocial("github")}
          >
            {submitting === "github" ? (
              <span className="au-spin" aria-hidden="true" />
            ) : (
              <Icon name="github" />
            )}
            <span>GitHub</span>
          </button>
          <button
            type="button"
            className="au-oauth-btn"
            aria-disabled={submitting !== false || undefined}
            aria-busy={submitting === "linkedin" || undefined}
            aria-label={t("continueWithLinkedin")}
            onClick={() => onSocial("linkedin")}
          >
            {submitting === "linkedin" ? (
              <span className="au-spin" aria-hidden="true" />
            ) : (
              <LinkedinIcon />
            )}
            <span>LinkedIn</span>
          </button>
        </div>

        <div className="au-switch">
          {t(mode === "login" ? "noAccount" : "haveAccount")}{" "}
          <button type="button" className="au-linkbtn" onClick={onSwitch}>
            {t(mode === "login" ? "switchSignUp" : "switchSignIn")}
          </button>
        </div>

        {mode === "register" && (
          <Link className="au-subtle-link" href="/signup/organization">
            {t("registeringForOrg")} <span>{t("createOrgAccount")}</span>
          </Link>
        )}

        {/* Submit-time announcements for screen readers */}
        <div className="au-sr" aria-live="assertive">
          {liveMsg}
        </div>
      </main>

      <footer className="au-footer">
        <b>tiki</b>miki © <span className="yr">2026</span>
      </footer>
    </div>
  );
}

export default AuthClient;
