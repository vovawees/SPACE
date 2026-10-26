/* Какой Chromium запускать в e2e: CHROMIUM_PATH → браузер Playwright
   (npx playwright install chromium) → системный Chromium или Chrome.
   На Arch, Fedora и прочих Linux, где браузер Playwright не ставится,
   подхватится системный. */
import fs from "node:fs";
import { chromium, type LaunchOptions } from "playwright";

const SYSTEM = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/local/bin/chromium",
  "/snap/bin/chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/opt/google/chrome/chrome",
  "/usr/bin/brave-browser",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

export function chromiumPath(): string | undefined {
  const env = process.env.CHROMIUM_PATH || process.env.SPACE_BROWSER;
  if (env) return env;
  try {
    if (fs.existsSync(chromium.executablePath())) return undefined; // свой браузер Playwright
  } catch {
    /* Playwright не знает эту систему */
  }
  return SYSTEM.find((p) => fs.existsSync(p));
}

export function launch(opts: LaunchOptions = {}) {
  const executablePath = chromiumPath();
  return chromium.launch({ ...opts, executablePath, args: ["--no-sandbox", ...(opts.args ?? [])] }).catch((err: Error) => {
    if (/Executable doesn't exist|executable doesn't exist/i.test(err.message)) {
      console.error(
        "\n  Нет браузера для e2e. Поставьте его один раз:\n" +
          "    npx playwright install chromium      (Debian/Ubuntu: npx playwright install --with-deps chromium)\n" +
          "  или укажите свой: CHROMIUM_PATH=/usr/bin/chromium npm run e2e\n",
      );
    }
    throw err;
  });
}
