import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import { buildDriver, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

/**
 * Funkcionalnost: Dopisivanje i grupna ćaskanja.
 * Preduslov: prijavljeni član ima bar jednu konverzaciju (seed ih kreira).
 * SWD-MSG-01
 */
describe("Dopisivanje (Selenium WebDriver)", function () {
  let driver;
  before(async () => {
    driver = await buildDriver();
    await login(driver, USERS.member);
  });
  after(async () => driver && (await driver.quit()));

  it("SWD-MSG-01: slanje poruke u konverzaciji prikazuje poruku u niti", async function () {
    await open(driver, "/messages");
    await driver.wait(until.elementLocated(By.css("body")), 5000);

    // Svaka konverzacija u listi je <button class="post">.
    const convos = await driver.findElements(By.css("button.post"));
    if (convos.length === 0) {
      this.skip(); // Nema konverzacija — pokreni `pnpm db:seed`.
    }
    await convos[0].click();

    // Composer je <input class="field"> unutar .composer.
    const composer = await driver.wait(
      until.elementLocated(By.css(".composer input.field")),
      10000,
    );
    const text = `Selenium poruka ${Date.now()}`;
    await composer.sendKeys(text);
    // Slanje: klik na dugme "Pošalji" (.btn-violet) pored composer-a.
    await driver.findElement(By.css(".composer button.btn-violet")).click();

    // Poslata poruka se pojavljuje u niti.
    const bubble = await driver.wait(
      until.elementLocated(By.xpath(`//*[contains(text(),'${text}')]`)),
      10000,
      "Očekivana poslata poruka u niti",
    );
    assert.ok(await bubble.isDisplayed());
  });
});
