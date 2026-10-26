/* Функциональные сценарии в настоящем браузере (Playwright + Chromium):
   правка, перетаскивание и отмена, стрелки с привязкой, загрузка картинки,
   совместная работа двух людей, история версий, доступ «только просмотр»,
   жесты на телефоне.
   node tests/e2e/flows.ts http://localhost:8787 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import type { Browser, BrowserContext, Page } from "playwright";
import { launch } from "./browser.ts";

const base = process.argv[2] || "http://localhost:8787";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const errors: string[] = [];
function ok(cond: unknown, name: string, extra = "") {
  if (!cond) failed++;
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? ` — ${extra}` : ""}`);
}

interface N {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  props: Record<string, unknown>;
}

const nodes = (p: Page) =>
  p.evaluate(() => {
    const b = (window as any).__board;
    return [...b.store.views.values()].map((v: any) => ({ id: v.id, type: v.type, x: v.x, y: v.y, w: v.w, h: v.h, text: v.textValue, props: JSON.parse(JSON.stringify(v.props)) }));
  }) as Promise<N[]>;

async function until<T>(fn: () => Promise<T>, test: (v: T) => boolean, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!test(v) && Date.now() < end) {
    await sleep(80);
    v = await fn();
  }
  return v;
}

function watch(page: Page, tag: string) {
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${tag}] ${m.text().slice(0, 300)}`);
  });
}

async function person(browser: Browser, name: string, color: string, mobile = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" }
      : { viewport: { width: 1440, height: 900 }, locale: "ru-RU" },
  );
  await ctx.addInitScript(() => localStorage.setItem("space:debug", "1"));
  const page = await ctx.newPage();
  watch(page, name);
  await page.goto(base + "/");
  await page.evaluate(
    async ([name, color]) => {
      await fetch("/api/auth/guest", { method: "POST", headers: { "x-space": "1", "content-type": "application/json" }, body: JSON.stringify({ name, color }) });
    },
    [name, color],
  );
  return { ctx, page };
}

const api = (p: Page, method: string, url: string, body?: unknown) =>
  p.evaluate(
    async ([method, url, body]) => {
      const r = await fetch(url as string, { method: method as string, headers: { "x-space": "1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return r.json();
    },
    [method, url, body] as const,
  );

async function openBoard(p: Page, id: string) {
  await p.goto(`${base}/b/${id}`);
  await p.waitForSelector(".board", { timeout: 10000 });
  await p.waitForFunction(() => (window as any).__board?.synced === true, null, { timeout: 10000 });
  await sleep(300);
}

async function center(p: Page, sel: string) {
  const r = await p.locator(sel).first().boundingBox();
  if (!r) throw new Error(`нет элемента ${sel}`);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function drag(p: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps });
  await p.mouse.up();
}

const browser = await launch();
const t0 = Date.now();
try {
  const A = await person(browser, "Аня", "#5b9cf0");
  const a = A.page;
  const board = (await api(a, "POST", "/api/boards", { title: "Проверка" })) as { id: string };
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "edit" });
  await openBoard(a, board.id);

  console.log("Правка");
  await a.mouse.dblclick(520, 360);
  await a.waitForSelector(".cm-editor", { timeout: 5000 });
  await a.keyboard.type("Привет **мир**");
  await a.keyboard.press("Escape");
  await sleep(250);
  let ns = await nodes(a);
  ok(ns.length === 1 && ns[0]!.type === "note", "двойной щелчок создаёт заметку", `${ns.length} узл.`);
  ok(ns[0]?.text === "Привет **мир**", "текст сохранён", JSON.stringify(ns[0]?.text));
  ok((await a.locator(".node.t-note strong").first().textContent()) === "мир", "Markdown отрисован");

  console.log("Перетаскивание и отмена");
  const x0 = ns[0]!.x;
  const c0 = await center(a, ".node.t-note");
  await drag(a, c0, { x: c0.x + 240, y: c0.y + 40 });
  await sleep(150);
  ns = await nodes(a);
  const zoom = await a.evaluate(() => (window as any).__board.camera.z);
  ok(Math.abs(ns[0]!.x - x0 - 240 / zoom) < 12, "узел сдвинулся вслед за курсором", `dx=${(ns[0]!.x - x0).toFixed(0)} при z=${zoom.toFixed(2)}`);
  await a.keyboard.press("Control+z");
  await sleep(150);
  ns = await nodes(a);
  ok(Math.abs(ns[0]!.x - x0) < 1, "Ctrl+Z возвращает на место");
  await a.keyboard.press("Control+Shift+z");
  await sleep(150);
  ns = await nodes(a);
  ok(Math.abs(ns[0]!.x - x0) > 100, "Ctrl+Shift+Z повторяет");
  ok(ns.length === 1 && ns[0]!.text === "Привет **мир**", "отмена перемещения не трогает текст");

  console.log("Вторая заметка и стрелка");
  await a.keyboard.press("n");
  await a.mouse.click(1060, 420);
  await a.waitForSelector(".cm-editor", { timeout: 5000 });
  await a.keyboard.type("Второй");
  await a.keyboard.press("Escape");
  await sleep(200);
  ns = await nodes(a);
  ok(ns.filter((n) => n.type === "note").length === 2, "инструмент «заметка» + щелчок");
  const notes = await a.locator(".node.t-note").all();
  const r1 = (await notes[0]!.boundingBox())!;
  const r2 = (await notes[1]!.boundingBox())!;
  await a.keyboard.press("a");
  await drag(a, { x: r1.x + r1.width / 2, y: r1.y + r1.height / 2 }, { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2 }, 14);
  await sleep(250);
  ns = await nodes(a);
  const arrow = ns.find((n) => n.type === "path");
  ok(!!arrow, "стрелка создана");
  ok(!!arrow?.props.b0 && !!arrow?.props.b1, "оба конца привязаны к заметкам", JSON.stringify({ b0: !!arrow?.props.b0, b1: !!arrow?.props.b1 }));
  await a.keyboard.press("Escape");
  await a.keyboard.press("v");
  // сдвигаем вторую заметку — стрелка следует
  const ends = () =>
    a.evaluate((id) => {
      const st = (window as any).__board.store;
      const pts = st.pathPoints(st.get(id));
      return pts[pts.length - 1] as { x: number; y: number };
    }, arrow!.id);
  const before = await ends();
  const c2 = await center(a, `.node[data-id="${ns.find((n) => n.text === "Второй")!.id}"]`);
  await drag(a, c2, { x: c2.x, y: c2.y + 200 });
  await sleep(200);
  const after = await ends();
  ok(after.y - before.y > 150, "стрелка тянется за заметкой", `конец y ${before.y.toFixed(0)} → ${after.y.toFixed(0)}`);

  console.log("Загрузка картинки");
  execFileSync("magick", ["-size", "640x400", "gradient:#5b9cf0-#c86bfa", "/tmp/e2e-image.png"]);
  const chooser = a.waitForEvent("filechooser");
  await a.getByRole("button", { name: "Загрузить файлы" }).click();
  await (await chooser).setFiles("/tmp/e2e-image.png");
  await a.waitForSelector(".node.t-image img", { timeout: 8000 });
  const loaded = await a.waitForFunction(() => {
    const img = document.querySelector(".node.t-image img") as HTMLImageElement | null;
    return !!img && img.complete && img.naturalWidth === 640;
  }, null, { timeout: 8000 }).then(() => true, () => false);
  ok(loaded, "картинка загрузилась на сервер и показана");
  ns = await nodes(a);
  const img = ns.find((n) => n.type === "image");
  ok(!!img && !img.props.pending && typeof img.props.src === "string", "у картинки есть адрес файла", String(img?.props.src).slice(0, 16));

  console.log("Совместная работа");
  const B = await person(browser, "Боря", "#f0a35b");
  const bp = B.page;
  await openBoard(bp, board.id);
  let nb = await until(() => nodes(bp), (v) => v.length === ns.length);
  ok(nb.length === ns.length, "второй участник видит все узлы", `${nb.length}/${ns.length}`);
  ok((await bp.evaluate(() => (window as any).__board.role)) === "editor", "по ссылке — редактор");
  await a.keyboard.press("n");
  await a.mouse.click(700, 700);
  await a.waitForSelector(".cm-editor");
  await a.keyboard.type("Из A");
  await a.keyboard.press("Escape");
  nb = await until(() => nodes(bp), (v) => v.some((n) => n.text === "Из A"), 3000);
  ok(nb.some((n) => n.text === "Из A"), "правка Ани приходит Боре вживую");
  await bp.mouse.move(600, 500);
  await bp.mouse.move(640, 520, { steps: 5 });
  const cursor = await a.waitForSelector(".cursor", { timeout: 3000 }).then(() => true, () => false);
  ok(cursor, "курсор Бори виден Ане");
  const people = await a.locator(".people > *").count();
  ok(people >= 1, "Боря в списке участников", String(people));

  console.log("История версий");
  await a.getByRole("button", { name: "История версий" }).click();
  await a.getByRole("button", { name: "Сохранить текущую версию" }).click();
  await a.getByPlaceholder("Название версии").fill("Перед чисткой");
  await a.getByRole("button", { name: "Сохранить", exact: true }).click();
  await a.waitForSelector(".snap-label", { timeout: 4000 });
  ok((await a.locator(".snap-label").first().textContent())?.includes("Перед чисткой"), "версия сохранена с названием");
  await a.keyboard.press("Escape");
  await a.mouse.click(1300, 150);
  await a.keyboard.press("Control+a");
  await a.keyboard.press("Delete");
  await sleep(200);
  ok((await nodes(a)).length === 0, "Ctrl+A, Delete — доска пуста");
  nb = await until(() => nodes(bp), (v) => v.length === 0, 3000);
  ok(nb.length === 0, "у Бори тоже пусто");
  if (!(await a.locator(".snap-main").first().isVisible())) await a.getByRole("button", { name: "История версий" }).click();
  await a.locator(".snap-main").first().click();
  await a.waitForSelector(".node", { timeout: 5000 });
  ok(await a.evaluate(() => !!(window as any).__board.preview), "просмотр версии открыт");
  await a.getByRole("button", { name: "Восстановить", exact: true }).click();
  await a.locator("[role=dialog] .btn.primary", { hasText: "Восстановить" }).click();
  nb = await until(() => nodes(bp), (v) => v.length === ns.length + 1, 5000);
  ok(nb.length === ns.length + 1, "восстановление вернуло узлы у всех", `${nb.length}`);

  console.log("Только просмотр");
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "view" });
  const C = await person(browser, "Вика", "#6bd38f");
  const cp = C.page;
  await openBoard(cp, board.id);
  ok(await cp.evaluate(() => (window as any).__board.readonly === true), "зритель в режиме чтения");
  await cp.keyboard.press("n");
  ok((await cp.evaluate(() => (window as any).__board.tool)) !== "note", "инструменты правки недоступны");
  await cp.evaluate(() => {
    const b = (window as any).__board;
    b.store.create({ type: "note", x: 0, y: 0, w: 200, h: 120 });
  });
  await sleep(800);
  ok(!(await nodes(a)).some((n) => n.x === 0 && n.y === 0 && n.w === 200 && n.h === 120), "сервер не принимает правки от зрителя");
  await C.ctx.close();

  console.log("Телефон: жесты");
  const M = await person(browser, "Миша", "#c86bfa", true);
  const mp = M.page;
  await api(a, "PATCH", `/api/boards/${board.id}`, { linkAccess: "edit" });
  await openBoard(mp, board.id);
  const cdp = await M.ctx.newCDPSession(mp);
  const touch = (type: string, pts: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) } as never);
  const camOf = () => mp.evaluate(() => ({ x: (window as any).__board.camera.x, y: (window as any).__board.camera.y, z: (window as any).__board.camera.z }));
  const c1 = await camOf();
  await touch("touchStart", [{ x: 200, y: 300 }]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: 200 - i * 10, y: 300 - i * 12 }]);
  await touch("touchEnd", []);
  await sleep(150);
  const c2m = await camOf();
  ok(Math.hypot(c2m.x - c1.x, c2m.y - c1.y) > 40, "один палец по пустому месту двигает доску");
  await touch("touchStart", [{ x: 150, y: 400 }, { x: 240, y: 400 }]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: 150 - i * 10, y: 400 }, { x: 240 + i * 10, y: 400 }]);
  await touch("touchEnd", []);
  await sleep(150);
  const c3 = await camOf();
  ok(c3.z > c2m.z * 1.3, "щипок приближает", `${c2m.z.toFixed(2)} → ${c3.z.toFixed(2)}`);
  ok((await mp.locator(".tools .tool").count()) <= 8, "компактная панель инструментов", String(await mp.locator(".tools .tool").count()));
  await M.ctx.close();
  await B.ctx.close();
  await A.ctx.close();
} catch (e) {
  failed++;
  console.log("  ✗ сценарий прерван:", (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
}
if (errors.length) console.log("Ошибки консоли:\n" + errors.slice(0, 12).join("\n"));
console.log(failed ? `\nПровалено проверок: ${failed}` : `\nВсё прошло (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
process.exit(failed ? 1 : 0);
