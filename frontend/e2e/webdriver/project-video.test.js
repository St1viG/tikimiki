#!/usr/bin/env node
/**
 * Plain selenium-webdriver script (no test runner) covering the project
 * video lifecycle — create (via first upload) → submit → edit after
 * submission — cross-checked against the read APIs a real detail/submissions
 * page would use (backend/src/projects/projects.controller.ts:
 * GET /projects/:projectId, GET /hackathons/:hackathonId/submissions).
 *
 * ADAPTED SCOPE (see the conversation this was requested in for the full
 * reasoning): the original ask modeled this on backend/test/integration/
 * projects.e2e.spec.ts using createTestApp/closeTestApp + factories.ts, with
 * Selenium replacing supertest calls. That's not buildable as asked:
 *   - createTestApp() explicitly does NOT bind a network port (supertest
 *     talks to it in-process via app.getHttpServer()) — no real browser can
 *     navigate to it.
 *   - factories.ts's registerMember/registerOrganization/createHackathon/
 *     createTeam all take that in-process `app` object as their first
 *     argument — unusable against an already-running external server.
 *   - There is no dedicated public "project detail" or "hackathon
 *     submissions list" PAGE in the frontend at all (GET /projects/:id and
 *     GET /hackathons/:id/submissions are public, real endpoints, but
 *     nothing in frontend/src ever calls them) — and no plain videoUrl TEXT
 *     FIELD exists anywhere; the only video UI is Cohor's "predaja-projekta"
 *     panel, which is a file-upload dropzone, not a URL input.
 * Per instruction, this instead: (a) lives in frontend/e2e/webdriver/ and
 * points Selenium at already-running dev servers (same as its two sibling
 * scripts), (b) does data setup with ad-hoc fetch calls instead of
 * factories.ts, (c) drives the Cohor panel's file upload/replace instead of
 * typing a URL, and (d) verifies "the detail/submissions page shows the
 * right videoUrl and status" by calling the same read APIs directly, since
 * there's no page to load them in a browser.
 *
 * Run:   node frontend/e2e/webdriver/project-video.test.js
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

const TEST_PASSWORD = "password123";

/* ── backend API setup + verification (ad-hoc fetch, mirrors the sibling scripts) ── */

async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.accessToken;
}

async function apiRegisterMember(username, email, password) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }), // accountType defaults to "member"
  });
  if (!res.ok)
    throw new Error(`Register (member) failed for ${email}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.accessToken;
}

async function apiRegisterOrganization(username, email, password, organizationName) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email,
      password,
      accountType: "organization",
      organizationName,
    }),
  });
  if (!res.ok)
    throw new Error(`Register (org) failed for ${email}: ${res.status} ${await res.text()}`);
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
 * Creates hackathon → team (as the leader), approves the leader's
 * auto-filed application (required for Cohor server access), and returns
 * everything needed to drive the UI and verify against the read APIs.
 */
async function seedFixture() {
  const now = Date.now();
  const orgUsername = `pvorg${now}`;
  const orgEmail = `${orgUsername}@example.com`;
  const leaderUsername = `pvleader${now}`;
  const leaderEmail = `${leaderUsername}@example.com`;

  const orgToken = await apiRegisterOrganization(
    orgUsername,
    orgEmail,
    TEST_PASSWORD,
    `Org ${orgUsername}`,
  );
  const leaderToken = await apiRegisterMember(leaderUsername, leaderEmail, TEST_PASSWORD);

  const DAY_MS = 24 * 60 * 60 * 1000;
  // Dates safely in the future so the hackathon stays "upcoming" throughout
  // (team creation requires that status; no separate "ongoing" transition is
  // needed here since Cohor is opened via a direct ?server= deep link, not
  // via GET /me/active-hackathon).
  const hackathon = await apiRequest(orgToken, "POST", "/hackathons", {
    title: `Project Video Test ${now}`,
    description: "Selenium project-video.test.js fixture.",
    type: "virtual",
    registrationDeadline: new Date(now + 30 * DAY_MS).toISOString(),
    startsAt: new Date(now + 31 * DAY_MS).toISOString(),
    endsAt: new Date(now + 38 * DAY_MS).toISOString(),
    maxTeamSize: 4,
  });

  const team = await apiRequest(leaderToken, "POST", "/teams", {
    name: `Project Video Team ${now}`,
    hackathonId: hackathon.hackathonId,
  });

  // Team creation only auto-files a *pending* application for the leader —
  // approve it so Cohor actually grants them server access.
  const applicants = await apiRequest(
    orgToken,
    "GET",
    `/applications/hackathon/${hackathon.hackathonId}`,
  );
  const leaderApplication = applicants.find((a) => a.username === leaderUsername);
  if (!leaderApplication) {
    throw new Error(`Could not find ${leaderUsername}'s auto-filed application to approve`);
  }
  await apiRequest(orgToken, "PATCH", `/applications/${leaderApplication.applicationId}/approve`);

  const servers = await apiRequest(orgToken, "GET", "/servers");
  const server = servers.find((s) => s.hackathonId === hackathon.hackathonId);
  if (!server) throw new Error("Could not find the Cohor server for the new hackathon");

  return {
    leaderEmail,
    leaderToken,
    teamId: team.teamId,
    hackathonId: hackathon.hackathonId,
    serverId: server.serverId,
  };
}

/** GET /teams/:teamId/project — the project auto-created by the first video upload.
 *  The route wraps its result as { project: Project | null } (see
 *  projects.controller.ts's getTeamProject), so unwrap it here. */
async function fetchTeamProject(token, teamId) {
  const res = await apiRequest(token, "GET", `/teams/${teamId}/project`);
  return res ? res.project : null;
}

/* ── a minimal-but-real MP4: the backend sniffs magic bytes (ASCII "ftyp" at
   offset 4), so this must be more than just a renamed text file. ─────────── */
function makeFakeMp4Buffer(label) {
  const header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // size + "ftyp"
  const brand = Buffer.from("isom0000isomiso2avc1mp41", "ascii");
  const marker = Buffer.from(`selenium-${label}-${Date.now()}-${Math.random()}`, "ascii");
  return Buffer.concat([header, brand, marker]);
}

function writeTempMp4(label) {
  const filePath = path.join(os.tmpdir(), `project-video-test-${label}-${Date.now()}.mp4`);
  fs.writeFileSync(filePath, makeFakeMp4Buffer(label));
  return filePath;
}

/* ── Chrome/Selenium setup (mirrors frontend/e2e/selenium/*.spec.ts and the
   other frontend/e2e/webdriver/*.test.js scripts) ─────────────────────── */

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

async function createDriver() {
  const options = new chrome.Options();
  if (!HEADED) options.addArguments("--headless=new");
  options.addArguments("--window-size=1400,1000", "--no-sandbox", "--disable-dev-shm-usage");

  const binary = resolveChromeBinary();
  if (binary) options.setChromeBinaryPath(binary);

  return new Builder().forBrowser("chrome").setChromeOptions(options).build();
}

async function closeDriver(driver) {
  if (driver) await driver.quit();
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
  const { leaderEmail, leaderToken, teamId, hackathonId, serverId } = await seedFixture();
  const firstVideoPath = writeTempMp4("first");
  const secondVideoPath = writeTempMp4("second");

  const driver = await createDriver();
  try {
    await loginViaUi(driver, leaderEmail, TEST_PASSWORD);
    await driver.get(`${BASE_URL}/cohor?server=${serverId}&channel=predaja-projekta`);

    /* ── Scenario 1: creating the project (first video upload) ────────── */
    // No project exists yet — the video dropzone's hidden file input is
    // present immediately (this app never gates it behind a "create
    // project" step). sendKeys works against a hidden <input type=file>
    // regardless of its display:none styling.
    const firstFileInput = await driver.wait(
      until.elementLocated(By.css("#video-file-input")),
      WAIT_MS,
      "Video upload input did not appear",
    );
    await firstFileInput.sendKeys(firstVideoPath);

    const video = await driver.wait(
      until.elementLocated(By.css("#video-player")),
      WAIT_MS,
      "Video player did not appear after the first upload",
    );
    await driver.wait(
      async () => Boolean(await readVideoSrc(driver, video)),
      WAIT_MS,
      "Video src never became non-empty",
    );
    const srcAfterCreate = await readVideoSrc(driver, video);
    console.log(`Created project, video src = "${srcAfterCreate}"`);

    const projectAfterCreate = await fetchTeamProject(leaderToken, teamId);
    if (!projectAfterCreate)
      throw new Error(
        "Project was not actually created (GET /teams/:teamId/project returned null)",
      );
    if (projectAfterCreate.status !== "draft") {
      throw new Error(
        `Expected status "draft" right after creation, got "${projectAfterCreate.status}"`,
      );
    }
    if (!projectAfterCreate.videoUrl) {
      throw new Error("Expected a non-empty videoUrl right after creation");
    }
    const projectId = projectAfterCreate.projectId;

    /* ── Scenario 2: submit the project ────────────────────────────────── */
    const submitButton = await driver.wait(
      until.elementLocated(
        By.xpath('//button[contains(., "Submit project") or contains(., "Predaj projekat")]'),
      ),
      WAIT_MS,
      "Submit button not found",
    );
    await robustClick(driver, submitButton);

    // "Withdraw to draft" only renders once status === "submitted" — wait
    // for it rather than a fixed sleep, covering the async re-fetch.
    await driver.wait(
      until.elementLocated(
        By.xpath('//button[contains(., "Withdraw to draft") or contains(., "Vrati u nacrt")]'),
      ),
      WAIT_MS,
      "Project did not appear to submit (Withdraw button never showed up)",
    );

    const projectAfterSubmit = await apiRequest(leaderToken, "GET", `/projects/${projectId}`);
    if (projectAfterSubmit.status !== "submitted") {
      throw new Error(`Expected status "submitted", got "${projectAfterSubmit.status}"`);
    }
    if (projectAfterSubmit.videoUrl !== projectAfterCreate.videoUrl) {
      throw new Error("videoUrl unexpectedly changed across the submit step");
    }
    console.log(
      `GET /projects/${projectId} -> status="${projectAfterSubmit.status}" videoUrl="${projectAfterSubmit.videoUrl}"`,
    );

    // Public "hackathon submissions" listing should now include it too.
    const submissions = await apiRequest(null, "GET", `/hackathons/${hackathonId}/submissions`);
    const listed = submissions.find((p) => p.projectId === projectId);
    if (!listed)
      throw new Error("Submitted project did not appear in GET /hackathons/:id/submissions");
    if (listed.status !== "submitted" || listed.videoUrl !== projectAfterCreate.videoUrl) {
      throw new Error(
        `Submissions listing entry mismatch: status="${listed.status}" videoUrl="${listed.videoUrl}"`,
      );
    }
    console.log(
      `GET /hackathons/${hackathonId}/submissions -> matching entry found, status="${listed.status}"`,
    );

    /* ── Scenario 3: edit videoUrl after submission (Replace flow) ──────── */
    const replaceButton = await driver.wait(
      until.elementLocated(By.xpath('//button[contains(., "Replace") or contains(., "Zameni")]')),
      WAIT_MS,
      "Replace-video button not found",
    );
    // Selenium can target the hidden file input directly — no need to click
    // "Replace" first to "open" it.
    void replaceButton;
    const replaceFileInput = await driver.findElement(By.css("#video-replace-input"));
    await replaceFileInput.sendKeys(secondVideoPath);

    // Explicit wait for the src to actually change — no fixed sleep.
    await driver.wait(
      async () => {
        const src = await readVideoSrc(driver, await driver.findElement(By.css("#video-player")));
        return Boolean(src) && src !== srcAfterCreate;
      },
      WAIT_MS,
      "Video src did not change after the replace upload",
    );

    const projectAfterEdit = await apiRequest(leaderToken, "GET", `/projects/${projectId}`);
    if (projectAfterEdit.videoUrl === projectAfterCreate.videoUrl) {
      throw new Error("videoUrl did not change after replacing the video");
    }
    if (projectAfterEdit.status !== "submitted") {
      throw new Error(
        `Expected status to remain "submitted" after editing, got "${projectAfterEdit.status}"`,
      );
    }
    console.log(
      `After replace: videoUrl="${projectAfterEdit.videoUrl}" (status still "${projectAfterEdit.status}")`,
    );
  } finally {
    // Ensures the driver always shuts down even on assertion/timeout failure.
    await closeDriver(driver);
    for (const p of [firstVideoPath, secondVideoPath]) {
      fs.rm(p, { force: true }, () => {});
    }
  }
}

main()
  .then(() => {
    console.log("project-video.test.js PASSED");
    process.exit(0);
  })
  .catch((err) => {
    console.error("project-video.test.js FAILED:", err);
    process.exit(1);
  });
