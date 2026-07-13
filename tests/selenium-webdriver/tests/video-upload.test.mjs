import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "mocha";
import { buildDriver, clickSafe, login, open, By, until } from "../helpers/driver.mjs";
import { USERS } from "../helpers/config.mjs";

/**
 * Funkcionalnost: Otpremanje video prezentacije projekta (S06–S08).
 * Iz ProjectPopup-a na /teams tim otprema MP4/WebM na POST /uploads/video;
 * backend proverava stvarni sadržaj fajla (magic bytes), pa fajl koji je samo
 * preimenovan u .mp4 vraća 400 koji UI prikaže kao grešku u popupu, dok
 * ispravan MP4 upiše "/uploads/…" putanju u polje linka i prikaže plejer.
 * Preduslov: prijavljeni član je u timu čiji projekat nije u pregledu/ocenjen
 * (seed: andrej u timu "digitalci", projekat u statusu submitted).
 * SWD-VUP-01, SWD-VUP-02
 */
describe("Video upload projekta (Selenium WebDriver)", function () {
  let driver;
  let fixtureDir;

  /** Lažni "video": tekstualni sadržaj preimenovan u .mp4 — pada na magic bytes. */
  let fakeVideoPath;
  /** Minimalan pravi MP4: "ftyp" marker na ofsetu 4 je ono što backend traži. */
  let realVideoPath;

  before(async function () {
    fixtureDir = mkdtempSync(join(tmpdir(), "tikimiki-vup-"));
    fakeVideoPath = join(fixtureDir, "nije-video.mp4");
    writeFileSync(fakeVideoPath, "ovo je običan tekst, a ne video");
    realVideoPath = join(fixtureDir, "demo.mp4");
    writeFileSync(
      realVideoPath,
      Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from("ftypisom", "ascii"),
        Buffer.from([0x00, 0x00, 0x02, 0x00]),
        Buffer.from("isomiso2", "ascii"),
      ]),
    );

    driver = await buildDriver();
    await login(driver, USERS.member);
    await open(driver, "/teams");

    // Sačekaj pravu karticu tima (skeleton nema .tm-tc-name) pa otvori popup
    // projekta — jedino dugme (ne link) među akcijama kartice.
    await driver.wait(
      until.elementLocated(By.css('section[data-section="mine"] .tm-tc-name')),
      20000,
      "Očekivana bar jedna kartica tima — pokreni `pnpm db:seed`",
    );
    await clickSafe(driver, 'section[data-section="mine"] .tm-tc-actions button.btn-ghost');
    await driver.wait(until.elementLocated(By.css("#pp-video")), 15000);

    // Ako projekat nije u statusu koji dozvoljava izmene, nema upload dugmeta.
    const uploadInputs = await driver.findElements(By.css('.am-dialog input[type="file"]'));
    if (uploadInputs.length === 0) {
      this.skip(); // Projekat je u pregledu/ocenjen — upload nije dostupan.
    }
  });

  after(async () => {
    if (driver) await driver.quit();
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  });

  /** Skriveni input[type=file] mora prvo da se otkrije da bi sendKeys prošao. */
  async function pickFile(path) {
    const input = await driver.findElement(By.css('.am-dialog input[type="file"]'));
    await driver.executeScript("arguments[0].removeAttribute('hidden');", input);
    await input.sendKeys(path);
  }

  it("SWD-VUP-01: fajl preimenovan u .mp4 prikazuje grešku backenda, bez plejera", async () => {
    await pickFile(fakeVideoPath);

    const err = await driver.wait(
      until.elementLocated(By.css(".am-dialog .am-err")),
      15000,
      "Očekivana poruka o grešci u popupu projekta",
    );
    assert.equal(await err.getText(), "Only MP4 or WebM video files are allowed");

    // Polje linka ostaje prazno i plejer se ne prikazuje.
    const urlValue = await driver.findElement(By.css("#pp-video")).getAttribute("value");
    assert.equal(urlValue, "");
    const players = await driver.findElements(By.css("video.pp-video-player"));
    assert.equal(players.length, 0);
  });

  it("SWD-VUP-02: ispravan MP4 upisuje /uploads/ putanju i prikazuje plejer", async () => {
    await pickFile(realVideoPath);

    // Upload je gotov kad polje linka dobije vraćenu putanju.
    await driver.wait(
      async () => {
        const value = await driver.findElement(By.css("#pp-video")).getAttribute("value");
        return value.startsWith("/uploads/");
      },
      15000,
      "Očekivana /uploads/ putanja u polju video linka",
    );
    const urlValue = await driver.findElement(By.css("#pp-video")).getAttribute("value");
    assert.match(urlValue, /^\/uploads\/.+-video-\d+\.mp4$/);

    // Plejer se pojavljuje sa istom putanjom, a greška iz prethodnog pokušaja nestaje.
    const player = await driver.wait(
      until.elementLocated(By.css("video.pp-video-player")),
      10000,
      "Očekivan video plejer ispod polja linka",
    );
    assert.ok((await player.getAttribute("src")).includes(urlValue));
    const errors = await driver.findElements(By.css(".am-dialog .am-err"));
    assert.equal(errors.length, 0);
  });
});
