/**
 * Autor: Stevan Gnjato (2023/0141)
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import pg from "pg";
import { buildDriver, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://tikimiki:tikimiki@localhost:5432/tikimiki";

/** Kandidat čiju prijavu organizator odobrava (u seed-u je pending, bez tima). */
const APPLICANT_EMAIL = "fenjer@tikimiki.dev";
const APPLICANT_HANDLE = "@fenjer";
const HACKATHON_TITLE = "ETF HackWeek 2026";

/**
 * Funkcionalnost: odobravanje prijave kandidata (D07–D09) na organizatorskoj
 * stranici /applications. Klik na zaglavlje kartice kandidata otvara
 * CandidatePopup, dugme .btn-approve zove PATCH /applications/:id/approve,
 * a kartica u listi menja data-status u "approved". Oslanja se na seed:
 * org@tikimiki.dev vodi "ETF HackWeek 2026" (podrazumevano izabran hakaton),
 * fenjer ima pending prijavu — setup je normalizuje direktno u bazi i u
 * after() vraća zatečeno stanje.
 * SWD-APR-01, SWD-APR-02
 */
describe("Odobravanje prijava (Selenium WebDriver)", function () {
  let driver;
  let db;
  /** Zatečena fenjerova prijava, za restore u after(). */
  let original = null;

  before(async () => {
    db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();

    // Prijava koju test odobrava mora krenuti iz pending stanja.
    const { rows } = await db.query(
      `select a.application_id, a.status, a.team_id, a.reviewed_by, a.reviewed_at,
              a.rejection_reason
         from applications a
         join users u on u.user_id = a.user_id
         join hackathons h on h.hackathon_id = a.hackathon_id
        where u.email = $1 and h.title = $2 and a.deleted_at is null`,
      [APPLICANT_EMAIL, HACKATHON_TITLE],
    );
    assert.equal(rows.length, 1, `seed nema prijavu za ${APPLICANT_EMAIL}`);
    original = rows[0];
    await db.query(
      `update applications
          set status = 'pending', team_id = null, reviewed_by = null,
              reviewed_at = null, rejection_reason = null
        where application_id = $1`,
      [original.application_id],
    );

    driver = await buildDriver();
    await login(driver, USERS.organization);
    await open(driver, "/applications");
  });

  after(async () => {
    if (driver) await driver.quit();
    if (db) {
      if (original) {
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

  /** XPath kartice kandidata: .app-card čiji @handle odgovara kandidatu. */
  const cardXpath = `//div[contains(@class,"app-card")][.//div[contains(@class,"app-sub")][contains(.,"${APPLICANT_HANDLE}")]]`;

  it("SWD-APR-01: organizator odobrava pending prijavu iz popup-a kandidata", async () => {
    // Lista prijava izabranog hakatona (podrazumevano prvi organizatorov).
    const card = await driver.wait(until.elementLocated(By.xpath(cardXpath)), 20000);
    assert.equal(await card.getAttribute("data-status"), "pending");

    // Zaglavlje kartice otvara CandidatePopup. Nativni WebDriver klikovi na
    // ovoj stranici tiho propadaju u headless Chrome-u (mousedown/mouseup se
    // ne sklope u click, bez greške), pa klik dispatch-ujemo direktno na
    // element. Proveru radimo PRE klika — ponovni klik preko već otvorenog
    // popup-a pogodio bi overlay i zatvorio ga (klik na overlay je "close").
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", card);
    const popupOpen = async () =>
      (await driver.findElements(By.css("button.btn-approve"))).length > 0;
    await driver.wait(
      async () => {
        if (await popupOpen()) return true;
        const el = await driver.findElement(By.xpath(cardXpath));
        const header = await el.findElement(By.css(".app-header"));
        await driver.executeScript("arguments[0].click();", header);
        return popupOpen();
      },
      20000,
      "CandidatePopup se nije otvorio klikom na karticu",
    );

    // Isti razlog: klik na dugme za odobravanje ide kroz JS dispatch.
    const approveBtn = await driver.findElement(By.css("button.btn-approve"));
    await driver.executeScript("arguments[0].click();", approveBtn);

    // Kartica u listi mora preći u approved (optimistički + PATCH …/approve).
    await driver.wait(
      async () => {
        const el = await driver.findElement(By.xpath(cardXpath));
        return (await el.getAttribute("data-status")) === "approved";
      },
      15000,
      "kartica prijave nije prešla u status approved",
    );
  });

  it("SWD-APR-02: odobrenje je upisano u bazu (status approved + reviewed_by)", async () => {
    // PATCH ide asinhrono posle optimističkog UI update-a — sačekaj upis.
    let row;
    await driver.wait(
      async () => {
        const res = await db.query(
          "select status, reviewed_by from applications where application_id = $1",
          [original.application_id],
        );
        row = res.rows[0];
        return row.status === "approved";
      },
      15000,
      "backend nije upisao approved status u bazu",
    );
    assert.equal(row.status, "approved");
    assert.ok(row.reviewed_by, "reviewed_by mora biti postavljen na organizatora");
  });
});
