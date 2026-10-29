/* ВРЕМЕННО: профилирование сценариев (удалить перед выпуском).
   node tests/e2e/prof-tmp.ts <url> <file.space> <scenario> [z] */
import fs from "node:fs";
import type { Page } from "playwright";
import { launch } from "./browser.ts";

const base = process.argv[2] || "http://127.0.0.1:8811";
const file = process.argv[3] || "/tmp/perf.space";
const scen = process.argv[4] || "zoommid";
const z0 = Number(process.argv[5] || 0.6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem("space:debug", "1"));
if (process.env.CULLK) await ctx.addInitScript((k) => ((globalThis as any).__cullK = Number(k)), process.env.CULLK);
if (process.env.ONLY) await ctx.addInitScript((o) => ((globalThis as any).__only = o), process.env.ONLY);
if ((process.env.EXP || "").includes("gpuglow")) await ctx.addInitScript(() => ((globalThis as any).__glowGpu = true));
const p: Page = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(base + "/");
await p.evaluate(() => fetch("/api/auth/guest", { method: "POST", headers: { "x-space": "1", "content-type": "application/json" }, body: JSON.stringify({ name: "Perf", color: "#5b9cf0" }) }));
const b64 = fs.readFileSync(file).toString("base64");
const { id } = (await p.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const r = await fetch("/api/boards/import", { method: "POST", headers: { "x-space": "1", "content-type": "application/octet-stream" }, body: bin });
  return r.json();
}, b64)) as { id: string };
await p.goto(`${base}/b/${id}`);
await p.waitForFunction(() => (window as any).__board?.synced === true, null, { timeout: 30000 });
await sleep(1500);
await p.evaluate((z) => {
  const c = (window as any).__board.camera;
  c.set(-1500 * z, -1000 * z, z);
}, z0);
await sleep(1500);
const dom = () => p.evaluate(() => `dom nodes=${document.querySelectorAll(".node").length} elems=${document.querySelectorAll(".world *").length} lod=${(window as any).__board.lod} z=${(window as any).__board.camera.z.toFixed(2)}`);
const EXP = (process.env.EXP || "").split(",");
let css = "";
if (EXP.includes("noiz")) css += ".world { --iz: 1 !important; }";
if (EXP.includes("nogrid")) css += ".board .grid { display: none !important; }";
if (EXP.includes("nopointer")) css += ".world.moving { pointer-events: none !important; }";
if (EXP.includes("nowc")) css += ".world.moving { will-change: auto !important; }";
if (EXP.includes("wcnode")) css += ".node.moving { will-change: transform; }";
if (EXP.includes("wcworld")) css += ".world.moving { will-change: transform; }";
if (EXP.includes("nolift")) css += ".node { will-change: auto !important; }";
if (EXP.includes("nopan")) css += ".world.panning { will-change: auto !important; }";
if (EXP.includes("wcglow")) css += ".glow-canvas { will-change: transform; }";
if (EXP.includes("wcsel")) css += ".sel-box { will-change: transform; }";
if (EXP.includes("nooverlay")) css += ".overlay { display: none !important; }";
if (EXP.includes("svgvis")) css += "svg { overflow: visible !important; }";
if (EXP.includes("cardvis")) css += ".world * { overflow: visible !important; }";
if (EXP.includes("noui")) css += ".board > :not(.world):not(.grid):not(canvas) { display: none !important; }";
if (EXP.includes("fz")) css += ".world > .layer.frames { transform: translateZ(0); }";
if (EXP.includes("noframes")) css += ".world > .layer.frames { display: none !important; }";
if (EXP.includes("noglow")) css += ".glow-canvas { display: none !important; }";
if (css) await p.addStyleTag({ content: css });
console.log("before:", await dom(), EXP.join(","));

const cdp = await ctx.newCDPSession(p);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
const events: any[] = [];
cdp.on("Tracing.dataCollected", (d: any) => events.push(...d.value));
await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline" + (process.env.INV ? ",disabled-by-default-devtools.timeline.invalidationTracking" : ""), transferMode: "ReportEvents" } as any);
await cdp.send("Profiler.start");
await p.evaluate(() => {
  const w = window as any;
  w.__fr = [];
  w.__run = true;
  const tick = (t: number) => { if (!w.__run) return; w.__fr.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const t0 = Date.now();
if (scen === "zoommid") {
  await p.mouse.move(720, 450);
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 50; i++) { await p.keyboard.down("Control"); await p.mouse.wheel(0, 8); await p.keyboard.up("Control"); await sleep(8); }
    for (let i = 0; i < 50; i++) { await p.keyboard.down("Control"); await p.mouse.wheel(0, -8); await p.keyboard.up("Control"); await sleep(8); }
  }
} else if (scen === "wheel") {
  await p.mouse.move(720, 450);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 100); await sleep(60); }
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -100); await sleep(60); }
  }
  await sleep(400);
} else if (scen === "pan") {
  await p.keyboard.down("Space");
  await p.mouse.move(1100, 700);
  await p.mouse.down();
  for (let i = 0; i < 120; i++) await p.mouse.move(1100 - (1000 * i) / 120, 700 - (500 * i) / 120);
  await p.mouse.up();
  await p.keyboard.up("Space");
} else if (scen === "drag") {
  await p.evaluate(() => {
    const b = (window as any).__board;
    const v = b.camera.view;
    const only = (window as any).__only as string | undefined;
    const ids = [...b.store.views.values()].filter((n: any) => n.type !== "frame" && (!only || n.type === only) && n.x > v.x + v.w * 0.1 && n.x < v.x + v.w * 0.85 && n.y > v.y + v.h * 0.1 && n.y < v.y + v.h * 0.85).map((n: any) => n.id);
    b.store.selection.set(ids);
  });
  const sel = await p.evaluate(() => (window as any).__board.store.selection.size);
  console.log("selected", sel);
  const pt = await p.evaluate(() => {
    const b = (window as any).__board;
    const id = b.store.selection.list[0];
    const el = document.querySelector(`[data-id="${id}"]`)!.getBoundingClientRect();
    return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
  });
  await p.mouse.move(pt.x, pt.y);
  await p.mouse.down();
  for (let i = 0; i < 120; i++) await p.mouse.move(pt.x + i * 4, pt.y + Math.sin(i / 10) * 80);
  await p.mouse.up();
}
await sleep(200);
const fr: number[] = await p.evaluate(() => { const w = window as any; w.__run = false; return w.__fr; });
const prof: any = (await cdp.send("Profiler.stop")).profile;
await new Promise<void>((res) => { cdp.once("Tracing.tracingComplete", () => res()); cdp.send("Tracing.end"); });
const dt = fr.slice(1).map((t, i) => t - fr[i]!).sort((a, b) => a - b);
console.log(`${scen}: ${Date.now() - t0}ms, frames ${fr.length}, fps ${Math.round(((fr.length - 1) / (fr[fr.length - 1]! - fr[0]!)) * 1000)}, p50 ${dt[Math.floor(dt.length / 2)]?.toFixed(1)} p95 ${dt[Math.floor(dt.length * 0.95)]?.toFixed(1)} worst ${dt[dt.length - 1]?.toFixed(1)}`);
console.log("after:", await dom());

if (process.env.INV) {
  const inv = new Map<string, number>();
  for (const e of events) {
    if (e.name !== "PaintInvalidationTracking" && e.name !== "StyleRecalcInvalidationTracking" && e.name !== "LayoutInvalidationTracking") continue;
    const d = e.args?.data ?? {};
    const k = `${e.name.replace("InvalidationTracking", "")} ${d.nodeName ?? "?"} ${d.reason ?? ""}`.slice(0, 140);
    inv.set(k, (inv.get(k) ?? 0) + 1);
  }
  console.log("invalidations:");
  for (const [k, n] of [...inv].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(String(n).padStart(6), k);
  const lz = events.filter((e) => e.name === "Layerize" && e.ph === "X");
  console.log("Layerize events", lz.length, "avg ms", (lz.reduce((a, e) => a + e.dur, 0) / Math.max(1, lz.length) / 1000).toFixed(2));
}
// trace totals on main renderer thread
const main = events.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain");
const tid = main?.tid;
const sum = new Map<string, number>();
for (const e of events) {
  if (e.tid !== tid || e.ph !== "X" || !e.dur) continue;
  sum.set(e.name, (sum.get(e.name) ?? 0) + e.dur / 1000);
}
{
  let n = 0, el = 0, lay = 0, layN = 0;
  for (const e of events) {
    if (e.tid !== tid || e.ph !== "X") continue;
    if (e.name === "UpdateLayoutTree") { n++; el += e.args?.elementCount ?? 0; }
    if (e.name === "Layout") { layN++; lay += e.args?.beginData?.dirtyObjects ?? 0; }
  }
  console.log(`style recalcs ${n}, elements ${el} (avg ${(el / Math.max(1, n)).toFixed(0)}); layouts ${layN}, dirty objs ${lay}`);
}
{
  const pn = new Map<number, { n: number; ms: number }>();
  for (const e of events) {
    if (e.tid !== tid || e.ph !== "X" || e.name !== "Paint") continue;
    const id = e.args?.data?.nodeId ?? -1;
    const o = pn.get(id) ?? { n: 0, ms: 0 };
    o.n++;
    o.ms += (e.dur ?? 0) / 1000;
    pn.set(id, o);
  }
  await cdp.send("DOM.getDocument", { depth: -1 });
  for (const [id, o] of [...pn].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)) {
    let d = "?";
    try {
      const r: any = await cdp.send("DOM.describeNode", { backendNodeId: id });
      d = `${r.node.nodeName}.${(r.node.attributes || []).join(" ").slice(0, 80)}`;
    } catch {}
    console.log(`  paint node ${id}: ${o.n}x ${o.ms.toFixed(0)}ms ${d}`);
  }
}
console.log("trace (ms):", [...sum].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(" "));

// JS self time
const nodes = new Map<number, any>();
for (const n of prof.nodes) nodes.set(n.id, n);
const self = new Map<number, number>();
const dts: number[] = prof.timeDeltas;
prof.samples.forEach((sid: number, i: number) => self.set(sid, (self.get(sid) ?? 0) + (dts[i] ?? 0) / 1000));
const byFn = new Map<string, number>();
for (const [sid, ms] of self) {
  const cf = nodes.get(sid).callFrame;
  const key = `${cf.functionName || "(anon)"} ${(cf.url || "").split("/").pop()}:${cf.lineNumber + 1}`;
  byFn.set(key, (byFn.get(key) ?? 0) + ms);
}
const total = [...byFn.values()].reduce((a, b) => a + b, 0);
console.log(`JS profile total ${total.toFixed(0)}ms; top self:`);
for (const [k, v] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`  ${v.toFixed(1).padStart(7)}  ${k}`);
fs.writeFileSync(`/data/space_project/tools/prof-${scen}.cpuprofile`, JSON.stringify(prof));
await ctx.close();
await browser.close();
