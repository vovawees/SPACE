/* Полный прогон e2e: временный сервер на свободном порту + сценарии.
   npm run build && npm run e2e
   (браузер: npx playwright install chromium или системный Chromium/Chrome — см. browser.ts) */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

async function waitFor(url: string, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`сервер не ответил: ${url}`);
}

const run = (file: string, args: string[]) =>
  new Promise<number>((resolve) => {
    const p = spawn(process.execPath, [file, ...args], { stdio: "inherit" });
    p.on("exit", (code) => resolve(code ?? 1));
  });

if (!fs.existsSync("dist/index.html")) {
  console.error("Сначала соберите клиент: npm run build");
  process.exit(1);
}
const port = await freePort();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "space-e2e-"));
const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server/index.ts"], {
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", STORAGE_DIR: dir, NODE_ENV: "production" },
  stdio: ["ignore", "ignore", "inherit"],
});
let code = 1;
try {
  const base = `http://127.0.0.1:${port}`;
  await waitFor(`${base}/api/health`);
  console.log(`Сервер: ${base}, данные: ${dir}\n`);
  code = await run("tests/e2e/flows.ts", [base]);
} finally {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
