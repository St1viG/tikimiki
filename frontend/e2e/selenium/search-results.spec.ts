/**
 * Selenium WebDriver E2E test for the search page (/search).
 *
 * Backend: backend/src/search/* — GET /api/v1/search returns
 *   { users: SearchResultItem[], organizations: SearchResultItem[], hackathons: SearchResultItem[] }
 * Frontend: frontend/src/app/search/SearchClient.tsx renders:
 *   - input[type="search"]                    — live, debounced query box
 *   - nav[role="tablist"] > button[role="tab"] — one per category, in order
 *     users → organizations → hackathons
 *   - section[role="tabpanel"]                 — either a "no results" / prompt
 *     paragraph, or a <ul> of result <li> items, depending on the active tab
 *
 * Tab labels and the empty-state message are locale-dependent (en/sr), so
 * this test matches either rather than depending on the app's boot locale.
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
import { Builder, By, until, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const HEADED = process.env.HEADED === "1";
const WAIT_MS = 15000;

const TAB_LABELS: Record<string, string[]> = {
  users: ["Users", "Korisnici"],
  organizations: ["Organizations", "Organizacije"],
  hackathons: ["Hackathons", "Hakatoni"],
};
const EMPTY_STATE_TEXTS = ["No results.", "Nema rezultata."];

/** XPath for a role="tab" button whose visible text matches any of `labels`. */
function tabXPath(labels: string[]): string {
  const cond = labels.map((label) => `contains(., "${label}")`).join(" or ");
  return `//button[@role="tab"][${cond}]`;
}

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
 * True once the active results tabpanel has settled: it shows either at
 * least one result item, or one of the documented "no results" messages —
 * never the initial "type to search…" prompt or the "Searching…" loading text.
 */
async function resultsSettled(driver: WebDriver): Promise<boolean> {
  const panels = await driver.findElements(By.css('[role="tabpanel"]'));
  if (panels.length === 0) return false;
  const panel = panels[0];

  const items = await panel.findElements(By.css("li"));
  if (items.length > 0) return true;

  const text = await panel.getText();
  return EMPTY_STATE_TEXTS.some((emptyText) => text.includes(emptyText));
}

describe("Search results page", () => {
  it(
    "shows results (or the empty state) for users, organizations, and hackathons after a search",
    async () => {
      const driver: WebDriver = await buildDriver();
      try {
        await driver.get(`${BASE_URL}/search`);

        // Locate the search box by its semantic type, not a CSS class.
        const searchInput = await driver.wait(
          until.elementLocated(By.css('input[type="search"]')),
          WAIT_MS,
          "Search input did not appear",
        );
        await driver.wait(until.elementIsVisible(searchInput), WAIT_MS);
        await searchInput.sendKeys("test");

        // Explicit wait for the debounced search to resolve — no fixed sleep.
        await driver.wait(() => resultsSettled(driver), WAIT_MS, "Search results did not settle");

        // Tabs are exposed via role="tab"; assert all three are present and visible.
        for (const [key, labels] of Object.entries(TAB_LABELS)) {
          const tab = await driver.wait(
            until.elementLocated(By.xpath(tabXPath(labels))),
            WAIT_MS,
            `"${key}" tab not found`,
          );
          expect(await tab.isDisplayed()).toBe(true);
        }

        // Click through each tab and confirm it renders either results or the
        // documented empty-state text.
        for (const [key, labels] of Object.entries(TAB_LABELS)) {
          // Re-locate on every iteration: a prior click can trigger a re-render
          // that invalidates earlier element references.
          const tab = await driver.findElement(By.xpath(tabXPath(labels)));
          await tab.click();

          await driver.wait(
            () => resultsSettled(driver),
            WAIT_MS,
            `"${key}" tab's results did not settle`,
          );

          const panel = await driver.findElement(By.css('[role="tabpanel"]'));
          const items = await panel.findElements(By.css("li"));
          if (items.length > 0) {
            expect(items.length).toBeGreaterThan(0);
          } else {
            const text = await panel.getText();
            const hasEmptyState = EMPTY_STATE_TEXTS.some((emptyText) => text.includes(emptyText));
            expect(hasEmptyState).toBe(true);
          }
        }
      } finally {
        // Ensures the driver always shuts down even on assertion/timeout failure.
        await driver.quit();
      }
    },
    WAIT_MS * 4,
  );
});
