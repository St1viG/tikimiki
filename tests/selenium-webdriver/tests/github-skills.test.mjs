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

/** Korisnik čiji profil gledamo i veština koju setup verifikuje. */
const PROFILE_EMAIL = USERS.member2.identifier; // mohammed@tikimiki.dev
const PROFILE_USERNAME = "mohammed";
const VERIFIED_SKILL = "React";
const UNVERIFIED_SKILL = "UI/UX";

/**
 * Funkcionalnost: bedž „verifikovano preko GitHub-a" uz veštinu na profilu
 * (N03 upisuje `member_skills.verified`, N05 renderuje bedž u
 * UserProfileClient). Backend `verifiedSkillNames` je podskup veština sa
 * verified=true, a UI uz takvu veštinu crta <span title=…> sa check ikonom.
 * Jedini drugi način da veština postane verifikovana je pravi GitHub OAuth +
 * sync, pa setup upisuje verified=true direktno u bazu (kao github-sync
 * test) i u after() vraća zatečenu vrednost.
 * SWD-GHS-11, SWD-GHS-12
 */
describe("Verifikovane GitHub veštine na profilu (Selenium WebDriver)", function () {
  let driver;
  let db;
  /** Zatečena vrednost verified flaga, za restore u after(). */
  let originalVerified = null;

  before(async () => {
    db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();
    const { rows } = await db.query(
      `select ms.verified
         from member_skills ms
         join users u on u.user_id = ms.user_id
         join skills s on s.skill_id = ms.skill_id
        where u.email = $1 and s.name = $2`,
      [PROFILE_EMAIL, VERIFIED_SKILL],
    );
    assert.equal(rows.length, 1, `seed nema veštinu "${VERIFIED_SKILL}" za ${PROFILE_EMAIL}`);
    originalVerified = rows[0].verified;
    await db.query(
      `update member_skills ms
          set verified = true
         from users u, skills s
        where ms.user_id = u.user_id and ms.skill_id = s.skill_id
          and u.email = $1 and s.name = $2`,
      [PROFILE_EMAIL, VERIFIED_SKILL],
    );

    driver = await buildDriver();
    await login(driver, USERS.member2);
    await open(driver, `/u/${PROFILE_USERNAME}`);
    // Sačekaj da se profil učita — red veština u zaglavlju profila.
    await driver.wait(until.elementLocated(By.css(".tag.tag-v")), 20000);
  });

  after(async () => {
    if (driver) await driver.quit();
    if (db) {
      // Vrati zatečenu vrednost flaga (seed drži sve veštine neverifikovanim).
      if (originalVerified !== null) {
        await db.query(
          `update member_skills ms
              set verified = $3
             from users u, skills s
            where ms.user_id = u.user_id and ms.skill_id = s.skill_id
              and u.email = $1 and s.name = $2`,
          [PROFILE_EMAIL, VERIFIED_SKILL, originalVerified],
        );
      }
      await db.end();
    }
  });

  /** Nađi tag veštine po (case-insensitive) nazivu i vrati WebElement. */
  async function skillTag(name) {
    const tags = await driver.findElements(By.css(".tag.tag-v"));
    for (const tag of tags) {
      const text = (await tag.getText()).trim().toLowerCase();
      if (text.startsWith(name.toLowerCase())) return tag;
    }
    return null;
  }

  it("SWD-GHS-11: verifikovana veština nosi „verified” bedž (check ikona sa title atributom)", async () => {
    const tag = await driver.wait(
      async () => (await skillTag(VERIFIED_SKILL)) ?? null,
      15000,
      `veština "${VERIFIED_SKILL}" se ne prikazuje na profilu`,
    );
    // Bedž je ugnježden <span title=…> sa check ikonom — stabilan selektor
    // preko title atributa (postoji samo uz verifikovane veštine).
    const badges = await tag.findElements(By.css("span[title]"));
    assert.equal(badges.length, 1, "verifikovana veština mora imati tačno jedan bedž");
    const title = await badges[0].getAttribute("title");
    assert.match(title.toLowerCase(), /verif/i, `title bedža ne pominje verifikaciju: ${title}`);
    assert.ok(
      (await badges[0].findElements(By.css("svg, .ic-sm"))).length > 0,
      "bedž mora sadržati check ikonu",
    );
  });

  it("SWD-GHS-12: neverifikovana veština nema bedž", async () => {
    const tag = await skillTag(UNVERIFIED_SKILL);
    assert.ok(tag, `veština "${UNVERIFIED_SKILL}" se ne prikazuje na profilu`);
    assert.equal(
      (await tag.findElements(By.css("span[title]"))).length,
      0,
      "neverifikovana veština ne sme imati bedž",
    );
  });
});
