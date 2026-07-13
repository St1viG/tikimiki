import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import pg from "pg";
import { buildDriver, clickSafe, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://tikimiki:tikimiki@localhost:5432/tikimiki";

/**
 * Funkcionalnost: Ručna sinhronizacija GitHub veština (N04) iz podešavanja.
 * "Sinhronizuj GitHub" dugme postoji samo za korisnika sa povezanim GitHub
 * nalogom (users.github_id), a POST /users/me/github/sync bez sačuvanog
 * access tokena vraća 400 "GitHub nije povezan" koji UI prikaže kao toast.
 * Setup upisuje github_id/github_username test korisniku (member2) direktno
 * u bazu — jedini drugi način je pravi GitHub OAuth — i briše ih u after().
 * SWD-GHS-01, SWD-GHS-02
 */
describe("GitHub skills sync (Selenium WebDriver)", function () {
  let driver;
  let db;

  before(async () => {
    db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();
    await db.query("UPDATE users SET github_id = $1, github_username = $2 WHERE email = $3", [
      "swd-ghs-test-id",
      "digitalci-test",
      USERS.member2.identifier,
    ]);

    driver = await buildDriver();
    await login(driver, USERS.member2);
    await open(driver, "/settings");
    await driver.wait(until.elementLocated(By.css('.set-tab[data-panel="integracije"]')), 20000);
    await clickSafe(driver, '.set-tab[data-panel="integracije"]');
  });

  after(async () => {
    if (driver) await driver.quit();
    if (db) {
      await db.query("UPDATE users SET github_id = NULL, github_username = NULL WHERE email = $1", [
        USERS.member2.identifier,
      ]);
      await db.end();
    }
  });

  /** GitHub je prva integraciona kartica u panelu. */
  const githubCard = () =>
    driver.findElement(By.css("#panel-integracije .ep-int-card:first-child"));

  it("SWD-GHS-01: povezan nalog prikazuje GitHub username i sync dugme", async () => {
    // Kartica se popuni kad stigne GET /settings/integrations.
    await driver.wait(
      async () => (await (await githubCard()).getText()).includes("digitalci-test"),
      15000,
      "Očekivan GitHub username iz integracija na kartici",
    );

    const name = await (await githubCard()).findElement(By.css(".ep-int-name")).getText();
    assert.equal(name, "GitHub · digitalci-test");
    // Povezan nalog ima dva dugmeta: Sinhronizuj GitHub + Diskonektuj.
    const buttons = await (await githubCard()).findElements(By.css("button.ep-int-btn"));
    assert.equal(buttons.length, 2);
  });

  it("SWD-GHS-02: sync bez sačuvanog tokena prikazuje grešku backenda u toastu", async () => {
    const [syncBtn] = await (await githubCard()).findElements(By.css("button.ep-int-btn"));
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", syncBtn);
    await syncBtn.click();

    // Toast ulazi kroz animaciju, pa getText() ume da vrati "" dok se
    // pojavljuje — čekamo dok tekst ne postane dostupan.
    const text = await driver.wait(
      async () => {
        const spans = await driver.findElements(By.css(".set-toast.visible span"));
        if (spans.length === 0) return null;
        const value = (await spans[0].getText()).trim();
        return value || null;
      },
      10000,
      "Očekivan toast sa tekstom nakon pokušaja sinhronizacije",
    );
    assert.equal(text, "GitHub nije povezan");
    const toast = await driver.findElement(By.css(".set-toast.visible"));
    assert.match(await toast.getAttribute("class"), /\berr\b/);
  });
});
