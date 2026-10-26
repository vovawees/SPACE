/* Замер плавности на тяжёлой доске: загрузка, панорама, масштаб.
   node tests/e2e/seed.ts perf 5000 > /tmp/perf.space
   node tests/e2e/perf.ts http://localhost:8787 /tmp/perf.space
   Без видеокарты (headless) цифры занижены — смотрите на относительные. */
import fs from "node:fs";
import type { Page } from "playwright";
import { launch } from "./browser.ts";

const base = process.argv[2] || "http://localhost:8787";
const file = process.argv[3] || "/tmp/perf.space";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function start(p: Page) {
  await p.evaluate(() => {
    const w = window as any;
    w.__perf = { frames: [] as number[], long: 0, longMax: 0, run: true };
    const tick = (t: number) => {
      if (!w.__perf.run) return;
      w.__perf.frames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      w.__perfObs?.disconnect();
      w.__perfObs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          w.__perf.long++;
          w.__perf.longMax = Math.max(w.__perf.longMax, e.duration);
        }
      });
      w.__perfObs.observe({ type: "longtask" });
    } catch {}
  });
}

async function stop(p: Page) {
  return p.evaluate(() => {
    const w = window as any;
    w.__perf.run = false;
    const f: number[] = w.__perf.frames;
    const d = f.slice(1).map((t, i) => t - f[i]!);
    d.sort((a, b) => a - b);
    const total = f[f.length - 1]! - f[0]!;
    return {
      fps: Math.round(((f.length - 1) / total) * 1000),
      p95: Math.round(d[Math.floor(d.length * 0.95)] ?? 0),
      worst: Math.round(d[d.length - 1] ?? 0),
      long: w.__perf.long as number,
      longMax: Math.round(w.__perf.longMax),
      dom: document.querySelectorAll(".node").length,
      lod: w.__board.lod as string,
      z: +w.__board.camera.z.toFixed(2),
    };
  });
}

const fmt = (name: string, r: Awaited<ReturnType<typeof stop>>) =>
  console.log(`${name.padEnd(28)} ${String(r.fps).padStart(3)} fps  p95 ${String(r.p95).padStart(3)} мс  худший ${String(r.worst).padStart(4)} мс  долгих задач ${r.long} (макс ${r.longMax} мс)  узлов в DOM ${r.dom}  ${r.lod} z=${r.z}`);

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("space:debug", "1"));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto(base + "/");
  await p.evaluate(() => fetch("/api/auth/guest", { method: "POST", headers: { "x-space": "1", "content-type": "application/json" }, body: JSON.stringify({ name: "Perf", color: "#5b9cf0" }) }));
  const b64 = fs.readFileSync(file).toString("base64");
  const { id } = (await p.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await fetch("/api/boards/import", { method: "POST", headers: { "x-space": "1", "content-type": "application/octet-stream" }, body: bin });
    return r.json();
  }, b64)) as { id: string };

  const t0 = Date.now();
  await p.goto(`${base}/b/${id}`);
  await p.waitForFunction(() => (window as any).__board?.synced === true, null, { timeout: 30000 });
  const tSync = Date.now() - t0;
  await p.waitForFunction(() => document.querySelectorAll(".node").length > 0 || !!document.querySelector(".scene-canvas"), null, { timeout: 30000 });
  const n = await p.evaluate(() => (window as any).__board.store.views.size);
  console.log(`Доска: ${n} узлов, синхронизация ${tSync} мс, первая отрисовка ${Date.now() - t0} мс`);
  await sleep(1500);

  // приближаемся к началу доски (z = 1)
  await p.evaluate(() => {
    const c = (window as any).__board.camera;
    c.x = 0;
    c.y = 0;
    c.z = 1;
  });
  await sleep(800);

  const pan = async (label: string, dx: number, dy: number) => {
    await p.keyboard.down("Space");
    await p.mouse.move(1100, 700);
    await p.mouse.down();
    await start(p);
    for (let i = 0; i < 90; i++) await p.mouse.move(1100 - (dx * i) / 90, 700 - (dy * i) / 90);
    await p.mouse.up();
    await p.keyboard.up("Space");
    await sleep(100);
    fmt(label, await stop(p));
  };
  await pan("Панорама, z=1", 1400, 800);
  await sleep(500);

  const zoom = async (label: string, steps: number, delta: number) => {
    await p.mouse.move(720, 450);
    await start(p);
    for (let i = 0; i < steps; i++) {
      await p.keyboard.down("Control");
      await p.mouse.wheel(0, delta);
      await p.keyboard.up("Control");
      await sleep(16);
    }
    await sleep(300);
    fmt(label, await stop(p));
  };
  await zoom("Отдаление до всей доски", 40, 60);
  await sleep(600);
  await pan("Панорама, дальний план", 900, 500);
  await zoom("Приближение", 40, -60);
  await sleep(600);
  await pan("Панорама после приближения", -900, -500);

  // выделить всё и сдвинуть
  await p.keyboard.press("Control+a");
  await sleep(300);
  const tSel = await p.evaluate(() => (window as any).__board.store.selection.size);
  console.log(`Выделено: ${tSel}`);
  await p.keyboard.press("Escape");
  await ctx.close();
} finally {
  await browser.close();
}
