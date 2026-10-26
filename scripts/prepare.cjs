/* Подготовка перед запуском. Вызывается сама из npm start / dev / build / test,
   поэтому после распаковки архива или git pull хватает одной команды: npm start.

   1. Node.js нужной версии — иначе подсказка, как поставить его на этой системе.
   2. Зависимости стоят и совпадают с package-lock.json — иначе npm ci.
   3. Клиент собран из текущих исходников — иначе npm run build. Свежесть
      проверяется по хешу исходников, а не по датам файлов: распаковка и git
      даты не сохраняют.

   Файл нарочно на старом синтаксисе (require, без ?. и ??): он должен хотя бы
   запуститься и объяснить, что делать, даже на старом Node из дистрибутива.

     node scripts/prepare.cjs deps    — пункты 1–2 (dev, build, test)
     node scripts/prepare.cjs start   — пункты 1–3
     node scripts/prepare.cjs stamp   — запомнить хеш после сборки
     SPACE_SKIP_PREPARE=1             — ничего не проверять */
"use strict";
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var child = require("child_process");

var ROOT = path.resolve(__dirname, "..");
var NEED = [22, 18];
var STAMP = path.join(ROOT, "node_modules", ".space-build");
var BUILD_INPUTS = [
  "index.html",
  "vite.config.ts",
  "svelte.config.js",
  "tsconfig.json",
  "package-lock.json",
  "public",
  "src/client",
  "src/shared",
];

function say(lines) {
  console.log("\n  " + lines.join("\n  ") + "\n");
}

/* ------------------------------ Node.js ------------------------------ */

function nodeOk() {
  var v = process.versions.node.split(".").map(Number);
  return v[0] > NEED[0] || (v[0] === NEED[0] && v[1] >= NEED[1]);
}

function osRelease() {
  var out = {};
  try {
    fs.readFileSync("/etc/os-release", "utf8")
      .split("\n")
      .forEach(function (line) {
        var m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      });
  } catch (e) {
    /* не Linux или нет файла */
  }
  return out;
}

/** Как поставить свежий Node.js именно здесь. */
function installHint() {
  if (process.platform === "win32") return ["winget install OpenJS.NodeJS.LTS", "или установщик с https://nodejs.org/"];
  if (process.platform === "darwin") return ["brew install node", "или установщик с https://nodejs.org/"];
  var os = osRelease();
  var ids = ((os.ID || "") + " " + (os.ID_LIKE || "")).toLowerCase().split(/\s+/);
  var has = function (x) {
    return ids.indexOf(x) >= 0;
  };
  var lines = [];
  if (has("arch")) lines.push("sudo pacman -S nodejs npm");
  else if (has("debian") || has("ubuntu"))
    lines.push("curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -", "sudo apt-get install -y nodejs");
  else if (has("fedora") || has("rhel") || has("centos")) lines.push("sudo dnf install nodejs npm");
  else if (has("suse") || has("opensuse")) lines.push("sudo zypper install nodejs npm");
  else if (has("alpine")) lines.push("sudo apk add nodejs npm");
  lines.push(
    (lines.length ? "или " : "") + "без прав администратора, через fnm:",
    "  curl -fsSL https://fnm.vercel.app/install | bash",
    "  fnm install --lts      (потом откройте новый терминал)",
  );
  return lines;
}

/* ---------------------------- зависимости ---------------------------- */

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  } catch (e) {
    return null;
  }
}

/** Все нужные пакеты стоят ровно тех версий, что записаны в package-lock.json. */
function depsOk(withDev) {
  var pkg = readJson("package.json") || {};
  var lock = readJson("package-lock.json");
  var names = Object.keys(pkg.dependencies || {});
  if (withDev) names = names.concat(Object.keys(pkg.devDependencies || {}));
  for (var i = 0; i < names.length; i++) {
    var installed = readJson(path.join("node_modules", names[i], "package.json"));
    if (!installed) return false;
    var locked = lock && lock.packages && lock.packages["node_modules/" + names[i]];
    if (locked && locked.version && locked.version !== installed.version) return false;
  }
  return true;
}

/** npm — тот же, что запустил скрипт (с пробелами и кириллицей в путях — без оболочки). */
function npm(args) {
  var exec = process.env.npm_execpath;
  var r;
  if (exec && /\.[cm]?js$/.test(exec)) {
    r = child.spawnSync(process.execPath, [exec].concat(args), { cwd: ROOT, stdio: "inherit" });
  } else {
    var win = process.platform === "win32";
    r = child.spawnSync(win ? "npm.cmd" : "npm", args, { cwd: ROOT, stdio: "inherit", shell: win });
  }
  return r.status === 0;
}

function install(withDev) {
  var extra = ["--no-audit", "--no-fund"];
  if (withDev) extra.push("--include=dev");
  var hasLock = fs.existsSync(path.join(ROOT, "package-lock.json"));
  say(["Ставлю зависимости — в первый раз это займёт минуту-другую…"]);
  if (hasLock && npm(["ci"].concat(extra))) return true;
  return npm(["install"].concat(extra));
}

/* ------------------------------- сборка ------------------------------- */

function listFiles(rel, out) {
  var abs = path.join(ROOT, rel);
  var st;
  try {
    st = fs.statSync(abs);
  } catch (e) {
    return;
  }
  if (st.isDirectory()) {
    fs.readdirSync(abs)
      .sort()
      .forEach(function (name) {
        listFiles(rel + "/" + name, out);
      });
  } else out.push(rel);
}

function sourceHash() {
  var files = [];
  BUILD_INPUTS.forEach(function (rel) {
    listFiles(rel, files);
  });
  var h = crypto.createHash("sha256");
  files.forEach(function (rel) {
    h.update(rel + "\0");
    h.update(fs.readFileSync(path.join(ROOT, rel)));
    h.update("\0");
  });
  return h.digest("hex");
}

function buildFresh() {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) return false;
  try {
    return fs.readFileSync(STAMP, "utf8").trim() === sourceHash();
  } catch (e) {
    return false;
  }
}

/* -------------------------------- ход -------------------------------- */

function main() {
  var mode = process.argv[2] || "start";
  if (process.env.SPACE_SKIP_PREPARE === "1") return 0;

  if (mode === "stamp") {
    fs.mkdirSync(path.dirname(STAMP), { recursive: true });
    fs.writeFileSync(STAMP, sourceHash() + "\n");
    return 0;
  }

  if (!nodeOk()) {
    say(
      ["SPACE нужен Node.js " + NEED.join(".") + " или новее (лучше 24 LTS), а сейчас " + process.versions.node + "."]
        .concat(["", "Как поставить:"])
        .concat(installHint().map(function (l) {
          return "  " + l;
        })),
    );
    return 1;
  }

  // готовой сборке dev-зависимости (Vite и компания) не нужны
  var needBuild = mode === "start" && !buildFresh();
  var withDev = mode !== "start" || needBuild;
  if (!depsOk(withDev)) {
    if (!install(withDev) || !depsOk(withDev)) {
      say(["Не получилось поставить зависимости — ошибка выше.", "Проверьте интернет и повторите: npm install"]);
      return 1;
    }
  }

  if (needBuild) {
    say(["Собираю клиент…"]);
    if (!npm(["run", "build"])) return 1;
  }
  return 0;
}

process.exit(main());
