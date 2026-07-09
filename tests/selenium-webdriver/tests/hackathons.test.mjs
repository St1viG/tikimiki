import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import {
  buildDriver,
  clickSafe,
  login,
  open,
  setReactValue,
  By,
  until,
} from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

/**
 * Funkcionalnost: Kreiranje i upravljanje hakatonima.
 * Kreira ih organizatorski nalog (org@tikimiki.dev).
 * SWD-HACK-01, SWD-HACK-02
 */
describe("Kreiranje hakatona (Selenium WebDriver)", function () {
  let driver;
  before(async () => {
    driver = await buildDriver();
    await login(driver, USERS.organization);
  });
  after(async () => driver && (await driver.quit()));

  it("SWD-HACK-01: prazna forma se ne šalje i prikazuje validacione greške", async () => {
    await open(driver, "/hackathons/new");
    await driver.wait(until.elementLocated(By.id("nh-title")), 10000);
    await clickSafe(driver, "button.nh-submit");

    // Ostajemo na /new i vidimo bar jednu inline grešku (.nh-err).
    const err = await driver.wait(
      until.elementLocated(By.css(".nh-err")),
      5000,
      "Očekivane validacione poruke pri praznoj formi",
    );
    assert.ok(await err.isDisplayed());
    assert.ok((await driver.getCurrentUrl()).includes("/hackathons/new"));
  });

  it("SWD-HACK-02: popunjena forma kreira hakaton i preusmerava sa /new", async () => {
    await open(driver, "/hackathons/new");
    await driver.wait(until.elementLocated(By.id("nh-title")), 10000);

    // Kontrolisana React polja punimo preko setReactValue (sendKeys ume da se
    // "izgubi" pre hidratacije). Tip ostavljamo na podrazumevanom "physical" i
    // popunjavamo lokaciju + koordinate (obavezne za taj tip).
    const stamp = Date.now();
    await setReactValue(driver, "#nh-title", `Test Hakaton ${stamp}`);
    await setReactValue(
      driver,
      "#nh-desc",
      "Automatski kreiran hakaton (Selenium WebDriver).",
    );
    await setReactValue(driver, "#nh-loc", "Beograd");
    await setReactValue(driver, "#nh-lat", "44.8125");
    await setReactValue(driver, "#nh-lng", "20.4612");

    // datetime-local raspored (rok < početak < završetak).
    await setReactValue(driver, "#nh-start", "2030-01-10T09:00");
    await setReactValue(driver, "#nh-end", "2030-01-12T18:00");
    await setReactValue(driver, "#nh-reg", "2030-01-05T23:59");

    // Veličina tima.
    await setReactValue(driver, "#nh-min", "1");
    await setReactValue(driver, "#nh-max", "4");

    await clickSafe(driver, "button.nh-submit");

    await driver.wait(
      async () => !(await driver.getCurrentUrl()).includes("/hackathons/new"),
      15000,
      "Očekivano preusmerenje sa /new nakon uspešnog kreiranja",
    );
    assert.ok(!(await driver.getCurrentUrl()).includes("/hackathons/new"));
  });
});
