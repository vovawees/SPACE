/* Скриншоты основных экранов и сценариев (для ручной проверки вида).
   node tests/e2e/shots.ts http://localhost:8799 /tmp/shots */
import fs from "node:fs";
import type { Page } from "playwright";
import { launch } from "./browser.ts";

const base = process.argv[2] || "http://localhost:8799";
const out = process.argv[3] || "/tmp/shots";
const only = process.argv[4] || "";
fs.mkdirSync(out, { recursive: true });

const errors: string[] = [];
function watch(page: Page, tag: string) {
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`[${tag}] ${m.type()}: ${m.text().slice(0, 400)}`);
  });
}

async function api(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ([method, url, body]) => {
      const r = await fetch(url as string, { method: method as string, headers: { "x-space": "1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return r.json();
    },
    [method, url, body] as const,
  );
}

async function importBoard(page: Page, file: string): Promise<string> {
  const b64 = fs.readFileSync(file).toString("base64");
  const res = await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await fetch("/api/boards/import", { method: "POST", headers: { "x-space": "1", "content-type": "application/octet-stream" }, body: bin });
    return r.json();
  }, b64);
  return (res as { id: string }).id;
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${out}/${name}.png` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "ru-RU" });
  const page = await ctx.newPage();
  watch(page, "desk");
  await page.goto(base + "/");
  await sleep(600);
  if (!only || only === "welcome") await shot(page, "01-welcome");
  await api(page, "POST", "/api/auth/guest", { name: "Вова", color: "#5b9cf0" });
  const demo = await importBoard(page, "/tmp/demo.space");
  await page.goto(base + "/");
  await sleep(700);
  if (!only || only === "home") await shot(page, "02-home");

  await page.goto(`${base}/b/${demo}`);
  await page.waitForSelector(".node", { timeout: 8000 });
  await sleep(1200);
  await shot(page, "03-board");

  // выделить заметку
  const note = page.locator(".node.t-note").nth(1);
  await note.click();
  await sleep(300);
  await shot(page, "04-select-note");

  // контекстное меню
  await note.click({ button: "right" });
  await sleep(300);
  await shot(page, "05-context-menu");
  await page.keyboard.press("Escape");

  // редактирование
  await note.dblclick();
  await sleep(700);
  await page.keyboard.type(" Новый текст");
  await sleep(200);
  await shot(page, "06-edit-note");
  await page.keyboard.press("Escape");
  await sleep(200);

  // палитра
  await page.keyboard.press("Control+k");
  await sleep(300);
  await page.keyboard.type("код");
  await sleep(300);
  await shot(page, "07-palette");
  await page.keyboard.press("Escape");

  // инструмент «фигура» — полоса стиля
  await page.keyboard.press("r");
  await sleep(250);
  await page.mouse.move(1000, 640);
  await page.mouse.down();
  await page.mouse.move(1100, 700, { steps: 4 });
  await page.mouse.move(1180, 760, { steps: 4 });
  await shot(page, "08-drawing-shape");
  await page.mouse.up();
  await sleep(300);

  // рисование
  await page.keyboard.press("d");
  await sleep(200);
  await page.mouse.move(450, 640);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    await page.mouse.move(380 + Math.cos(a) * 70, 640 + Math.sin(a) * 50);
  }
  await page.mouse.up();
  await sleep(500);
  await shot(page, "09-smart-draw");
  await page.keyboard.press("Escape");

  // справка и доступ
  await page.keyboard.press("Shift+Slash");
  await sleep(300);
  await shot(page, "10-shortcuts");
  await page.keyboard.press("Escape");
  await sleep(150);
  await page.getByRole("button", { name: "Поделиться" }).click();
  await sleep(500);
  await shot(page, "11-share");
  await page.keyboard.press("Escape");

  // история версий и мини-карта
  await page.getByRole("button", { name: "История версий" }).click();
  await sleep(600);
  await shot(page, "17-history");
  await page.getByRole("button", { name: "История версий" }).click();
  await sleep(200);
  await page.getByRole("button", { name: "Меню доски" }).click();
  await sleep(250);
  await shot(page, "18-board-menu");
  await page.keyboard.press("Escape");

  // отдаление — дальний план
  await page.keyboard.press("Shift+1");
  await sleep(600);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 300);
    await sleep(60);
  }
  await sleep(700);
  await shot(page, "12-zoomed-out");

  // другой акцент и фон доски — на чистой копии демо (без следов сценариев выше)
  const fresh = await importBoard(page, "/tmp/demo.space");
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("space:settings") || "{}");
    s.accent = "violet";
    s.gridStyle = "cross";
    localStorage.setItem("space:settings", JSON.stringify(s));
  });
  await page.goto(`${base}/b/${fresh}`);
  await page.waitForSelector(".node", { timeout: 8000 });
  await page.evaluate(() => (window as unknown as { __board: { store: { setBg(v: string): void } } }).__board.store.setBg("midnight"));
  await sleep(1000);
  await page.keyboard.press("Shift+1");
  await sleep(700);
  await shot(page, "13-backdrop");
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("space:settings") || "{}");
    s.accent = "orange";
    s.gridStyle = "dots";
    localStorage.setItem("space:settings", JSON.stringify(s));
  });

  // телефон
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" });
  await mctx.addCookies(await ctx.cookies());
  await mctx.addInitScript(() => localStorage.setItem("space:debug", "1"));
  const m = await mctx.newPage();
  watch(m, "mobile");
  await m.goto(`${base}/`);
  await sleep(700);
  await shot(m, "14-mobile-home");
  await m.goto(`${base}/b/${fresh}`);
  await m.waitForSelector(".board", { timeout: 8000 });
  await sleep(1500);
  await shot(m, "15-mobile-board");
  await m.getByRole("button", { name: "Ещё инструменты" }).click();
  await sleep(300);
  await shot(m, "16-mobile-more");
  await m.keyboard.press("Escape");
  // крупный план первой рамки — для README
  await m.evaluate(() => {
    type V = { type: string };
    const b = (window as unknown as { __board: { store: { order: V[]; bounds(v: V): { x: number; y: number; w: number; h: number } }; camera: { fit(r: object, o: object): void } } }).__board;
    const f = b.store.order.find((v) => v.type === "frame")!;
    const r = b.store.bounds(f);
    b.camera.fit({ x: r.x, y: r.y - 20, w: Math.min(r.w, 620), h: r.h + 20 }, { pad: 10, maxZoom: 1, animate: false });
  });
  await m.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await sleep(1200);
  await shot(m, "19-mobile-zoomed");
  await m.close();
  await mctx.close();
  await ctx.close();
} finally {
  await browser.close();
  console.log(errors.length ? errors.join("\n") : "no console errors");
}
