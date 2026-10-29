/* ВРЕМЕННО: сколько композитных слоёв и почему. node tests/e2e/layers-tmp.ts URL file z */
import fs from "node:fs";
import { launch } from "./browser.ts";
const [base = "http://127.0.0.1:8811", file = "/data/space_project/tools/perf.space", zs = "0.6"] = process.argv.slice(2);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(base + "/");
await p.evaluate(() => fetch("/api/auth/guest", { method: "POST", headers: { "x-space": "1", "content-type": "application/json" }, body: JSON.stringify({ name: "L", color: "#5b9cf0" }) }));
const b64 = fs.readFileSync(file).toString("base64");
const { id } = (await p.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const r = await fetch("/api/boards/import", { method: "POST", headers: { "x-space": "1", "content-type": "application/octet-stream" }, body: bin });
  return r.json();
}, b64)) as { id: string };
await ctx.addInitScript(() => localStorage.setItem("space:debug", "1"));
await p.goto(`${base}/b/${id}`);
await p.waitForFunction(() => (window as any).__board?.synced === true, null, { timeout: 30000 });
await p.evaluate((z) => (window as any).__board.camera.set(-1500 * z, -1000 * z, z), Number(zs));
await p.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(p);
let layers: any[] = [];
cdp.on("LayerTree.layerTreeDidChange", (e: any) => { if (e.layers) layers = e.layers; });
await cdp.send("DOM.getDocument", { depth: -1 });
await cdp.send("LayerTree.enable");
await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await p.waitForTimeout(500);
console.log("layers:", layers.length);
const by = new Map<string, number>();
for (const l of layers.slice(0, 400)) {
  let reasons: string[] = [];
  try { reasons = ((await cdp.send("LayerTree.compositingReasons", { layerId: l.layerId })) as any).compositingReasonIds ?? []; } catch {}
  let d = "";
  if (l.backendNodeId) {
    try { const r: any = await cdp.send("DOM.describeNode", { backendNodeId: l.backendNodeId }); d = `${r.node.nodeName}.${(r.node.attributes || []).join(" ").slice(0, 60)}`; } catch {}
  }
  const k = `${reasons.join(",")} | ${d.replace(/data-id \S+|translate\([^)]*\)/g, "").slice(0, 90)}`;
  by.set(k, (by.get(k) ?? 0) + 1);
}
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(String(n).padStart(4), k);
await browser.close();
