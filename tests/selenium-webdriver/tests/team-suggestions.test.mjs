/**
 * Autor: Stevan Gnjato (2023/0141)
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import pg from "pg";
import { buildDriver, clickSafe, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://tikimiki:tikimiki@localhost:5432/tikimiki";

/** Slobodan igrač iz seed-a čija kartica treba da se pojavi među predlozima. */
const FREE_AGENT_EMAIL = "fenjer@tikimiki.dev";
const FREE_AGENT_HANDLE = "@fenjer";
const HACKATHON_TITLE = "ETF HackWeek 2026";

/**
 * Funkcionalnost: AI predlozi saigrača (D04–D05) na /teams/find, tab
 * "Predloženi". FindClient dohvata aktivan hakaton ulogovanog korisnika pa
 * preko GET /hackathons/:id/team-suggestions renderuje SoloPlayerCard za
 * svakog slobodnog igrača, rangirano po komplementarnosti veština (D03).
 * Oslanja se na `pnpm db:seed` (+ extras): andrej je u timu na "ETF HackWeek
 * 2026", a fenjer je slobodan igrač — prijava bez tima. Setup to garantuje
 * direktno u bazi i u after() vraća zatečeno stanje prijave.
 * SWD-TS-01, SWD-TS-02
 */
describe("AI predlozi saigrača (Selenium WebDriver)", function () {
  let driver;
  let db;
  /** Zatečena fenjerova prijava (za restore), ili null ako nije postojala. */
  let original = null;
  /** ID prijave koju je setup ubacio (briše se u after()). */
  let insertedId = null;

  before(async () => {
    db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();

    // fenjer mora biti slobodan igrač: aktivna prijava na hakaton, bez tima.
    const { rows } = await db.query(
      `select a.application_id, a.status, a.team_id, a.reviewed_by, a.reviewed_at,
              a.rejection_reason
         from applications a
         join users u on u.user_id = a.user_id
         join hackathons h on h.hackathon_id = a.hackathon_id
        where u.email = $1 and h.title = $2 and a.deleted_at is null`,
      [FREE_AGENT_EMAIL, HACKATHON_TITLE],
    );
    if (rows.length > 0) {
      original = rows[0];
      await db.query(
        `update applications
            set status = 'pending', team_id = null, reviewed_by = null,
                reviewed_at = null, rejection_reason = null
          where application_id = $1`,
        [original.application_id],
      );
    } else {
      const inserted = await db.query(
        `insert into applications (user_id, hackathon_id, status)
         select u.user_id, h.hackathon_id, 'pending'
           from users u, hackathons h
          where u.email = $1 and h.title = $2
         returning application_id`,
        [FREE_AGENT_EMAIL, HACKATHON_TITLE],
      );
      insertedId = inserted.rows[0].application_id;
    }

    driver = await buildDriver();
    await login(driver, USERS.member);
    await open(driver, "/teams/find");
    await driver.wait(until.elementLocated(By.css("main#tm-main")), 20000);
  });

  after(async () => {
    if (driver) await driver.quit();
    if (db) {
      if (insertedId) {
        await db.query("delete from applications where application_id = $1", [insertedId]);
      } else if (original) {
        await db.query(
          `update applications
              set status = $2, team_id = $3, reviewed_by = $4, reviewed_at = $5,
                  rejection_reason = $6
            where application_id = $1`,
          [
            original.application_id,
            original.status,
            original.team_id,
            original.reviewed_by,
            original.reviewed_at,
            original.rejection_reason,
          ],
        );
      }
      await db.end();
    }
  });

  /** CSS koren sekcije sa AI predlozima saigrača. */
  const GRID = 'section[data-section="suggested"] .tm-solo-grid';

  it("SWD-TS-01: tab 'Predloženi' prikazuje bar jednu AI predloženu karticu", async () => {
    await clickSafe(driver, '.tm-tab[data-filter="suggested"]');
    await driver.wait(async () => {
      const main = await driver.findElement(By.css("main#tm-main"));
      return (await main.getAttribute("data-filter")) === "suggested";
    }, 10000);

    // Sačekaj da skeleton kartice (aria-busy) zameni bar jedna prava kartica.
    const cards = await driver.wait(
      async () => {
        const real = await driver.findElements(By.css(`${GRID} .card.tm-solo:not([aria-busy])`));
        return real.length > 0 ? real : null;
      },
      20000,
      "Očekivana bar jedna predložena kartica kandidata",
    );
    assert.ok(cards.length >= 1);
  });

  it("SWD-TS-02: kartica kandidata nosi ime, avatar, veštinu i skor komplementarnosti", async () => {
    // Nađi fenjerovu karticu preko stabilnog @handle-a (ne preko UI teksta).
    const handles = await driver.findElements(By.css(`${GRID} .tm-handle`));
    const texts = await Promise.all(handles.map((h) => h.getText()));
    const idx = texts.indexOf(FREE_AGENT_HANDLE);
    assert.notEqual(idx, -1, `${FREE_AGENT_HANDLE} nije među predlozima: ${texts.join(", ")}`);

    const cards = await driver.findElements(By.css(`${GRID} .card.tm-solo:not([aria-busy])`));
    const card = cards[idx];

    const name = await card.findElement(By.css(".tm-solo-name")).getText();
    assert.ok(name.trim().length > 0, "kartica mora prikazati ime kandidata");
    assert.ok(
      (await card.findElements(By.css(".tm-av .orb-art"))).length > 0,
      "kartica mora prikazati avatar",
    );
    // Prva veština kandidata (fenjer u seed-u ima Python + Machine Learning);
    // tekst stiže CSS-om kapitalizovan, pa poredimo bez obzira na velika slova.
    const skill = (await card.findElement(By.css(".tm-solo-role")).getText()).toLowerCase();
    assert.ok(["python", "machine learning"].includes(skill), `neočekivana veština: ${skill}`);
    // Skor komplementarnosti iz D03 se prikazuje kao "+N" bedž.
    const score = await card.findElement(By.css(".tm-solo-score")).getText();
    assert.match(score, /^\+\d+$/);
  });
});
