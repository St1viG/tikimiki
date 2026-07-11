import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnvFile } from "dotenv";
import { z } from "zod";

// Load backend/.env (if present) then the repo-root .env (shared with
// docker-compose) into process.env. Keys already present in the real
// environment always win — dotenv never overwrites existing values — which
// is what keeps the test suite pinned to tikimiki_test (vitest presets
// DATABASE_URL before any of this runs).
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", ".env")]) {
  if (existsSync(candidate)) loadEnvFile({ path: candidate });
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().default("postgres://tikimiki:tikimiki@localhost:5432/tikimiki"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  JWT_ACCESS_SECRET: z.string().min(1).default("change-me-access"),
  JWT_REFRESH_SECRET: z.string().min(1).default("change-me-refresh"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  // Lifetimes (seconds) for the stateless email-verification and
  // password-reset links minted by AccountService.
  EMAIL_VERIFY_TTL: z.coerce.number().int().positive().default(86_400),
  PASSWORD_RESET_TTL: z.coerce.number().int().positive().default(3_600),
  // ── OAuth (optional; blank = provider disabled) ──────────────────────
  // Public base the BROWSER uses to reach the API (through the Next proxy),
  // used to build provider redirect URIs.
  OAUTH_REDIRECT_BASE: z.string().default("http://localhost:3000"),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  LINKEDIN_CLIENT_ID: z.string().default(""),
  LINKEDIN_CLIENT_SECRET: z.string().default(""),
  // ── SMTP (optional; blank host = mail disabled, logs to console) ─────
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("tikimiki <no-reply@tikimiki.local>"),
});

// Blank values (bare `KEY=` lines in .env) behave like unset keys so the
// schema defaults apply instead of failing enum/url validation on "".
const definedEnv = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));

export const env = schema.parse(definedEnv);
export type Env = z.infer<typeof schema>;
