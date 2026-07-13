import assert from "node:assert/strict";
import { Key } from "selenium-webdriver";
import { after, before, describe, it } from "mocha";
import { buildDriver, clickSafe, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

/**
 * Funkcionalnost: Filteri na stranici pretrage (/search).
 * Skill filter sužava korisnike, location/type filteri sužavaju hakatone;
 * izmenjeni filteri se primenjuju tek klikom na "Traži" (search-submit).
 * Oslanja se na `pnpm db:seed` podatke: fenjer je jedini sa veštinom
 * "Machine Learning", a od dva hakatona samo "Garaža Hackathon 2026" je u
 * Novom Sadu i oba su tipa "physical" (pa "virtual" nema rezultata).
 * SWD-SRCH-01, SWD-SRCH-02, SWD-SRCH-03
 */
describe("Filteri pretrage (Selenium WebDriver)", function () {
  let driver;
  before(async () => {
    driver = await buildDriver();
    await login(driver, USERS.member);
  });
  after(async () => driver && (await driver.quit()));

  /** Otvori /search i sačekaj da se stranica renderuje (query polje). */
  async function openSearch() {
    await open(driver, "/search");
    await driver.wait(until.elementLocated(By.css("input.search-input")), 20000);
  }

  /** Tekstovi svih prikazanih rezultata na aktivnom tabu. */
  async function visibleLabels() {
    const els = await driver.findElements(By.css(".search-list .search-label"));
    return Promise.all(els.map((el) => el.getText()));
  }

  /** Čekaj dok se među rezultatima ne pojavi `expected`, pa vrati sve labele. */
  function waitForLabel(expected) {
    return driver.wait(
      async () => {
        const labels = await visibleLabels();
        return labels.includes(expected) ? labels : null;
      },
      15000,
      `Očekivan rezultat "${expected}" u listi pretrage`,
    );
  }

  it("SWD-SRCH-01: skill filter sužava korisnike i primenjuje se tek na Traži", async () => {
    await openSearch();

    // Dodaj veštinu kao chip (Enter u skill polju) — pretraga još ne kreće.
    const skillInput = await driver.findElement(By.css(".search-skill-input"));
    await skillInput.sendKeys("Machine Learning", Key.RETURN);
    await driver.wait(until.elementLocated(By.css(".search-chip")), 5000);

    // Izmenjen (neprimenjen) filter mora da prikaže hint uz dugme Traži.
    const hints = await driver.findElements(By.css(".search-apply-hint"));
    assert.ok(hints.length > 0, "Očekivan hint da filteri čekaju primenu");

    await clickSafe(driver, "button.search-submit");

    // Samo fenjer ima Machine Learning u seed-u; mara (UI/UX) ne sme da prođe.
    const labels = await waitForLabel("fenjer");
    assert.ok(!labels.includes("mara"), "Korisnik bez tražene veštine ne sme biti u rezultatima");

    // Posle primene filtera hint nestaje.
    assert.equal((await driver.findElements(By.css(".search-apply-hint"))).length, 0);
  });

  it("SWD-SRCH-02: location filter na tabu hakatona vraća samo hakatone iz te lokacije", async () => {
    await openSearch();

    // Tabovi su uvek u redosledu korisnici / organizacije / hakatoni.
    await clickSafe(driver, ".search-tabs .search-tab:nth-of-type(3)");

    // Location polje postoji samo na tabu hakatona.
    const locationInput = await driver.wait(
      until.elementLocated(By.css("input.search-text")),
      5000,
    );
    await locationInput.sendKeys("Novi Sad");
    await clickSafe(driver, "button.search-submit");

    const labels = await waitForLabel("Garaža Hackathon 2026");
    assert.ok(
      !labels.includes("ETF HackWeek 2026"),
      "Hakaton iz druge lokacije ne sme biti u rezultatima",
    );
  });

  it("SWD-SRCH-03: type filter bez poklapanja vraća praznu listu rezultata", async () => {
    await openSearch();
    await clickSafe(driver, ".search-tabs .search-tab:nth-of-type(3)");

    // Oba seed hakatona su "physical", pa "virtual" ne sme ništa da vrati.
    await driver.wait(until.elementLocated(By.css("select.search-select")), 5000);
    await clickSafe(driver, 'select.search-select option[value="virtual"]');
    await clickSafe(driver, "button.search-submit");

    // Sačekaj da pretraga završi (spinner nestane), pa proveri da nema liste:
    // brojač na tabu hakatona je 0, prikazan je samo statusni red.
    await driver.wait(
      async () => {
        const spinners = await driver.findElements(By.css(".search-spinner"));
        const counts = await driver.findElements(
          By.css(".search-tabs .search-tab:nth-of-type(3) .search-tab-count"),
        );
        if (spinners.length > 0 || counts.length === 0) return false;
        return (await counts[0].getText()) === "0";
      },
      15000,
      "Očekivano 0 hakatona za tip bez poklapanja",
    );
    assert.equal((await driver.findElements(By.css(".search-list"))).length, 0);
    assert.ok((await driver.findElements(By.css(".search-status"))).length > 0);
  });
});
