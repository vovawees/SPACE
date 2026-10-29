<script lang="ts">
  /* Холст свечения в слое мира: двигается вместе с доской бесплатно,
     пересчитывается не чаще ~12 раз в секунду, только при изменениях
     и в отдельном потоке (если браузер умеет). */
  import { onDestroy, untrack } from "svelte";
  import { look } from "../../lib/look.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { computeGlow, type GlowField } from "../glow.ts";
  import type { GlowReply, GlowRequest } from "../glow.worker.ts";
  import type { Rect } from "../geometry.ts";

  const b = useBoard();
  const cam = b.camera;
  let canvas: HTMLCanvasElement;
  let field = $state.raw<GlowField | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;

  const SKIP = new Set(["frame", "path", "ink", "text"]);

  function tint(): { rgb: [number, number, number]; cap: number } {
    const cs = getComputedStyle(document.documentElement);
    const parts = cs.getPropertyValue("--glow").trim().split(/\s+/).map(Number);
    const cap = Number(cs.getPropertyValue("--glow-cap")) || 0.07;
    return { rgb: [parts[0] ?? 255, parts[1] ?? 250, parts[2] ?? 240], cap };
  }

  /* -------------------------------- поток -------------------------------- */

  let worker: Worker | null | undefined;
  let seq = 0;
  let busy = false;
  let queued: (() => void) | null = null;

  function getWorker(): Worker | null {
    if (worker !== undefined) return worker;
    try {
      const w = new Worker(new URL("../glow.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<GlowReply>) => {
        busy = false;
        const r = e.data;
        if (r.id === seq) field = r.f ? { x: r.f.x, y: r.f.y, step: r.f.step, bw: r.f.bw, bh: r.f.bh, data: new ImageData(new Uint8ClampedArray(r.f.buf), r.f.bw, r.f.bh) } : null;
        const q = queued;
        queued = null;
        q?.();
      };
      w.onerror = () => {
        // поток не завёлся — считаем по-старому, в основном
        w.terminate();
        worker = null;
        busy = false;
        const q = queued;
        queued = null;
        q?.();
      };
      worker = w;
    } catch {
      worker = null;
    }
    return worker;
  }
  onDestroy(() => {
    clearTimeout(timer);
    worker?.terminate();
  });

  /* ------------------------------ что светится ------------------------------ */

  // зависимости: состав, геометрия карточек в зоне вида, оформление
  let lastRects: Rect[] = [];
  const rects = $derived.by(() => {
    // пока камера движется, свечение не пересчитывается: оно в координатах
    // мира и едет вместе с доской
    if (cam.moving) return lastRects;
    const s = b.view;
    const area = cam.cull;
    void s.geoRev;
    void s.order;
    const zone = { x: area.x - 300, y: area.y - 300, w: area.w + 600, h: area.h + 600 };
    const out: Rect[] = [];
    for (const v of untrack(() => s.inRect(zone))) {
      if (SKIP.has(v.type)) continue;
      out.push(untrack(() => ({ x: v.x, y: v.y, w: v.w, h: v.H })));
      if (out.length > 1500) return (lastRects = []);
    }
    // то же самое — тот же массив: пересчёт не нужен
    if (out.length === lastRects.length && out.every((r, i) => sameRect(r, lastRects[i]!))) return lastRects;
    return (lastRects = out);
  });

  function sameRect(a: Rect, b: Rect): boolean {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  let doneRects: Rect[] | null = null;
  let doneArea: Rect | null = null;
  let doneLook = -1;

  $effect(() => {
    const list = rects;
    if (cam.moving) return;
    const area = cam.cull;
    const lk = look.v;
    if (list === doneRects && area === doneArea && lk === doneLook) return;
    const run = () => {
      last = performance.now();
      doneRects = list;
      doneArea = area;
      doneLook = lk;
      const t = tint();
      const w = list.length >= 2 ? getWorker() : null;
      if (!w) {
        field = computeGlow(list, area, t.rgb, t.cap);
        return;
      }
      if (busy) {
        // предыдущий расчёт ещё идёт — этот подождёт его (берётся последний)
        queued = run;
        return;
      }
      const flat = new Float64Array(list.length * 4);
      list.forEach((r, i) => flat.set([r.x, r.y, r.w, r.h], i * 4));
      busy = true;
      const msg: GlowRequest = { id: ++seq, rects: flat, area: { x: area.x, y: area.y, w: area.w, h: area.h }, tint: t.rgb, cap: t.cap };
      w.postMessage(msg, [flat.buffer]);
    };
    clearTimeout(timer);
    const wait = Math.max(0, 80 - (performance.now() - last));
    timer = setTimeout(run, wait);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const f = field;
    if (!canvas) return;
    if (!f) {
      canvas.width = canvas.height = 1;
      return;
    }
    canvas.width = f.bw;
    canvas.height = f.bh;
    // программный холст: видеокарточный стал бы отдельным слоем, и всё, что
    // лежит над ним, браузер раскладывал бы по слоям заново каждый кадр
    canvas.getContext("2d", { willReadFrequently: true })?.putImageData(f.data, 0, 0);
  });
</script>

<canvas
  class="glow-canvas"
  bind:this={canvas}
  style:display={field ? null : "none"}
  style:transform={field ? `translate(${field.x - field.step / 2}px, ${field.y - field.step / 2}px)` : null}
  style:width={field ? `${field.bw * field.step}px` : null}
  style:height={field ? `${field.bh * field.step}px` : null}
></canvas>
