/**
 * Selenium WebDriver E2E test for the organizer's applicant-review page.
 *
 * Flow: backend/src/applications/applications.service.ts#listForHackathon
 * (server-side skill/GitHub/status filtering) backs the applicant list
 * rendered by ApplicantsReview in frontend/src/app/applications/ApplicationsClient.tsx,
 * reached by an organizer from frontend/src/app/hackathons/manage/ManageClient.tsx
 * ("Applications" link on their own hackathon's row).
 *
 * The page has no native <select> for filtering by skill (that's a debounced
 * free-text input) — the only native <select> that narrows the same
 * applicant list is the "GitHub" filter (Anyone / Verified skills / No
 * verified skills), so that's what this test drives, per explicit product
 * decision: selecting "Verified skills" must never show MORE applicants
 * than "Anyone" did.
 *
 * Run:   pnpm --filter frontend test:e2e
 * Env:
 *   BASE_URL   — app origin (default http://localhost:3000)
 *   HEADED=1   — run with a visible browser window (default: headless)
 *   CHROME_BIN — explicit path to a Chrome/Chromium binary (optional;
 *                auto-detected otherwise — see resolveChromeBinary below)
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Builder, By, until, WebDriver, WebElement } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import { Select } from "selenium-webdriver/lib/select";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const HEADED = process.env.HEADED === "1";
const WAIT_MS = 15000;

// Seeded organization account (backend/src/db/seed.ts) — owns "ETF HackWeek
// 2026", which has real, varied seeded applicants.
const ORG_EMAIL = "org@tikimiki.dev";
const ORG_PASSWORD = "password123";
const HACKATHON_TITLE = "ETF HackWeek 2026";

const ALL_TAB_LABELS = ["All", "Sve"];
const APPLICATIONS_LINK_LABELS = ["Applications", "Prijave"];
const GITHUB_VERIFIED_OPTION_LABELS = ["Verified skills", "Verifikovane veštine"];

/**
 * No system Chrome is assumed to be pre-installed. Prefer an explicit
 * CHROME_BIN override, then common system install paths, then fall back to a
 * Playwright-managed Chromium (a real "Chrome for Testing" build) if one is
 * already cached locally — so the suite still runs standalone.
 */
function resolveChromeBinary(): string | undefined {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;

  const systemCandidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of systemCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const playwrightCacheDir = path.join(os.homedir(), ".cache", "ms-playwright");
  if (!fs.existsSync(playwrightCacheDir)) return undefined;
  const chromiumDirs = fs
    .readdirSync(playwrightCacheDir)
    .filter((entry) => entry.startsWith("chromium-"));
  for (const dir of chromiumDirs) {
    const binary = path.join(playwrightCacheDir, dir, "chrome-linux64", "chrome");
    if (fs.existsSync(binary)) return binary;
  }
  return undefined;
}

async function buildDriver(): Promise<WebDriver> {
  const options = new chrome.Options();
  if (!HEADED) options.addArguments("--headless=new");
  options.addArguments("--window-size=1400,1000", "--no-sandbox", "--disable-dev-shm-usage");

  const binary = resolveChromeBinary();
  if (binary) options.setChromeBinaryPath(binary);

  return new Builder().forBrowser("chrome").setChromeOptions(options).build();
}

/**
 * WebDriver's native element.click() (and the Actions API) do not reliably
 * trigger React's event delegation for plain <button>/<a> elements in
 * headless Chrome — verified empirically against this app. Dispatch the
 * full pointer/mouse event sequence a real click produces instead.
 */
async function robustClick(driver: WebDriver, element: WebElement): Promise<void> {
  await driver.executeScript(
    `const el = arguments[0];
     const rect = el.getBoundingClientRect();
     const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };
     for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
       el.dispatchEvent(new MouseEvent(type, opts));
     }`,
    element,
  );
}

/** XPath for an element whose visible text matches any of `labels`. */
function textXPath(tag: string, labels: string[]): string {
  const cond = labels.map((label) => `contains(., "${label}")`).join(" or ");
  return `//${tag}[${cond}]`;
}

async function login(driver: WebDriver): Promise<void> {
  await driver.get(`${BASE_URL}/login`);

  const identifier = await driver.wait(
    until.elementLocated(By.css('input[name="identifier"]')),
    WAIT_MS,
    "Identifier field did not appear",
  );
  await identifier.sendKeys(ORG_EMAIL);
  await driver.findElement(By.css('input[name="password"]')).sendKeys(ORG_PASSWORD);

  // The captcha checkbox only renders once both fields above are filled.
  const captcha = await driver.wait(
    until.elementLocated(By.css('[role="checkbox"][aria-label]')),
    WAIT_MS,
    "Captcha checkbox did not appear",
  );
  await driver.wait(until.elementIsVisible(captcha), WAIT_MS);
  await robustClick(driver, captcha);

  await robustClick(driver, await driver.findElement(By.css('button[type="submit"]')));

  // Login redirects to "/" on success — wait for the URL to leave /login.
  await driver.wait(async () => !(await driver.getCurrentUrl()).includes("/login"), WAIT_MS);
}

/** Locates the "Applications" link on the given hackathon's row in /hackathons/manage. */
function applicationsLinkXPath(hackathonTitle: string): string {
  return (
    `//div[contains(@class,"hk-apply-row")]` +
    `[.//*[contains(text(),"${hackathonTitle}")]]` +
    `//a[${APPLICATIONS_LINK_LABELS.map((label) => `contains(., "${label}")`).join(" or ")}]`
  );
}

/** True once no applicant-card skeleton (aria-busy) is present, i.e. the list has finished loading. */
async function listNotLoading(driver: WebDriver): Promise<boolean> {
  const skeletons = await driver.findElements(By.css('.apps-list [aria-busy="true"]'));
  return skeletons.length === 0;
}

async function visibleApplicantCount(driver: WebDriver): Promise<number> {
  const cards = await driver.findElements(By.css(".apps-list > div[data-status]"));
  const visibility = await Promise.all(cards.map((card) => card.isDisplayed()));
  return visibility.filter(Boolean).length;
}

describe("Applicant filters (organizer applications page)", () => {
  it(
    "never shows more applicants after narrowing by the GitHub-verified filter than before",
    async () => {
      const driver: WebDriver = await buildDriver();
      try {
        await login(driver);

        await driver.get(`${BASE_URL}/hackathons/manage`);
        const applicationsLink = await driver.wait(
          until.elementLocated(By.xpath(applicationsLinkXPath(HACKATHON_TITLE))),
          WAIT_MS,
          `"${HACKATHON_TITLE}" row with an Applications link did not appear`,
        );
        await robustClick(driver, applicationsLink);

        // Explicit wait for the applicant list to load — no fixed sleep.
        await driver.wait(
          until.elementLocated(By.css(".apps-list")),
          WAIT_MS,
          "Applicant list container did not appear",
        );
        await driver.wait(
          () => listNotLoading(driver),
          WAIT_MS,
          "Applicant list never finished loading",
        );

        // Switch to the "All" status tab (role="tab") so the baseline count
        // reflects every applicant, not just the default "pending" subset.
        const allTab = await driver.wait(
          until.elementLocated(By.xpath(textXPath('button[@role="tab"]', ALL_TAB_LABELS))),
          WAIT_MS,
          '"All" tab not found',
        );
        await robustClick(driver, allTab);
        await driver.wait(
          async () => (await allTab.getAttribute("aria-selected")) === "true",
          WAIT_MS,
          '"All" tab did not become selected',
        );

        const countBefore = await visibleApplicantCount(driver);
        expect(countBefore).toBeGreaterThan(0);

        const listTextBefore = await driver.findElement(By.css(".apps-list")).getText();

        // GitHub filter is a native <select>, matched via its associated
        // label text ("GitHub") rather than a CSS class, with the option
        // chosen by its visible text (not value/index), per Select's contract.
        const githubSelectEl = await driver.wait(
          until.elementLocated(By.xpath('//label[.//span[contains(text(),"GitHub")]]//select')),
          WAIT_MS,
          "GitHub filter select not found",
        );
        const githubSelect = new Select(githubSelectEl);
        let selected = false;
        let lastError: unknown;
        for (const optionText of GITHUB_VERIFIED_OPTION_LABELS) {
          try {
            await githubSelect.selectByVisibleText(optionText);
            selected = true;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!selected) throw lastError;

        // The filter change triggers a real server round-trip — explicitly
        // wait for the list to finish loading and its content to actually
        // change before re-counting (guards against reading stale results).
        await driver.wait(
          async () =>
            (await listNotLoading(driver)) &&
            (await driver.findElement(By.css(".apps-list")).getText()) !== listTextBefore,
          WAIT_MS,
          "Applicant list did not update after changing the GitHub filter",
        );

        const countAfter = await visibleApplicantCount(driver);
        expect(countAfter).toBeLessThanOrEqual(countBefore);
      } finally {
        // Ensures the driver always shuts down even on assertion/timeout failure.
        await driver.quit();
      }
    },
    WAIT_MS * 6,
  );
});
