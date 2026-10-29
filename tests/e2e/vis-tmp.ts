/* ВРЕМЕННО (удалить перед архивом): визуальные проверки. node tests/e2e/vis-tmp.ts <сценарий> */
import type { Page } from "playwright";
import { launch } from "./browser.ts";
const base = "http://127.0.0.1:8811";
const SHOTS = "/data/space_project/shots";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const which = process.argv[2] || "knob";
const mobile = process.argv.includes("--mobile");
const browser = await launch();
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" } : { viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
await ctx.addInitScript(() => localStorage.setItem("space:debug", "1"));
const p = await ctx.newPage();
const errs: string[] = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await p.goto(base + "/");
await p.evaluate(() => fetch("/api/auth/guest", { method: "POST", headers: { "x-space": "1", "content-type": "application/json" }, body: JSON.stringify({ name: "Вова", color: "#5b9cf0" }) }));
const board = await p.evaluate(async () => (await (await fetch("/api/boards", { method: "POST", headers: { "x-space": "1", "content-type": "application/json" }, body: JSON.stringify({ title: "Проверка" }) })).json()) as { id: string });
await p.goto(`${base}/b/${board.id}`);
await p.waitForFunction(() => (window as any).__board?.synced === true, null, { timeout: 20000 });
await sleep(600);
const ev = <T>(fn: (b: any) => T) => p.evaluate(`(${fn.toString()})(window.__board)`) as Promise<T>;
const shot = (name: string) => p.screenshot({ path: `${SHOTS}/${name}.png` });
const count = () => ev((b) => b.store.views.size as number);

async function knob(p: Page) {
  const id = await ev((b) => {
    b.camera.z = 1;
    const c = b.camera.center;
    const id = b.store.create({ type: "note", x: Math.round(c.x - 120), y: Math.round(c.y - 70), w: 240, h: 140, color: "yellow" });
    b.store.selection.set([id]);
    return id;
  });
  await sleep(400);
  const r = await p.locator(`[data-id="${id}"]`).boundingBox();
  console.log("note box", r);
  if (!r) return;
  // подходим к правому краю снаружи
  const ex = r.x + r.width;
  const cy = r.y + r.height / 2 + 30;
  for (let i = 0; i <= 10; i++) { await p.mouse.move(ex - 40 + i * 4, cy); await sleep(16); }
  await sleep(300);
  let k = await p.locator(".knob").boundingBox().catch(() => null);
  console.log("knob after approach", k);
  await shot("knob-1");
  if (!k) return;
  // идём к центру кнопки
  const tx = k.x + k.width / 2, ty = k.y + k.height / 2;
  const sx = ex + 2, sy = cy;
  for (let i = 1; i <= 12; i++) { await p.mouse.move(sx + ((tx - sx) * i) / 12, sy + ((ty - sy) * i) / 12); await sleep(16); }
  await sleep(250);
  k = await p.locator(".knob").boundingBox().catch(() => null);
  const near = await p.locator(".knob.near").count();
  const top = await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.className + " | " + (el.closest("[data-handle]")?.getAttribute("data-handle") ?? "") : "none"; }, [tx, ty]);
  console.log("knob on hover", k, "near", near, "element at point:", top);
  await shot("knob-2");
  const before = await count();
  await p.mouse.down(); await sleep(60); await p.mouse.up();
  await sleep(500);
  console.log("click: nodes", before, "->", await count());
  await shot("knob-3");
  // перетаскивание от «+» — стрелка
  await ev((b) => { b.store.selection.set([b.store.order.find((v: any) => v.type === "note").id]); b.camera.z = 1; });
  await sleep(300);
  const r2 = (await p.locator(`[data-id="${id}"]`).boundingBox())!;
  await p.mouse.move(r2.x + r2.width / 2, r2.y + 20, { steps: 3 });
  await p.mouse.move(r2.x + r2.width / 2 + 10, r2.y - 21, { steps: 8 });
  await sleep(300);
  const k2 = await p.locator(".knob").boundingBox().catch(() => null);
  console.log("knob top", k2, "ptr", r2.x + r2.width / 2 + 10, r2.y - 21);
  const n0 = await count();
  await p.mouse.down();
  await p.mouse.move(r2.x + r2.width / 2 + 10, r2.y - 200, { steps: 10 });
  await p.mouse.up();
  await sleep(400);
  console.log("drag: nodes", n0, "->", await count(), await ev((b) => b.store.order.map((v: any) => v.type).join(",")));
  await shot("knob-4");
}

async function stickers(p: Page) {
  const rail = await p.locator(".lib-rail button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  console.log("rail:", rail);
  await p.locator('.lib-rail button[aria-label="Стикеры"]').click();
  await sleep(500);
  await shot("stickers-1");
  const n = await p.locator(".lib-emoji").count();
  console.log("emoji tiles", n);
  const before = await count();
  await p.locator(".lib-emoji").first().click();
  await sleep(700);
  console.log("after click nodes", before, "->", await count(), await ev((b) => [...b.store.views.values()].map((v: any) => v.type + ":" + JSON.stringify(v.props).slice(0, 80))));
  await shot("stickers-2");
}

async function knobdbg(p: Page) {
  const id = await ev((b) => {
    b.camera.z = 1;
    const c = b.camera.center;
    const id = b.store.create({ type: "note", x: Math.round(c.x - 120), y: Math.round(c.y - 70), w: 240, h: 140, color: "yellow" });
    b.store.selection.set([id]);
    return id;
  });
  await sleep(400);
  const r = (await p.locator(`[data-id="${id}"]`).boundingBox())!;
  const pts: [number, number][] = [[r.x + 60, r.y - 12], [r.x + 60, r.y - 22], [r.x + 100, r.y - 22], [r.x + 100, r.y - 30], [r.x + r.width + 20, r.y + 20]];
  for (const [x, y] of pts) {
    await p.mouse.move(x, y, { steps: 6 });
    await sleep(400);
    const d = await p.evaluate(([x, y]) => {
      const b = (window as any).__board;
      const k = document.querySelector(".knob") as HTMLElement | null;
      const dot = document.querySelector(".knob-dot") as HTMLElement | null;
      const v = b.store.views.values().next().value;
      const bb = k?.getBoundingClientRect();
      const at = document.elementFromPoint(x, y);
      return { ptr: [x, y], hover: b.ix.hover && [Math.round(b.ix.hover.x), Math.round(b.ix.hover.y)], hoverNode: b.ix.hoverNode, kstyle: k?.style.transform, kcenter: bb && [Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)], dot: dot?.style.transform, node: [v.x, v.y, v.w, v.H], cam: [b.camera.x, b.camera.y, b.camera.z], at: at?.className?.toString().slice(0, 40), overlayRect: (() => { const o = k?.offsetParent as HTMLElement | null; const q = o?.getBoundingClientRect(); return o ? [o.className.slice(0, 30), Math.round(q!.x), Math.round(q!.y)] : null; })() };
    }, [x, y]);
    console.log(JSON.stringify(d));
  }
}

async function rail(p: Page) {
  const cats = await p.locator(".lib-rail button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));
  for (const round of [1, 2]) {
    for (const c of cats) {
      const t0 = Date.now();
      await p.locator(`.lib-rail button[aria-label="${c}"]`).click();
      let title = "";
      for (let i = 0; i < 100; i++) {
        title = (await p.locator(".lib-title").textContent().catch(() => "")) ?? "";
        if (title === c) break;
        await sleep(20);
      }
      const longT = await p.evaluate(() => { const f = performance.getEntriesByType("longtask") as any[]; return f.length; }).catch(() => 0);
      console.log(`round ${round} ${c.padEnd(18)} -> "${title}" ${Date.now() - t0}ms`);
    }
  }
  // повторный щелчок по открытому — закрыть, ещё щелчок — открыть
  const c = "Шаблоны";
  await p.locator(`.lib-rail button[aria-label="${c}"]`).click();
  await sleep(300);
  console.log("after click on open Шаблоны: open =", await p.locator(".lib").count());
  await p.locator(`.lib-rail button[aria-label="${c}"]`).click();
  await sleep(300);
  console.log("click again: open =", await p.locator(".lib").count(), await p.locator(".lib-title").textContent().catch(() => ""));
  // перф: время рендера раздела шаблонов
  const ms = await p.evaluate(async () => {
    const st = performance.now();
    (document.querySelector('.lib-rail button[aria-label="Игры и встречи"]') as HTMLElement).click();
    await new Promise((r) => requestAnimationFrame(() => r(0)));
    const a = performance.now();
    (document.querySelector('.lib-rail button[aria-label="Шаблоны"]') as HTMLElement).click();
    await new Promise((r) => requestAnimationFrame(() => r(0)));
    return [a - st, performance.now() - a];
  });
  console.log("render ms games/templates", ms.map(Math.round));
}

async function rail2(p: Page) {
  const seq = ["Объекты", "Стикеры", "Шаблоны", "Игры и встречи", "Шаблоны", "Фигуры"];
  for (const c of seq) {
    await p.locator(`.lib-rail button[aria-label="${c}"]`).click();
    await sleep(350);
    const title = await p.locator(".lib-title").textContent({ timeout: 500 }).catch(() => "—");
    const pressed = await p.locator(`.lib-rail button[aria-label="${c}"]`).getAttribute("aria-pressed");
    console.log(`click ${c.padEnd(16)} panel="${title}" pressed=${pressed} asides=${await p.locator("aside.lib").count()}`);
  }
}

async function tpl(p: Page) {
  const name = process.argv[3] || "Решаем";
  await p.locator('.lib-rail button[aria-label="Шаблоны"]').click();
  await sleep(300);
  await p.locator(".lib-tpl", { hasText: name }).first().click();
  await sleep(900);
  await p.keyboard.press("Escape");
  await ev((b) => { b.store.selection.clear?.(); });
  await sleep(300);
  // поставить оценку 4 в первой «Оценке»
  const stars = p.locator(".rt-ico");
  console.log("stars", await stars.count());
  if (await stars.count()) {
    await stars.nth(3).click();
    await sleep(300);
    // приблизить к первой оценке
    await ev((b) => { const v = b.store.order.find((v: any) => v.type === "rating"); b.camera.z = 2.2; const c = { x: v.x + v.w / 2, y: v.y + v.h / 2 }; b.camera.x = b.camera.vw / 2 - c.x * 2.2; b.camera.y = b.camera.vh / 2 - c.y * 2.2; b.store.selection.set([]); });
    await p.mouse.move(5, 450);
    await sleep(900);
  }
  await shot("tpl-" + (process.argv[4] || "a"));
}

async function frames(p: Page) {
  const dump = () => ev((b) => { const f = b.store.order.find((v: any) => v.type === "frame"); return b.store.order.map((v: any) => `${v.type}${v.id === f?.id ? "*" : ""} ${Math.round(v.x)},${Math.round(v.y)} parent=${v.parent === f?.id ? "F" : v.parent ?? "-"}`); });
  await p.mouse.move(700, 450);
  await p.keyboard.press("f");
  await p.mouse.move(300, 200); await p.mouse.down(); await p.mouse.move(700, 450, { steps: 5 }); await p.mouse.move(1100, 760, { steps: 5 }); await p.mouse.up();
  await sleep(300);
  await p.keyboard.press("Escape");
  // заметка двойным щелчком
  await p.mouse.dblclick(420, 330); await sleep(300); await p.keyboard.type("двойной щелчок"); await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  // заметка инструментом N
  await p.keyboard.press("n"); await p.mouse.click(700, 330); await sleep(300); await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  // фигура R
  await p.keyboard.press("r"); await p.mouse.move(450, 520); await p.mouse.down(); await p.mouse.move(560, 600, { steps: 5 }); await p.mouse.up(); await sleep(200); await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  // штрих D
  await p.keyboard.press("d"); await p.mouse.move(650, 520); await p.mouse.down(); for (let i = 0; i < 12; i++) await p.mouse.move(650 + i * 8, 520 + Math.sin(i) * 20); await p.mouse.up(); await sleep(200); await p.keyboard.press("v");
  // кубики из библиотеки
  await p.locator('.lib-rail button[aria-label="Объекты"]').click(); await sleep(250);
  await p.locator(".lib-tile", { hasText: "Кубики" }).click(); await sleep(400);
  await p.locator('.lib-rail button[aria-label="Стикеры"]').click(); await sleep(250);
  await p.locator(".lib-emoji").nth(3).click(); await sleep(400);
  await p.locator('.lib-rail button[aria-label="Стикеры"]').click(); await sleep(250);
  // стрелка A между заметками
  await p.keyboard.press("a"); await p.mouse.move(420, 330); await p.mouse.down(); await p.mouse.move(560, 330, { steps: 4 }); await p.mouse.move(700, 335, { steps: 4 }); await p.mouse.up(); await sleep(200); await p.keyboard.press("Escape");
  // копия заметки Ctrl+C / Ctrl+V
  await p.keyboard.press("v"); await p.mouse.click(420, 330); await sleep(100); await p.keyboard.press("Control+c"); await p.mouse.move(800, 650); await p.keyboard.press("Control+v"); await sleep(300); await p.keyboard.press("Escape");
  await sleep(300);
  console.log("BEFORE\n" + (await dump()).join("\n"));
  await shot("frames-1");
  // тянем рамку за подпись
  const lab = await p.locator("[data-frame-label]").first().boundingBox();
  console.log("label", lab);
  if (lab) {
    await p.mouse.move(lab.x + 10, lab.y + lab.height / 2); await p.mouse.down(); await p.mouse.move(lab.x + 60, lab.y + 40, { steps: 6 }); await p.mouse.move(lab.x + 210, lab.y + 110, { steps: 6 }); await p.mouse.up();
  }
  await sleep(400);
  console.log("AFTER\n" + (await dump()).join("\n"));
  await shot("frames-2");
  // вложенная рамка: рисуем маленькую внутри большой, в неё — заметку; двигаем большую ещё раз
  const fr = await ev((b) => { const f = b.store.order.find((v: any) => v.type === "frame"); const a = b.camera.toScreen(f.x, f.y); return { x: a.x, y: a.y, w: f.w * b.camera.z, h: f.H * b.camera.z }; });
  await p.keyboard.press("f");
  await p.mouse.move(fr.x + fr.w - 260, fr.y + fr.h - 200); await p.mouse.down(); await p.mouse.move(fr.x + fr.w - 30, fr.y + fr.h - 30, { steps: 6 }); await p.mouse.up();
  await sleep(300); await p.keyboard.press("Escape");
  await p.mouse.dblclick(fr.x + fr.w - 150, fr.y + fr.h - 110); await sleep(300); await p.keyboard.type("во вложенной"); await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  await sleep(200);
  const nest = await ev((b) => { const fs = b.store.order.filter((v: any) => v.type === "frame"); return fs.map((f: any) => `${f.id} parent=${f.parent ?? "-"} kids=${b.store.children(f.id).length} desc=${b.store.descendants(f.id).length}`); });
  console.log("NESTED", nest);
  const before = await ev((b) => b.store.order.map((v: any) => [v.id, v.x, v.y]));
  const lab2 = await p.locator("[data-frame-label]").first().boundingBox();
  if (lab2) { await p.mouse.move(lab2.x + 10, lab2.y + lab2.height / 2); await p.mouse.down(); await p.mouse.move(lab2.x - 100, lab2.y - 60, { steps: 8 }); await p.mouse.up(); }
  await sleep(400);
  const after = await ev((b) => b.store.order.map((v: any) => [v.id, v.x, v.y, v.type, v.parent ?? "-"]));
  const moved = after.filter((a: any) => { const o = before.find((x: any) => x[0] === a[0]); return o && (o[1] !== a[1] || o[2] !== a[2]); }).length;
  console.log(`second move: moved ${moved} of ${after.length}`, after.map((a: any) => `${a[3]}:${a[4] === "-" ? "-" : "in"}`).join(" "));
  await shot("frames-3");
  // отмена — всё на месте и рамки те же
  await p.keyboard.press("Control+z"); await sleep(300);
  const undone = await ev((b) => b.store.order.map((v: any) => [v.id, v.x, v.y]));
  console.log("undo ok:", JSON.stringify(undone) === JSON.stringify(before));
}

try {
  if (which === "frames") await frames(p);
  if (which === "tpl") await tpl(p);
  if (which === "rail2") await rail2(p);
  if (which === "rail") await rail(p);
  if (which === "knobdbg") await knobdbg(p);
  if (which === "knob") await knob(p);
  if (which === "stickers") await stickers(p);
} finally {
  if (errs.length) console.log("ERRORS:", errs.slice(0, 8));
  await browser.close();
}
