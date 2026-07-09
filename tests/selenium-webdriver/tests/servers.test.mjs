import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import { buildDriver, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

/**
 * Funkcionalnost: Serveri za komunikaciju (cohor).
 * SWD-SRV-01
 */
describe("Serveri za komunikaciju (Selenium WebDriver)", function () {
  let driver;
  before(async () => {
    driver = await buildDriver();
    await login(driver, USERS.member);
  });
  after(async () => driver && (await driver.quit()));

  it("SWD-SRV-01: /cohor učitava radni prostor sa trakom servera", async () => {
    await open(driver, "/cohor");

    // Root kontejner cohor aplikacije mora da se učita.
    const app = await driver.wait(
      until.elementLocated(By.css(".cohor-app")),
      10000,
      "Očekivan .cohor-app kontejner",
    );
    assert.ok(await app.isDisplayed());

    // Traka sa serverima (tabovi) mora postojati.
    const tabs = await driver.wait(until.elementLocated(By.css(".cohor-tabs")), 10000);
    assert.ok(await tabs.isDisplayed());
    assert.ok((await driver.getCurrentUrl()).includes("/cohor"));
  });
});
