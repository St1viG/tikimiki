import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "mocha";
import {
  buildDriver,
  open,
  submitAuthWithCaptcha,
  By,
  until,
} from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

/**
 * Funkcionalnost: Prijavljivanje (autentifikacija) — preduslov za sve ostalo.
 * Login stranica: input[name=identifier], input[name=password], button.au-submit,
 * uz obaveznu captcha (.au-captcha-check) koja se pojavi posle prvog submita.
 * SWD-AUTH-01, SWD-AUTH-02
 */
describe("Prijava na sistem (Selenium WebDriver)", function () {
  let driver;
  before(async () => (driver = await buildDriver()));
  after(async () => driver && (await driver.quit()));

  // Svaki test kreće izlogovan (nezavisnost od redosleda): učitaj domen,
  // obriši kolačiće, pa ponovo otvori čist /login.
  beforeEach(async () => {
    await open(driver, "/login");
    await driver.manage().deleteAllCookies();
    await open(driver, "/login");
  });

  it("SWD-AUTH-01: ispravni kredencijali preusmeravaju sa /login", async () => {
    await open(driver, "/login");
    await driver.wait(until.elementLocated(By.css('input[name="identifier"]')), 20000);
    await driver.findElement(By.css('input[name="identifier"]')).sendKeys(USERS.member.identifier);
    await driver.findElement(By.css('input[name="password"]')).sendKeys(USERS.member.password);
    await submitAuthWithCaptcha(driver);

    await driver.wait(
      async () => !(await driver.getCurrentUrl()).includes("/login"),
      15000,
      "Očekivano preusmerenje sa /login nakon uspešne prijave",
    );
    assert.ok(!(await driver.getCurrentUrl()).includes("/login"));
  });

  it("SWD-AUTH-02: pogrešna lozinka prikazuje poruku o grešci", async () => {
    await open(driver, "/login");
    await driver.wait(until.elementLocated(By.css('input[name="identifier"]')), 20000);
    await driver.findElement(By.css('input[name="identifier"]')).sendKeys(USERS.member.identifier);
    await driver.findElement(By.css('input[name="password"]')).sendKeys("pogresna-lozinka");
    await submitAuthWithCaptcha(driver);

    const errorEl = await driver.wait(
      until.elementLocated(By.css(".au-alert")),
      10000,
      "Očekivana poruka o grešci za pogrešne kredencijale",
    );
    assert.ok(await errorEl.isDisplayed());
    assert.ok((await driver.getCurrentUrl()).includes("/login"));
  });
});
