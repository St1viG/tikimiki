/**
 * Autor: Stevan Gnjato (2023/0141)
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import pg from "pg";
import { buildDriver, login, By, until } from "../helpers/driver.mjs";
import { BASE_URL, USERS } from "../helpers/config.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://tikimiki:tikimiki@localhost:5432/tikimiki";

/** Korisnik čiji email test verifikuje (seed ga drži verifikovanim). */
const USER = USERS.member2; // mohammed@tikimiki.dev

/**
 * Funkcionalnost: verifikacija email adrese (N06–N07). Backend
 * POST /auth/verify-email/request šalje mejl preko Nenadovog mailer modula,
 * a van produkcije vraća i `devLink` (${WEB_ORIGIN}/verify-email?token=…).
 * UI okidač u podešavanjima guta odgovor, pa test dolazi do devLink-a
 * direktnim API pozivom (kroz Next rewrite na istom originu), otvori link
 * WebDriver-om i proveri stanje uspeha na /verify-email — i da je flag
 * upisan u bazu. Setup obara users.is_email_verified i vraća ga u after().
 * SWD-EMV-01, SWD-EMV-02
 */
describe("Verifikacija email adrese (Selenium WebDriver)", function () {
  let driver;
  let db;
  /** Zatečena vrednost is_email_verified, za restore u after(). */
  let originalVerified = null;

  /** Prijavi se na API i vrati Bearer token (fetch iz test procesa). */
  async function apiLogin() {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER.identifier, password: USER.password }),
    });
    assert.equal(res.status, 200, "API login nije uspeo");
    const body = await res.json();
    return body.accessToken;
  }

  before(async () => {
    db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();
    const { rows } = await db.query("select is_email_verified from users where email = $1", [
      USER.identifier,
    ]);
    assert.equal(rows.length, 1, `seed nema korisnika ${USER.identifier}`);
    originalVerified = rows[0].is_email_verified;
    // Zahtev za verifikaciju postoji samo dok je email neverifikovan.
    await db.query("update users set is_email_verified = false where email = $1", [
      USER.identifier,
    ]);

    driver = await buildDriver();
    await login(driver, USER);
  });

  after(async () => {
    if (driver) await driver.quit();
    if (db) {
      if (originalVerified !== null) {
        await db.query("update users set is_email_verified = $2 where email = $1", [
          USER.identifier,
          originalVerified,
        ]);
      }
      await db.end();
    }
  });

  it("SWD-EMV-01: otvaranje devLink-a prikazuje uspeh i upisuje verifikaciju u bazu", async () => {
    // Van produkcije backend vraća link iz mejla i kao devLink u odgovoru.
    const token = await apiLogin();
    const res = await fetch(`${BASE_URL}/api/v1/auth/verify-email/request`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 201, "zahtev za verifikaciju nije prošao");
    const { alreadyVerified, devLink } = await res.json();
    assert.equal(alreadyVerified, false);
    assert.ok(devLink, "devLink mora postojati van produkcije");
    assert.match(devLink, /\/verify-email\?token=/, `neočekivan devLink: ${devLink}`);

    // Korak korisnika iz mejla: otvaranje linka u browseru.
    await driver.get(devLink);
    const success = await driver.wait(
      until.elementLocated(By.css(".auth-card .auth-success")),
      20000,
      "stranica /verify-email nije prikazala stanje uspeha",
    );
    assert.ok((await success.getText()).trim().length > 0);

    // Potvrda i u bazi — verifikacija je zaista upisana.
    await driver.wait(
      async () => {
        const { rows } = await db.query("select is_email_verified from users where email = $1", [
          USER.identifier,
        ]);
        return rows[0].is_email_verified === true;
      },
      10000,
      "is_email_verified nije postao true",
    );
  });

  it("SWD-EMV-02: nevažeći token prikazuje grešku, bez stanja uspeha", async () => {
    await driver.get(`${BASE_URL}/verify-email?token=nevazeci-token`);
    await driver.wait(
      until.elementLocated(By.css(".auth-card .auth-error")),
      20000,
      "stranica /verify-email nije prikazala grešku za nevažeći token",
    );
    assert.equal((await driver.findElements(By.css(".auth-card .auth-success"))).length, 0);
  });
});
