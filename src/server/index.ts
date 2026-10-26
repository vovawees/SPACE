/* Точка входа: HTTP (Hono) + WebSocket /collab (Hocuspocus) на одном порту. */
import os from "node:os";
import type { IncomingMessage } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { app } from "./app.ts";
import { purgeDeleted } from "./boards.ts";
import { hocuspocus } from "./collab.ts";
import { config } from "./config.ts";
import { db, now, q } from "./db.ts";
import { pruneUnfurls } from "./unfurl.ts";
import { finalSnapshot } from "./history.ts";

const server = createAdaptorServer({ fetch: app.fetch, hostname: config.host });
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024, perMessageDeflate: false });

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // не браузер
  try {
    const host = new URL(origin).host;
    const fwd = config.trustProxy ? String(req.headers["x-forwarded-host"] || "") : "";
    return host === req.headers.host || (!!fwd && host === fwd);
  } catch {
    return false;
  }
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

server.on("upgrade", (req: IncomingMessage, socket, head) => {
  const url = new URL(req.url || "/", "http://local");
  if (url.pathname !== "/collab" || !sameOrigin(req)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    const request = new Request(`http://${req.headers.host || "local"}${req.url || "/"}`, { headers });
    const conn = hocuspocus.handleConnection(ws, request);
    let alive = true;
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 25_000);
    ws.on("message", (data) => conn.handleMessage(toBytes(data)));
    ws.on("pong", () => {
      alive = true;
      conn.touch();
    });
    ws.on("close", (code, reason) => {
      clearInterval(ping);
      conn.handleClose({ code, reason: reason.toString() });
    });
    ws.on("error", () => ws.terminate());
  });
});

/* Обслуживание: раз в 6 часов чистим старое. */
function maintain() {
  try {
    purgeDeleted();
    pruneUnfurls();
    q("DELETE FROM sessions WHERE seen_at < ?").run(now() - 400 * 86400_000);
    q("DELETE FROM login_links WHERE expires_at < ?").run(now());
  } catch (err) {
    console.error("[space] обслуживание:", err);
  }
}
maintain();
setInterval(maintain, 6 * 3600_000).unref();

/* Адреса для входа с других устройств. Мосты Docker, libvirt и виртуальных
   машин пропускаем: с телефона по ним всё равно не зайти. */
const VIRTUAL = /^(docker|br-|veth|virbr|vmnet|vboxnet|vnet|lxc|lxd|cni|flannel|podman|kube|cali|waydroid)/;
function addresses(): { url: string; label: string }[] {
  const port = config.port;
  const out = [{ url: `http://localhost:${port}`, label: "этот компьютер" }];
  if (config.host !== "0.0.0.0" && config.host !== "::") {
    if (config.host !== "127.0.0.1" && config.host !== "localhost" && config.host !== "::1") {
      out.push({ url: `http://${config.host.includes(":") ? `[${config.host}]` : config.host}:${port}`, label: "" });
    }
    return out;
  }
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      const [p1 = 0, p2 = 0] = a.address.split(".").map(Number);
      const tailscale = name.startsWith("tailscale") || (p1 === 100 && p2 >= 64 && p2 <= 127);
      out.push({ url: `http://${a.address}:${port}`, label: tailscale ? "Tailscale" : "локальная сеть" });
    }
  }
  return out;
}

server.on("error", (err: NodeJS.ErrnoException) => {
  const { port, host } = config;
  const otherPort = process.platform === "win32" ? "в файле .env: PORT=8788" : "PORT=8788 npm start (или PORT=8788 в .env)";
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Порт ${port} уже занят — наверное, SPACE уже запущен (в другом окне или как служба).`);
    console.error(`  Откройте http://localhost:${port} или запустите на другом порту: ${otherPort}\n`);
    process.exit(78); // служба systemd не будет перезапускать впустую
  }
  if (err.code === "EACCES") {
    console.error(`\n  Нет прав открыть порт ${port}: порты ниже 1024 доступны только администратору.`);
    console.error(`  Возьмите порт повыше: ${otherPort}\n`);
    process.exit(78);
  }
  if (err.code === "EADDRNOTAVAIL") {
    console.error(`\n  Адреса ${host} нет на этом компьютере. Проверьте HOST в .env: 0.0.0.0 — все адреса, 127.0.0.1 — только этот компьютер.\n`);
    process.exit(1); // например, Tailscale ещё не поднялся — служба попробует снова
  }
  console.error(err);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const list = addresses();
  const width = Math.max(...list.map((a) => a.url.length));
  console.log(`\n  SPACE ${config.version} · данные: ${config.storageDir}\n`);
  for (const a of list) console.log(`  → ${a.url.padEnd(width)}  ${a.label}`.trimEnd());
  console.log("");
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`\n[space] ${signal}: сохраняю доски…`);
  try {
    hocuspocus.flushPendingStores();
    await new Promise((r) => setTimeout(r, 300));
    for (const [name, doc] of hocuspocus.documents) finalSnapshot(name, doc);
  } catch (err) {
    console.error(err);
  }
  for (const ws of wss.clients) ws.terminate();
  server.close();
  db.close();
  process.exit(0);
}
// SIGHUP — закрыли окно терминала: тоже сохраняем доски, а не обрываем
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => void shutdown(sig));
