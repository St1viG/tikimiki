#!/usr/bin/env node
/**
 * Plain selenium-webdriver script (no test runner) for the "suggested
 * teammates" AI-matching invite flow (Dimitrije's work, backend/src/matching/*
 * + backend/src/teams/*, UI section on /teams/find in frontend/src/app/teams/find/FindClient.tsx).
 *
 * Candidate eligibility (matching.service.ts#freeAgentsForHackathon) requires
 * someone to have actually applied to the SAME hackathon (status pending or
 * approved) — a brand-new hackathon has zero suggestions until someone does.
 * And the inviter's /teams/find page only loads suggestions for their
 * "active hackathon" (GET /me/active-hackathon), which requires BOTH an
 * approved application (grants the Cohor "Participant" role) AND the
 * hackathon status to be "ongoing". So data setup is:
 *   1. org@tikimiki.dev creates a hackathon (starts "upcoming").
 *   2. Two brand-new member accounts are registered (avoids any interference
 *      with the seeded members' existing ETF HackWeek state): an "inviter"
 *      and a "candidate".
 *   3. Inviter creates a team in the hackathon (requires status "upcoming";
 *      this also auto-files a pending application for the inviter).
 *   4. Candidate applies to the hackathon directly, no team (requires status
 *      "upcoming" too) — this alone is enough for them to show up as a
 *      suggested teammate; their application never needs approval.
 *   5. org approves the inviter's application (grants Cohor server access).
 *   6. org transitions the hackathon to "ongoing" (must happen AFTER steps
 *      3-4, since new applications/teams are rejected once it leaves "upcoming").
 *
 * Then Selenium logs in as the inviter through the real UI, opens
 * /teams/find, switches to the "Suggested" tab, and clicks the invite button
 * on the first suggested candidate — asserting its text changes to "Invited"
 * and it becomes disabled (frontend/src/components/teams/SoloPlayerCard.tsx).
 *
 * Run:   node frontend/e2e/webdriver/video-player.test.js  (sibling example)
 *        node frontend/e2e/webdriver/team-invites.test.js
 * Env:
 *   BASE_URL   — frontend origin (default http://localhost:3000)
 *   API_URL    — backend API origin, including /api/v1 (default http://localhost:4000/api/v1)
 *   HEADED=1   — run with a visible browser window (default: headless)
 *   CHROME_BIN — explicit path to a Chrome/Chromium binary (optional;
 *                auto-detected otherwise — see resolveChromeBinary below)
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:4000/api/v1";
const HEADED = process.env.HEADED === "1";
const WAIT_MS = 15000;

// Seeded organizer account (backend/src/db/seed.ts) — password123 for every account.
const ORG_EMAIL = "org@tikimiki.dev";
const ORG_PASSWORD = "password123";
const TEST_PASSWORD = "password123";

/* ── backend API setup (creates the hackathon/team/candidate fixture) ────── */

async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.accessToken;
}

async function apiRegisterMember(username, email, password) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }), // accountType defaults to "member"
  });
  if (!res.ok) {
    throw new Error(`Register failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.accessToken;
}

async function apiRequest(token, method, urlPath, body) {
  const res = await fetch(`${API_URL}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Builds the whole fixture and returns the inviter's login credentials plus
 * the candidate's username (to identify their card in the UI).
 */
async function seedSuggestion() {
  const orgToken = await apiLogin(ORG_EMAIL, ORG_PASSWORD);

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  // All three dates start in the future: team/application creation requires
  // status "upcoming" and registrationDeadline not yet passed. The hackathon
  // is flipped to "ongoing" only after those "upcoming"-gated steps are done.
  const hackathon = await apiRequest(orgToken, "POST", "/hackathons", {
    title: `Team Invites Test ${now}`,
    description: "Selenium team-invites.test.js fixture.",
    type: "virtual",
    registrationDeadline: new Date(now + 30 * DAY_MS).toISOString(),
    startsAt: new Date(now + 31 * DAY_MS).toISOString(),
    endsAt: new Date(now + 38 * DAY_MS).toISOString(),
    maxTeamSize: 4,
  });

  // Brand-new accounts, not the seeded members — avoids any interference
  // with their existing ETF HackWeek 2026 team/application state.
  const inviterEmail = `inviter-${now}@example.com`;
  const inviterUsername = `inviter${now}`;
  const candidateEmail = `candidate-${now}@example.com`;
  const candidateUsername = `candidate${now}`;

  const inviterToken = await apiRegisterMember(inviterUsername, inviterEmail, TEST_PASSWORD);
  const candidateToken = await apiRegisterMember(candidateUsername, candidateEmail, TEST_PASSWORD);

  await apiRequest(inviterToken, "POST", "/teams", {
    name: `Invites Test Team ${now}`,
    hackathonId: hackathon.hackathonId,
  });

  // The candidate just needs a pending application to this hackathon — no
  // team required — to be eligible as a suggested teammate.
  await apiRequest(candidateToken, "POST", "/applications", {
    hackathonId: hackathon.hackathonId,
  });

  // Team creation auto-files a *pending* application for the inviter
  // (best-effort — approve it explicitly here so Cohor grants server access,
  // required for GET /me/active-hackathon to resolve this hackathon).
  const applicants = await apiRequest(
    orgToken,
    "GET",
    `/applications/hackathon/${hackathon.hackathonId}`,
  );
  const inviterApplication = applicants.find((a) => a.username === inviterUsername);
  if (!inviterApplication) {
    throw new Error(`Could not find ${inviterUsername}'s auto-filed application to approve`);
  }
  await apiRequest(orgToken, "PATCH", `/applications/${inviterApplication.applicationId}/approve`);

  // Only now move the hackathon out of "upcoming" — new teams/applications
  // would be rejected once it does.
  await apiRequest(orgToken, "PATCH", `/hackathons/${hackathon.hackathonId}/status`, {
    status: "ongoing",
  });

  return { inviterEmail, candidateUsername };
}

/* ── Chrome/Selenium setup (mirrors frontend/e2e/selenium/*.spec.ts) ─────── */

/**
 * No system Chrome is assumed to be pre-installed. Prefer an explicit
 * CHROME_BIN override, then common system install paths, then fall back to a
 * Playwright-managed Chromium (a real "Chrome for Testing" build) if one is
 * already cached locally — so the script still runs standalone.
 */
function resolveChromeBinary() {
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

async function buildDriver() {
  const options = new chrome.Options();
  if (!HEADED) options.addArguments("--headless=new");
  options.addArguments("--window-size=1400,1000", "--no-sandbox", "--disable-dev-shm-usage");

  const binary = resolveChromeBinary();
  if (binary) options.setChromeBinaryPath(binary);

  return new Builder().forBrowser("chrome").setChromeOptions(options).build();
}

/**
 * Plain element.click() (and the Actions API) do not reliably trigger
 * React's event delegation for plain <button> elements in headless Chrome —
 * verified empirically against this app (see applicant-filters.spec.ts).
 * Dispatch the full pointer/mouse event sequence a real click produces.
 */
async function robustClick(driver, element) {
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

async function loginViaUi(driver, email, password) {
  await driver.get(`${BASE_URL}/login`);

  const identifier = await driver.wait(
    until.elementLocated(By.css('input[name="identifier"]')),
    WAIT_MS,
    "Identifier field did not appear",
  );
  await identifier.sendKeys(email);
  await driver.findElement(By.css('input[name="password"]')).sendKeys(password);

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

async function main() {
  const { inviterEmail, candidateUsername } = await seedSuggestion();

  const driver = await buildDriver();
  try {
    await loginViaUi(driver, inviterEmail, TEST_PASSWORD);

    await driver.get(`${BASE_URL}/teams/find`);

    // The "Suggested teammates" section is fetched on mount but hidden
    // (display:none) until the "Suggested" tab is active.
    const suggestedTab = await driver.wait(
      until.elementLocated(
        By.xpath(
          '//button[contains(@class,"tm-tab")][contains(., "Suggested") or contains(., "Predlozi")]',
        ),
      ),
      WAIT_MS,
      '"Suggested" tab not found',
    );
    await robustClick(driver, suggestedTab);

    // Explicit wait for the suggestions to finish loading — no fixed sleep.
    await driver.wait(
      async () =>
        (await driver.findElements(By.css('.tm-solo-grid [aria-busy="true"]'))).length === 0,
      WAIT_MS,
      "Suggested-teammates list never finished loading",
    );

    const candidateCard = await driver.wait(
      until.elementLocated(
        By.xpath(
          `//*[contains(@class,"tm-solo-grid")]//*[contains(., "${candidateUsername}")]/ancestor::*[contains(@class,"tm-solo")][1]`,
        ),
      ),
      WAIT_MS,
      `Suggested candidate "${candidateUsername}" not found in the list`,
    );
    const inviteButton = await candidateCard.findElement(
      By.xpath('.//button[contains(., "Invite") or contains(., "Pozovi")]'),
    );

    const textBefore = (await inviteButton.getText()).trim();
    await robustClick(driver, inviteButton);

    // Explicit wait for the button's state to actually flip — no fixed sleep.
    await driver.wait(
      async () => {
        const text = (await inviteButton.getText()).trim();
        const disabled = await inviteButton.getAttribute("disabled");
        return text !== textBefore || disabled !== null;
      },
      WAIT_MS,
      "Invite button state did not change after clicking it",
    );

    const textAfter = (await inviteButton.getText()).trim();
    const disabledAfter = await inviteButton.getAttribute("disabled");
    console.log(
      `Invite button: "${textBefore}" -> "${textAfter}" (disabled=${disabledAfter !== null})`,
    );

    // This UI's actual invited-state label is "Invited"/"Pozvan" (the
    // "Sent"/"Requested" wording belongs to a different feature — the
    // open-team join-request flow), and the button stays permanently
    // disabled once invited (frontend/src/components/teams/SoloPlayerCard.tsx).
    const INVITED_LABELS = ["Invited", "Pozvan"];
    if (disabledAfter === null) {
      throw new Error(
        `Expected the invite button to become disabled, but it did not (text is now "${textAfter}")`,
      );
    }
    if (!INVITED_LABELS.includes(textAfter)) {
      throw new Error(
        `Expected the invite button text to read "Invited"/"Pozvan", got "${textAfter}"`,
      );
    }
  } finally {
    // Ensures the driver always shuts down even on assertion/timeout failure.
    await driver.quit();
  }
}

main()
  .then(() => {
    console.log("team-invites.test.js PASSED");
    process.exit(0);
  })
  .catch((err) => {
    console.error("team-invites.test.js FAILED:", err);
    process.exit(1);
  });
