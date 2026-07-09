import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import { buildDriver, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

/**
 * Funkcionalnost: Integrisani kanban modul.
 * Preduslov: prijavljeni član je u bar jednom timu (seed dodaje andrej-a u tim).
 * SWD-KAN-01
 */
describe("Kanban tabla (Selenium WebDriver)", function () {
  let driver;
  before(async () => {
    driver = await buildDriver();
    await login(driver, USERS.member);
  });
  after(async () => driver && (await driver.quit()));

  it("SWD-KAN-01: dodavanje kartice na tablu prikazuje karticu sa unetim naslovom", async function () {
    await open(driver, "/teams");
    await driver.wait(until.elementLocated(By.css("body")), 5000);

    // Na stranici /teams svaki tim ima link ka svojoj kanban tabli.
    const kanbanLinks = await driver.findElements(By.css("a[href*='/kanban']"));
    if (kanbanLinks.length === 0) {
      this.skip(); // Nalog nije član nijednog tima — pokreni `pnpm db:seed`.
    }
    await kanbanLinks[0].click();

    await driver.wait(until.elementLocated(By.css(".kb-add-card-btn")), 10000);
    // Otvori formu za dodavanje kartice u prvoj koloni.
    await driver.findElements(By.css(".kb-add-card-btn")).then((b) => b[0].click());

    const title = `Auto zadatak ${Date.now()}`;
    const input = await driver.wait(until.elementLocated(By.css(".kb-add-card-input")), 5000);
    await input.sendKeys(title);
    // Prvo dugme u akcijama forme je "Dodaj".
    await driver.findElement(By.css(".kb-add-card-actions .btn-primary")).click();

    // Kartica sa našim naslovom se pojavljuje na tabli.
    const card = await driver.wait(
      until.elementLocated(
        By.xpath(`//div[contains(@class,'kb-card-title')][contains(text(),'${title}')]`),
      ),
      10000,
      "Očekivana nova kartica na kanban tabli",
    );
    assert.ok(await card.isDisplayed());
  });
});
