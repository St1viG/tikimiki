#!/usr/bin/env node
/**
 * Plain selenium-webdriver script (no test runner) for the submission video
 * player (Stevan's work, backend/src/projects/* + the video element in
 * frontend/src/app/cohor/CohorClient.tsx's "predaja-projekta" panel).
 *
 * NOTE: this app has no dedicated public "/projects/:id" page yet — the only
 * place a submitted project's video actually renders is that team-scoped
 * Cohor panel. This script therefore logs in as the team's own member and
 * opens Cohor there (see the product decision recorded in the PR/commit).
 *
 * Data setup goes straight through the backend API (backend/src/projects/projects.controller.ts,
 * backend/src/teams/teams.controller.ts, backend/src/hackathons/hackathons.controller.ts,
 * backend/src/applications/applications.controller.ts):
 *   1. org@tikimiki.dev creates a hackathon (stays "upcoming" — team creation
 *      requires that status; project create/submit have no status check at all).
 *   2. andrej@tikimiki.dev (a seeded member) creates a team in it — this
 *      auto-files a pending hackathon application for them.
 *   3. org@tikimiki.dev approves that application — this is what actually
 *      grants Cohor server access (team membership alone does not).
 *   4. andrej@tikimiki.dev creates a project with videoUrl set directly, then
 *      submits it via POST /projects/:projectId/submit.
 *
 * Then Selenium logs in as andrej@tikimiki.dev through the real UI and opens
 * /cohor?server=<id>&channel=predaja-projekta, and asserts a <video> element
 * exists with a non-empty src (checking a nested <source src> too, in case
 * the markup ever changes to that form).
 *
 * Run:   node frontend/e2e/webdriver/video-player.test.js
 *        (see the bottom of this file / the PR description for the exact
 *        prerequisites — dev servers, seeded DB — before running)
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

// Seeded accounts (backend/src/db/seed.ts) — password123 for every account.
const ORG_EMAIL = "org@tikimiki.dev";
const ORG_PASSWORD = "password123";
const MEMBER_EMAIL = "andrej@tikimiki.dev";
const MEMBER_PASSWORD = "password123";
const MEMBER_USERNAME = "andrej";

// A real, well-known public sample video URL — only its presence in the
// <video> src is asserted, it's never actually played back.
const SAMPLE_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

/* ── backend API setup (creates the hackathon/team/project fixture) ──────── */

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
 * Creates hackathon → team → project → submission, approves the team
 * member's application (required for Cohor server access), and returns the
 * Cohor serverId for the new hackathon.
 */
async function seedSubmission() {
  const orgToken = await apiLogin(ORG_EMAIL, ORG_PASSWORD);

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  // All three dates must stay in the future: team creation only requires
  // status "upcoming", but the application auto-filed on team creation
  // (best-effort, failures are swallowed) is rejected once registrationDeadline
  // has passed — and submit() is rejected once endsAt has passed.
  const hackathon = await apiRequest(orgToken, "POST", "/hackathons", {
    title: `Video Player Test ${now}`,
    description: "Selenium video-player.test.js fixture.",
    type: "virtual",
    registrationDeadline: new Date(now + 30 * DAY_MS).toISOString(),
    startsAt: new Date(now + 31 * DAY_MS).toISOString(),
    endsAt: new Date(now + 38 * DAY_MS).toISOString(),
    maxTeamSize: 4,
  });

  const memberToken = await apiLogin(MEMBER_EMAIL, MEMBER_PASSWORD);
  const team = await apiRequest(memberToken, "POST", "/teams", {
    name: `Video Test Team ${now}`,
    hackathonId: hackathon.hackathonId,
  });

  // Team creation only auto-files a *pending* application — approve it so
  // the member actually gets Cohor server access (grantServerMembership).
  const applicants = await apiRequest(
    orgToken,
    "GET",
    `/applications/hackathon/${hackathon.hackathonId}`,
  );
  const applicant = applicants.find((a) => a.username === MEMBER_USERNAME);
  if (!applicant) {
    throw new Error(`Could not find ${MEMBER_USERNAME}'s application to approve`);
  }
  await apiRequest(orgToken, "PATCH", `/applications/${applicant.applicationId}/approve`);

  const project = await apiRequest(memberToken, "POST", `/teams/${team.teamId}/project`, {
    title: `Video Player Test Project ${now}`,
    videoUrl: SAMPLE_VIDEO_URL,
  });
  await apiRequest(memberToken, "POST", `/projects/${project.projectId}/submit`);

  const servers = await apiRequest(orgToken, "GET", "/servers");
  const server = servers.find((s) => s.hackathonId === hackathon.hackathonId);
  if (!server) {
    throw new Error("Could not find the Cohor server for the new hackathon");
  }

  return { serverId: server.serverId };
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

async function loginViaUi(driver) {
  await driver.get(`${BASE_URL}/login`);

  const identifier = await driver.wait(
    until.elementLocated(By.css('input[name="identifier"]')),
    WAIT_MS,
    "Identifier field did not appear",
  );
  await identifier.sendKeys(MEMBER_EMAIL);
  await driver.findElement(By.css('input[name="password"]')).sendKeys(MEMBER_PASSWORD);

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

/** The <video>'s own src if set, else the first non-empty nested <source src>. */
async function readVideoSrc(driver, videoEl) {
  const directSrc = await videoEl.getAttribute("src");
  if (directSrc && directSrc.trim() !== "") return directSrc;

  const sources = await videoEl.findElements(By.css("source"));
  for (const source of sources) {
    const src = await source.getAttribute("src");
    if (src && src.trim() !== "") return src;
  }
  return null;
}

async function main() {
  const { serverId } = await seedSubmission();

  const driver = await buildDriver();
  try {
    await loginViaUi(driver);

    await driver.get(`${BASE_URL}/cohor?server=${serverId}&channel=predaja-projekta`);

    const video = await driver.wait(
      until.elementLocated(By.css("video")),
      WAIT_MS,
      "<video> element did not appear on the submission's page",
    );
    await driver.wait(until.elementIsVisible(video), WAIT_MS);

    // Explicit wait for src to actually be populated (async project load) — no fixed sleep.
    await driver.wait(
      async () => {
        const src = await readVideoSrc(driver, video);
        return Boolean(src);
      },
      WAIT_MS,
      "<video> src (or nested <source src>) never became non-empty",
    );

    const src = await readVideoSrc(driver, video);
    if (!src) throw new Error("<video> has no non-empty src, and no <source src> child");
    console.log(`OK: video src = "${src}"`);
  } finally {
    // Ensures the driver always shuts down even on assertion/timeout failure.
    await driver.quit();
  }
}

main()
  .then(() => {
    console.log("video-player.test.js PASSED");
    process.exit(0);
  })
  .catch((err) => {
    console.error("video-player.test.js FAILED:", err);
    process.exit(1);
  });
