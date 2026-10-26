/* SPACE как служба Linux (systemd, служба пользователя): работает в фоне,
   стартует при входе в систему и перезапускается при сбое. В меню приложений
   появляется значок SPACE — он открывает доску в браузере.

     npm run service            поставить или обновить и запустить
     npm run service:remove     убрать службу и значок (данные остаются)
     node scripts/service.ts open | status | logs

   Служба запускает тот же Node.js, которым выполнен этот скрипт, и сервер из
   этой папки. Настройки — из .env здесь же, как у npm start. После обновления
   SPACE или смены версии Node.js просто повторите npm run service. */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { spawn, spawnSync } from "node:child_process";

export const ROOT = path.resolve(import.meta.dirname, "..");
const UNIT = "space.service";
const ICON = "space-board";
const EX_CONFIG = 78; // сервер так выходит, если порт занят: перезапуск не поможет

const home = os.homedir();
const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
const dataHome = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
const unitPath = path.join(configHome, "systemd", "user", UNIT);
const appsDir = path.join(dataHome, "applications");
const desktopPath = path.join(appsDir, "space.desktop");
const iconsDir = path.join(dataHome, "icons", "hicolor");
const ICONS: [file: string, size: string][] = [
  ["favicon.svg", "scalable"],
  ["icon-512.png", "512x512"],
  ["icon-192.png", "192x192"],
];

/* ------------------------------ файлы ------------------------------ */

function noNewlines(s: string): string {
  if (/[\r\n]/.test(s)) throw new Error(`в пути есть перевод строки: ${JSON.stringify(s)}`);
  return s;
}

/** Слово командной строки systemd (ExecStart=): в кавычках, но %, $ и \ раскрываются и в них. */
export function unitArg(s: string): string {
  const q = noNewlines(s).replace(/[\\"]/g, (c) => "\\" + c).replace(/%/g, "%%").replace(/\$/g, "$$$$");
  return `"${q}"`;
}

/** Путь в WorkingDirectory=: кавычки не нужны, но % — спецсимвол. */
export function unitPathValue(s: string): string {
  return noNewlines(s).replace(/%/g, "%%");
}

/** Аргумент Exec= в .desktop: кавычки по спецификации плюс экранирование строки ключа. */
export function desktopArg(s: string): string {
  const map: Record<string, string> = { "\\": "\\\\\\\\", '"': '\\\\"', "`": "\\\\`", $: "\\\\$" };
  return `"${noNewlines(s).replace(/[\\"`$]/g, (c) => map[c]!).replace(/%/g, "%%")}"`;
}

export function unitFile(node: string, root: string): string {
  return [
    `# SPACE: создано командой «npm run service». Убрать: npm run service:remove`,
    `[Unit]`,
    `Description=SPACE — бесконечная доска`,
    ``,
    `[Service]`,
    `Type=simple`,
    `WorkingDirectory=${unitPathValue(root)}`,
    `Environment=NODE_ENV=production`,
    `ExecStart=${unitArg(node)} --disable-warning=ExperimentalWarning ${unitArg(path.join(root, "src", "server", "index.ts"))}`,
    `Restart=on-failure`,
    `RestartSec=3`,
    `RestartPreventExitStatus=${EX_CONFIG}`,
    `TimeoutStopSec=20`,
    `SyslogIdentifier=space`,
    ``,
    `[Install]`,
    `WantedBy=default.target`,
    ``,
  ].join("\n");
}

export function desktopFile(node: string, root: string): string {
  return [
    `[Desktop Entry]`,
    `Type=Application`,
    `Name=SPACE`,
    `GenericName=Бесконечная доска`,
    `Comment=Заметки, схемы, планы, код и файлы на одной доске`,
    `Exec=${desktopArg(node)} --disable-warning=ExperimentalWarning ${desktopArg(path.join(root, "scripts", "service.ts"))} open`,
    `Icon=${ICON}`,
    `Terminal=false`,
    `Categories=Office;Graphics;`,
    `Keywords=board;whiteboard;canvas;notes;доска;заметки;схема;`,
    `StartupNotify=false`,
    ``,
  ].join("\n");
}

/* ------------------------------ окружение ------------------------------ */

function sh(cmd: string, args: string[], quiet = true) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: quiet ? "pipe" : "inherit" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(), missing: !!r.error };
}
const sctl = (...args: string[]) => sh("systemctl", ["--user", ...args]);

/** Путь к node, который переживёт обновления (snap и Homebrew меняют путь к версии). */
function nodeBin(): string {
  const real = process.execPath;
  if (real.startsWith("/snap/") && fs.existsSync("/snap/bin/node")) return "/snap/bin/node";
  let realReal = real;
  try {
    realReal = fs.realpathSync(real);
  } catch {
    /* оставим как есть */
  }
  for (const dir of (process.env.PATH || "").split(":")) {
    // временные каталоги fnm и node_modules/.bin от npm — не годятся
    if (!dir || !path.isAbsolute(dir) || /fnm_multishells|node_modules|^\/tmp\/|^\/run\//.test(dir)) continue;
    const p = path.join(dir, "node");
    try {
      if (fs.realpathSync(p) === realReal) return p;
    } catch {
      /* нет такого */
    }
  }
  return real;
}

function settings(): { port: number; host: string } {
  let file: Record<string, string> = {};
  try {
    file = util.parseEnv(fs.readFileSync(path.join(ROOT, ".env"), "utf8")) as Record<string, string>;
  } catch {
    /* .env нет — значения по умолчанию */
  }
  const port = Number(process.env.PORT || file.PORT) || 8787;
  const host = process.env.HOST || file.HOST || "0.0.0.0";
  return { port, host };
}

function localUrl(): string {
  const { port, host } = settings();
  const h = host === "0.0.0.0" || host === "::" || host === "" ? "localhost" : host.includes(":") ? `[${host}]` : host;
  return `http://${h}:${port}`;
}

async function healthy(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok && ((await r.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

async function waitHealthy(url: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await healthy(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function portFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}

function writeFile(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function refreshMenus() {
  sh("update-desktop-database", [appsDir]);
  sh("gtk-update-icon-cache", ["-q", "-t", "-f", iconsDir]);
}

function openUrl(url: string): boolean {
  for (const [cmd, args] of [
    ["xdg-open", [url]],
    ["gio", ["open", url]],
    ["sensible-browser", [url]],
  ] as const) {
    const r = spawnSync("sh", ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", cmd]);
    if (r.status !== 0) continue;
    spawn(cmd, [...args], { detached: true, stdio: "ignore" }).unref();
    return true;
  }
  return false;
}

function notify(title: string, body: string) {
  sh("notify-send", ["-a", "SPACE", "-i", ICON, title, body]);
}

function say(...lines: string[]) {
  console.log("\n  " + lines.join("\n  ") + "\n");
}

/* ------------------------------ команды ------------------------------ */

function systemdReady(): boolean {
  if (process.platform !== "linux") {
    say(
      "Служба ставится только на Linux с systemd.",
      process.platform === "win32" ? "На Windows SPACE запускается двойным щелчком по start.cmd." : "Здесь запускайте SPACE командой npm start.",
    );
    return false;
  }
  const r = sctl("show-environment");
  if (r.missing) {
    say("В этой системе нет systemd (например, WSL без systemd или контейнер).", "Запускайте SPACE командой npm start — или в Docker: docker compose up -d");
    return false;
  }
  if (!r.ok) {
    say(
      "Нет доступа к службам пользователя (systemctl --user).",
      "Обычно так бывает в сеансе su/sudo или по SSH без входа в систему.",
      "Войдите под своим пользователем обычным образом и повторите npm run service.",
      r.out ? `systemd: ${r.out}` : "",
    );
    return false;
  }
  return true;
}

async function install(): Promise<number> {
  if (!systemdReady()) return 1;
  const { port, host } = settings();
  const url = localUrl();
  const active = sctl("is-active", UNIT).out === "active";
  if (!active && !(await portFree(port, host))) {
    const ours = await healthy(url);
    say(
      `Порт ${port} уже занят ${ours ? "— SPACE уже запущен в другом окне" : "другой программой"}.`,
      ours ? "Остановите его (Ctrl+C в том окне) и повторите npm run service." : `Укажите другой порт в .env (PORT=8788) или найдите, кто его занял: ss -ltnp | grep ${port}`,
    );
    return 1;
  }

  const node = nodeBin();
  writeFile(unitPath, unitFile(node, ROOT));
  for (const [file, size] of ICONS) {
    const src = path.join(ROOT, "public", file);
    if (fs.existsSync(src)) {
      const dest = path.join(iconsDir, size, "apps", ICON + path.extname(file));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
  writeFile(desktopPath, desktopFile(node, ROOT));
  refreshMenus();

  const steps = [sctl("daemon-reload"), sctl("enable", UNIT), sctl("restart", UNIT)];
  const failed = steps.find((r) => !r.ok);
  if (failed) {
    say("systemd не смог запустить службу:", failed.out);
    return 1;
  }
  if (!(await waitHealthy(url, 20_000))) {
    say("Служба запущена, но SPACE не отвечает. Последние строки журнала:");
    sh("journalctl", ["--user", "-u", UNIT, "-n", "30", "--no-pager", "-o", "cat"], false);
    return 1;
  }

  const linger = sh("loginctl", ["show-user", os.userInfo().username, "--property=Linger", "--value"]).out;
  say(
    `SPACE работает как служба: ${url}`,
    "",
    "Он сам запускается при входе в систему и перезапускается при сбое.",
    "В меню приложений появился значок SPACE.",
    "",
    "журнал:       journalctl --user -u space -f",
    "перезапуск:   systemctl --user restart space",
    "убрать:       npm run service:remove",
    ...(linger === "no" ? ["", "Чтобы SPACE работал и без входа в систему (например, после перезагрузки", "для доступа с других устройств): loginctl enable-linger"] : []),
  );
  return 0;
}

function remove(): number {
  if (process.platform === "linux" && !sh("systemctl", ["--version"]).missing) {
    sctl("disable", "--now", UNIT);
  }
  let removed = false;
  for (const file of [unitPath, desktopPath, ...ICONS.map(([f, size]) => path.join(iconsDir, size, "apps", ICON + path.extname(f)))]) {
    try {
      fs.rmSync(file);
      removed = true;
    } catch {
      /* уже нет */
    }
  }
  if (process.platform === "linux") {
    sctl("daemon-reload");
    sctl("reset-failed", UNIT);
    refreshMenus();
  }
  say(removed ? "Служба SPACE и значок убраны. Доски и файлы остались в папке storage." : "Службы SPACE здесь нет.");
  return 0;
}

async function open(): Promise<number> {
  const url = localUrl();
  if (!(await healthy(url))) {
    if (fs.existsSync(unitPath)) sctl("start", UNIT);
    if (!(await waitHealthy(url, 20_000))) {
      notify("SPACE не запустился", "Подробности: journalctl --user -u space");
      console.error(`SPACE не отвечает на ${url}. Журнал: journalctl --user -u space`);
      return 1;
    }
  }
  if (!openUrl(url)) {
    console.log(url);
    notify("SPACE работает", url);
  }
  return 0;
}

async function main(cmd: string): Promise<number> {
  switch (cmd) {
    case "install":
      return install();
    case "remove":
    case "uninstall":
      return remove();
    case "open":
      return open();
    case "status":
      return sh("systemctl", ["--user", "status", UNIT, "--no-pager"], false).ok ? 0 : 1;
    case "logs":
      return sh("journalctl", ["--user", "-u", UNIT, "-f", "-o", "cat"], false).ok ? 0 : 1;
    default:
      say("node scripts/service.ts install | remove | open | status | logs");
      return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main(process.argv[2] || "install").then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
