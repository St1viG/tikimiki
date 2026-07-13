import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import { buildDriver, clickSafe, login, open, By, until } from "../helpers/driver.mjs";

/**
 * Funkcionalnost: "Dodaj u kalendar" na detaljnoj strani hakatona.
 * CalendarPopup je data-driven: Google Calendar link i .ics stavka se grade
 * iz stvarnih podataka hakatona (naslov, termini, lokacija). Oslanja se na
 * seed hakaton "ETF HackWeek 2026" (lokacija "Beograd, ETF").
 * SWD-CAL-01, SWD-CAL-02, SWD-CAL-03
 */
describe("Dodaj u kalendar (Selenium WebDriver)", function () {
  let driver;

  before(async () => {
    driver = await buildDriver();
    await login(driver);
    // Do detaljne strane se dolazi klikom na naslov hakatona sa liste.
    await open(driver, "/hackathons");
    const link = await driver.wait(until.elementLocated(By.linkText("ETF HackWeek 2026")), 20000);
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", link);
    await link.click();
    await driver.wait(until.elementLocated(By.css("button.hk-cal-btn")), 20000);
  });
  after(async () => driver && (await driver.quit()));

  /** Dovedi meni u traženo stanje klikom na dugme (aria-expanded ga prati). */
  async function setMenuOpen(want) {
    const btn = await driver.findElement(By.css("button.hk-cal-btn"));
    if (((await btn.getAttribute("aria-expanded")) === "true") !== want) {
      await clickSafe(driver, "button.hk-cal-btn");
    }
  }

  it("SWD-CAL-01: klik na dugme otvara meni sa obe kalendarske stavke", async () => {
    await setMenuOpen(true);

    const menu = await driver.findElement(By.css(".hk-cal-menu"));
    await driver.wait(until.elementIsVisible(menu), 5000, "Očekivan otvoren kalendarski meni");
    assert.equal(
      await driver.findElement(By.css("button.hk-cal-btn")).getAttribute("aria-expanded"),
      "true",
    );
    // Dve stavke: Google Calendar (link) i Apple Calendar .ics (dugme).
    assert.equal((await driver.findElements(By.css(".hk-cal-menu a.hk-cal-item"))).length, 1);
    assert.equal((await driver.findElements(By.css(".hk-cal-menu button.hk-cal-item"))).length, 1);
  });

  it("SWD-CAL-02: Google Calendar link nosi stvarne podatke hakatona", async () => {
    await setMenuOpen(true);

    const href = await driver
      .findElement(By.css(".hk-cal-menu a.hk-cal-item"))
      .getAttribute("href");
    assert.ok(href.startsWith("https://calendar.google.com/calendar/render?"));
    assert.ok(href.includes("action=TEMPLATE"));
    // Naslov, lokacija i termini dolaze iz podataka hakatona (URLSearchParams
    // kodira razmak kao +, a "/" između termina kao %2F).
    assert.ok(href.includes("text=ETF+HackWeek+2026"), `naslov u linku: ${href}`);
    assert.ok(href.includes("location=Beograd%2C+ETF"), `lokacija u linku: ${href}`);
    assert.match(href, /dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/, `termini u linku: ${href}`);
  });

  it("SWD-CAL-03: klik van menija zatvara meni", async () => {
    await setMenuOpen(true);
    const menu = await driver.findElement(By.css(".hk-cal-menu"));
    await driver.wait(until.elementIsVisible(menu), 5000);

    // Klik na status bedž u hero-u — element van menija i van dugmeta.
    await clickSafe(driver, ".hd-status");

    await driver.wait(until.elementIsNotVisible(menu), 5000, "Očekivan zatvoren meni");
    assert.equal(
      await driver.findElement(By.css("button.hk-cal-btn")).getAttribute("aria-expanded"),
      "false",
    );
  });
});
