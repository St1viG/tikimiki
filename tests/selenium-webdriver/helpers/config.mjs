/**
 * Zajednička konfiguracija za sve WebDriver testove.
 *
 * Sve se može promeniti preko environment promenljivih, npr:
 *   BASE_URL=http://localhost:3000 HEADLESS=1 npm test
 */
export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/** Podrazumevani nalozi iz `pnpm db:seed` (svi imaju lozinku `password123`). */
export const USERS = {
  member: { identifier: "andrej@tikimiki.dev", password: "password123" },
  member2: { identifier: "mohammed@tikimiki.dev", password: "password123" },
  organization: { identifier: "org@tikimiki.dev", password: "password123" },
  admin: { identifier: "admin@tikimiki.dev", password: "password123" },
};

/** Pokretati bez otvaranja prozora ako je HEADLESS postavljen. */
export const HEADLESS = process.env.HEADLESS === "1";
