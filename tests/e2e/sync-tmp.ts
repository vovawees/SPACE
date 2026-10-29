/* ВРЕМЕННО: синхронизация после смены доступа по ссылке. */
import { launch } from "./browser.ts";
const base = process.argv[2] || "http://127.0.0.1:8811";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await launch();
async function person(name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, locale: "ru-RU" });
  await ctx.addInitScript(() => localStorage.setItem("space:debug", "1"));
  const page = await ctx.newPage();
  page.on("console", (m) => (m.type() === "error" || m.text().includes("[space]")) && console.log(`[${name}]`, m.text().slice(0, 200)));
  await page.goto(base + "/");
  await page.evaluate((name) => fetch("/api/auth/guest", { method: "POST", headers: { "x-space": "1", "content-type": "application/json" }, body: JSON.stringify({ name, color: "#5b9cf0" }) }), name);
  return page;
}
const api = (p: any, method: string, url: string, body?: unknown) =>
  p.evaluate(async ([method, url, body]: any) => (await fetch(url, { method, headers: { "x-space": "1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json(), [method, url, body]);
const open = async (p: any, id: string) => {
  await p.goto(`${base}/b/${id}`);
  await p.waitForFunction(() => (window as any).__board?.synced === true, null, { timeout: 10000 });
};
const count = (p: any) => p.evaluate(() => (window as any).__board.store.views.size);
const state = (p: any) => p.evaluate(() => { const b = (window as any).__board; return { st: b.status, ro: b.readonly, role: b.role, n: b.store.views.size }; });
const add = (p: any, x: number) => p.evaluate((x: number) => (window as any).__board.store.create({ type: "note", x, y: 0, w: 100, h: 80 }), x);
try {
  const a = await person("Аня");
  const board = await api(a, "POST", "/api/boards", { title: "Синк" });
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "edit" });
  await open(a, board.id);
  const b = await person("Боря");
  await open(b, board.id);
  await add(a, 0);
  await sleep(500);
  console.log("start", await count(a), await count(b), await state(b));
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "view" });
  await sleep(1500);
  console.log("after view", await state(b));
  await add(a, 200);
  await sleep(800);
  console.log("A adds while B viewer", await count(a), await count(b));
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "edit" });
  await sleep(1500);
  console.log("after edit", await state(b));
  await add(a, 400);
  await sleep(1000);
  console.log("A adds after edit", await count(a), await count(b));
  await add(b, 600);
  await sleep(1000);
  console.log("B adds", await count(a), await count(b));
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "view" });
  const c = await person("Вика");
  await open(c, board.id);
  console.log("C as viewer", await state(c));
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "edit" });
  await sleep(2000);
  console.log("C after edit", await state(c));
  await add(c, 800);
  await sleep(1000);
  console.log("C adds", await count(a), await count(b), await count(c));
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "view" });
  await sleep(2000);
  console.log("C after view again", await state(c));
} finally {
  await browser.close();
}
