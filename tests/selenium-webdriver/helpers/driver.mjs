import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { BASE_URL, HEADLESS, USERS } from "./config.mjs";

/** Napravi novi Chrome WebDriver. Chrome + chromedriver moraju biti instalirani. */
export async function buildDriver() {
  const options = new chrome.Options();
  if (HEADLESS) options.addArguments("--headless=new");
  options.addArguments("--window-size=1400,1000", "--lang=sr");
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();
  await driver.manage().setTimeouts({ implicit: 3000 });
  return driver;
}

/** Otvori putanju relativnu na BASE_URL (npr. "/login"). */
export function open(driver, path = "/") {
  return driver.get(`${BASE_URL}${path}`);
}

/**
 * Prijava kroz korisnički interfejs. Login stranica (AuthClient) koristi:
 *   input[name="identifier"], input[name="password"], button.au-submit.
 * Captcha ("nisam robot", .au-captcha-check) se pojavljuje TEK posle prvog
 * klika na submit i mora se čekirati pre nego što prijava prođe.
 * Čeka da nas app preusmeri sa /login.
 */
export async function login(driver, user = USERS.member) {
  await open(driver, "/login");
  const idInput = await driver.wait(
    until.elementLocated(By.css('input[name="identifier"]')),
    20000, // Next.js dev prvi put kompajlira rutu — dug timeout.
  );
  await idInput.clear();
  await idInput.sendKeys(user.identifier);
  await driver.findElement(By.css('input[name="password"]')).sendKeys(user.password);
  await submitAuthWithCaptcha(driver);
  // Po uspešnoj prijavi app radi router.push("/") — čekamo da nestane /login.
  await driver.wait(
    async () => !(await driver.getCurrentUrl()).includes("/login"),
    15000,
  );
}

/**
 * Klikne submit; ako se pojavi captcha, čekira je i ponovo klikne submit.
 * Deljeno između pozitivnog i negativnog scenarija prijave.
 */
export async function submitAuthWithCaptcha(driver) {
  await driver.findElement(By.css("button.au-submit")).click();
  // Captcha se renderuje tek nakon prvog submita.
  const captchas = await driver.wait(
    async () => {
      const els = await driver.findElements(By.css(".au-captcha-check"));
      return els.length > 0 ? els : null;
    },
    10000,
  );
  await captchas[0].click();
  await driver.findElement(By.css("button.au-submit")).click();
}

/**
 * Postavi vrednost u kontrolisano React polje (npr. datetime-local) tako da
 * React "vidi" promenu. Običan sendKeys ume da bude nepouzdan za datetime-local
 * zbog lokalizacije, pa koristimo native value setter + input/change event.
 */
export async function setReactValue(driver, cssSelector, value) {
  const el = await driver.findElement(By.css(cssSelector));
  await driver.executeScript(
    (node, val) => {
      const proto = Object.getPrototypeOf(node);
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(node, val);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    el,
    value,
  );
}

/**
 * Klik koji je otporan na "element click intercepted": prvo doskroluje element u
 * centar viewporta, pa pokuša običan klik; ako je presretnut (sticky footer i sl.)
 * radi JS klik kao rezervu.
 */
export async function clickSafe(driver, cssSelector) {
  const el = await driver.findElement(By.css(cssSelector));
  await driver.executeScript(
    "arguments[0].scrollIntoView({block:'center'});",
    el,
  );
  try {
    await el.click();
  } catch {
    await driver.executeScript("arguments[0].click();", el);
  }
}

export { By, until };
