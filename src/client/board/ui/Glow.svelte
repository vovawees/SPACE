<script lang="ts">
  /* Свечение под группами карточек — плитками на общей сетке мира.
     Плитка не зависит от камеры: при масштабе и прокрутке она просто
     растягивается и едет вместе с доской — ничего не пересчитывается и не
     мигает. Считаются только плитки, которых ещё нет (заранее, с запасом
     вокруг экрана), и места, где карточки сдвинулись. Расчёт — в отдельном
     потоке; готовые плитки хранятся, пока не понадобится место. */
  import { onDestroy, untrack } from "svelte";
  import { look } from "../../lib/look.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import type { Rect } from "../geometry.ts";
  import { GLOW_HALO, GLOW_STEP, GLOW_TILE, GLOW_TILE_W, runGlowJobs, type GlowJob, type GlowReply, type GlowRequest, type GlowResult } from "../glow.ts";
  import type { BoardStore, NodeView } from "../store.svelte.ts";

  let { hidden = false }: { hidden?: boolean } = $props();

  const b = useBoard();
  const cam = b.camera;
  let host: HTMLDivElement;

  const SKIP = new Set(["frame", "path", "ink", "text"]);
  /** Плиток с картинкой в памяти (по 256 КБ); лишние — самые давние вне экрана. */
  const MAX_TILES = 64;
  /** Точек за одно сообщение потоку: ответы приходят часто и понемногу. */
  const BUDGET = 6 * GLOW_TILE * GLOW_TILE;
  /** Столько карточек у одной плитки — уже не свечение, а каша: не считаем. */
  const MAX_RECTS = 4000;
  /** Ниже этого масштаба — дальний план, свечения там нет. */
  const MIN_Z = 0.16;

  type Box = { x0: number; y0: number; x1: number; y1: number };
  interface Tile {
    key: string;
    ti: number;
    tj: number;
    canvas: HTMLCanvasElement | null;
    ctx: CanvasRenderingContext2D | null;
    /** new — ещё не считалась; stale — пересчитать целиком; ok — готова. */
    state: "new" | "stale" | "ok";
    /** Что пересчитать: точки плитки, конец не включён. */
    dirty: Box | null;
    used: number;
  }

  const tiles = new Map<string, Tile>();
  /** Какие габариты карточек уже учтены в плитках. */
  const known = new Map<string, Rect>();
  const changed = new Set<NodeView>();
  let gone: Rect[] = [];
  let canvases = 0;
  let store: BoardStore | null = null;

  const keyOf = (ti: number, tj: number) => `${ti},${tj}`;
  const rectOf = (v: NodeView): Rect | null => (SKIP.has(v.type) ? null : { x: v.x, y: v.y, w: v.w, h: v.H });
  /* сдвиг меньше пикселя на свечении не виден — такие правки (скажем,
     округление высоты при первом показе заметки) не пересчитываем */
  const nearRect = (a: Rect, q: Rect) => Math.abs(a.x - q.x) < 1 && Math.abs(a.y - q.y) < 1 && Math.abs(a.w - q.w) < 1 && Math.abs(a.h - q.h) < 1;

  let tintCache: { rgb: [number, number, number]; cap: number } | null = null;
  function tint(): { rgb: [number, number, number]; cap: number } {
    if (tintCache) return tintCache;
    const cs = getComputedStyle(document.documentElement);
    const parts = cs.getPropertyValue("--glow").trim().split(/\s+/).map(Number);
    const cap = Number(cs.getPropertyValue("--glow-cap")) || 0.07;
    return (tintCache = { rgb: [parts[0] ?? 255, parts[1] ?? 250, parts[2] ?? 240], cap });
  }

  /* -------------------------------- поток -------------------------------- */

  let worker: Worker | null | undefined;
  let seq = 0;
  /** Ответы на запросы до этого номера — от прошлой доски, их не берём. */
  let epochFrom = 1;
  let inflight = 0;

  function getWorker(): Worker | null {
    if (worker !== undefined) return worker;
    try {
      const w = new Worker(new URL("../glow.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<GlowReply>) => {
        inflight = Math.max(0, inflight - 1);
        if (e.data.id >= epochFrom) for (const r of e.data.results) apply(r);
        schedule();
      };
      w.onerror = () => {
        // поток не завёлся — дальше считаем в основном, всё заново
        w.terminate();
        worker = null;
        inflight = 0;
        for (const t of tiles.values()) if (t.state === "ok") t.state = "stale";
        schedule();
      };
      worker = w;
    } catch {
      worker = null;
    }
    return worker;
  }

  function send(jobs: GlowJob[]) {
    const t = tint();
    const w = getWorker();
    if (!w) {
      for (const r of runGlowJobs(jobs, t.rgb, t.cap)) apply(r);
      return;
    }
    inflight++;
    const msg: GlowRequest = { id: ++seq, jobs, tint: t.rgb, cap: t.cap };
    w.postMessage(msg, jobs.map((j) => j.rects.buffer));
  }

  /* ------------------------------- плитки ------------------------------- */

  function make(t: Tile) {
    const c = document.createElement("canvas");
    c.width = c.height = GLOW_TILE;
    c.className = "glow-tile";
    // центр точки k — ровно в мировой точке k·шаг
    c.style.transform = `translate(${t.ti * GLOW_TILE_W - GLOW_STEP / 2}px, ${t.tj * GLOW_TILE_W - GLOW_STEP / 2}px)`;
    c.style.width = c.style.height = `${GLOW_TILE_W}px`;
    host.appendChild(c);
    t.canvas = c;
    // холст программный: картинку кладём с процессора, видеокарта её только рисует
    t.ctx = c.getContext("2d", { willReadFrequently: true });
    canvases++;
  }

  function drop(t: Tile) {
    if (!t.canvas) return;
    t.canvas.remove();
    t.canvas = null;
    t.ctx = null;
    canvases--;
  }

  function apply(r: GlowResult) {
    const t = tiles.get(r.key);
    if (!t) return; // плитку уже выбросили
    const lx = r.sx - t.ti * GLOW_TILE;
    const ly = r.sy - t.tj * GLOW_TILE;
    if (!r.buf) {
      if (!t.canvas) return;
      if (r.full) drop(t);
      else t.ctx?.clearRect(lx, ly, r.w, r.h);
      return;
    }
    if (!t.canvas) {
      if (!host) return;
      make(t);
    }
    t.ctx?.putImageData(new ImageData(new Uint8ClampedArray(r.buf), r.w, r.h), lx, ly);
  }

  /** Карточка была или стала здесь: места под её ореолом в готовых плитках — пересчитать. */
  function touch(r: Rect) {
    const x0 = r.x - GLOW_HALO;
    const y0 = r.y - GLOW_HALO;
    const x1 = r.x + r.w + GLOW_HALO;
    const y1 = r.y + r.h + GLOW_HALO;
    const ti0 = Math.floor(x0 / GLOW_TILE_W);
    const ti1 = Math.floor(x1 / GLOW_TILE_W);
    const tj0 = Math.floor(y0 / GLOW_TILE_W);
    const tj1 = Math.floor(y1 / GLOW_TILE_W);
    if ((ti1 - ti0 + 1) * (tj1 - tj0 + 1) > tiles.size) {
      for (const t of tiles.values()) if (t.ti >= ti0 && t.ti <= ti1 && t.tj >= tj0 && t.tj <= tj1) dirtyIn(t, x0, y0, x1, y1);
      return;
    }
    for (let tj = tj0; tj <= tj1; tj++)
      for (let ti = ti0; ti <= ti1; ti++) {
        const t = tiles.get(keyOf(ti, tj));
        if (t) dirtyIn(t, x0, y0, x1, y1);
      }
  }

  function dirtyIn(t: Tile, x0: number, y0: number, x1: number, y1: number) {
    if (t.state !== "ok") return; // и так посчитается целиком
    const sx = t.ti * GLOW_TILE;
    const sy = t.tj * GLOW_TILE;
    const a = Math.max(0, Math.floor(x0 / GLOW_STEP) - sx);
    const c = Math.min(GLOW_TILE, Math.ceil(x1 / GLOW_STEP) + 1 - sx);
    const bq = Math.max(0, Math.floor(y0 / GLOW_STEP) - sy);
    const d = Math.min(GLOW_TILE, Math.ceil(y1 / GLOW_STEP) + 1 - sy);
    if (c <= a || d <= bq) return;
    const o = t.dirty;
    t.dirty = o ? { x0: Math.min(o.x0, a), y0: Math.min(o.y0, bq), x1: Math.max(o.x1, c), y1: Math.max(o.y1, d) } : { x0: a, y0: bq, x1: c, y1: d };
  }

  /** Карточки, чей ореол задевает кусок сетки, — плоским массивом. */
  function gather(s: BoardStore, sx: number, sy: number, w: number, h: number): Float64Array {
    const area = { x: sx * GLOW_STEP - GLOW_HALO, y: sy * GLOW_STEP - GLOW_HALO, w: (w - 1) * GLOW_STEP + 2 * GLOW_HALO, h: (h - 1) * GLOW_STEP + 2 * GLOW_HALO };
    const list = s.inRect(area);
    const out = new Float64Array(Math.min(list.length, MAX_RECTS) * 4);
    let n = 0;
    for (const v of list) {
      const r = rectOf(v);
      if (!r) continue;
      // уже известное не трогаем: так расхождение с посчитанным — меньше пикселя
      if (!known.has(v.id)) known.set(v.id, r);
      if (n >= MAX_RECTS) return new Float64Array(0);
      out[n * 4] = r.x;
      out[n * 4 + 1] = r.y;
      out[n * 4 + 2] = r.w;
      out[n * 4 + 3] = r.h;
      n++;
    }
    return n * 4 === out.length ? out : out.slice(0, n * 4);
  }

  /* ------------------------------ что нужно ------------------------------ */

  /* Нужны плитки зоны отрисовки, а в покое — ещё и всё, что станет видно
     при отдалении в 2,5 раза: тогда и при отдалении ничего не догружается. */
  const want = $derived.by((): (Box & { cx: number; cy: number }) | null => {
    if (hidden) return null;
    const c = cam.cull;
    let r: Rect = c;
    if (!cam.moving) {
      const z = untrack(() => cam.z);
      const k = Math.max(1, Math.min(2.5, z / MIN_Z));
      r = { x: c.x + (c.w * (1 - k)) / 2, y: c.y + (c.h * (1 - k)) / 2, w: c.w * k, h: c.h * k };
    }
    return {
      x0: Math.floor(r.x / GLOW_TILE_W),
      y0: Math.floor(r.y / GLOW_TILE_W),
      x1: Math.floor((r.x + r.w) / GLOW_TILE_W),
      y1: Math.floor((r.y + r.h) / GLOW_TILE_W),
      cx: c.x + c.w / 2,
      cy: c.y + c.h / 2,
    };
  });

  /* ------------------------------- расчёт ------------------------------- */

  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;

  function schedule() {
    if (timer !== undefined || !store) return;
    timer = setTimeout(run, Math.max(0, 80 - (performance.now() - last)));
  }

  function run() {
    timer = undefined;
    const s = store;
    if (!s || !host) return;
    // предыдущие ещё считаются — ответ позовёт снова
    if (inflight >= 2) return;
    last = performance.now();

    // 1. правки → места, которые надо пересчитать
    for (const r of gone) touch(r);
    gone = [];
    for (const v of changed) {
      const old = known.get(v.id);
      const now = s.views.get(v.id) === v ? rectOf(v) : null;
      if (old && now && nearRect(old, now)) continue;
      if (old) touch(old);
      if (now) {
        touch(now);
        known.set(v.id, now);
      } else known.delete(v.id);
    }
    changed.clear();

    // 2. плитки, нужные сейчас
    const w = want;
    const need = new Set<Tile>();
    if (w)
      for (let tj = w.y0; tj <= w.y1; tj++)
        for (let ti = w.x0; ti <= w.x1; ti++) {
          const k = keyOf(ti, tj);
          let t = tiles.get(k);
          if (!t) tiles.set(k, (t = { key: k, ti, tj, canvas: null, ctx: null, state: "new", dirty: null, used: 0 }));
          t.used = last;
          need.add(t);
        }
    // за экраном правка подождёт, пока плитка снова понадобится
    for (const t of tiles.values())
      if (!need.has(t) && t.dirty) {
        t.dirty = null;
        t.state = "stale";
      }

    // 3. задания — сначала ближние к центру экрана
    const todo = [...need].filter((t) => t.state !== "ok" || t.dirty);
    if (todo.length && w) {
      const d = (t: Tile) => Math.hypot((t.ti + 0.5) * GLOW_TILE_W - w.cx, (t.tj + 0.5) * GLOW_TILE_W - w.cy);
      todo.sort((a, q) => d(a) - d(q));
      const jobs: GlowJob[] = [];
      let budget = BUDGET;
      let more = false;
      for (const t of todo) {
        const dt = t.dirty;
        const full = t.state !== "ok" || !dt || (dt.x1 - dt.x0) * (dt.y1 - dt.y0) > GLOW_TILE * GLOW_TILE * 0.6;
        const box = full ? { x0: 0, y0: 0, x1: GLOW_TILE, y1: GLOW_TILE } : dt;
        const sx = t.ti * GLOW_TILE + box.x0;
        const sy = t.tj * GLOW_TILE + box.y0;
        const bw = box.x1 - box.x0;
        const bh = box.y1 - box.y0;
        const rects = gather(s, sx, sy, bw, bh);
        // пустые куски почти ничего не стоят
        const cost = rects.length >= 8 ? bw * bh : 0;
        if (jobs.length && cost > budget) {
          more = true;
          break;
        }
        budget -= cost;
        t.state = "ok";
        t.dirty = null;
        jobs.push({ key: t.key, sx, sy, w: bw, h: bh, full, rects });
      }
      if (jobs.length) send(jobs);
      if (more) schedule();
    }

    // 4. память: лишние плитки — самые давние вне экрана
    if (canvases > MAX_TILES) {
      const old = [...tiles.values()].filter((t) => t.canvas && !need.has(t)).sort((a, q) => a.used - q.used);
      for (const t of old) {
        if (canvases <= MAX_TILES) break;
        drop(t);
        tiles.delete(t.key);
      }
    }
    if (tiles.size > 4096)
      for (const t of tiles.values()) {
        if (tiles.size <= 2048) break;
        if (!t.canvas && !need.has(t)) tiles.delete(t.key);
      }
  }

  function reset(s: BoardStore) {
    for (const t of tiles.values()) t.canvas?.remove();
    tiles.clear();
    known.clear();
    changed.clear();
    gone = [];
    canvases = 0;
    epochFrom = seq + 1;
    store = s;
    schedule();
  }

  /* ------------------------------ подписки ------------------------------ */

  // доска (или просмотр версии) сменилась — всё заново; дальше — только правки
  $effect(() => {
    const s = b.view;
    untrack(() => reset(s));
    const watch = (v: NodeView, isGone: boolean) => {
      if (isGone) {
        changed.delete(v);
        const r = known.get(v.id);
        if (r) {
          gone.push(r);
          known.delete(v.id);
        }
      } else changed.add(v);
      schedule();
    };
    s.geoWatch.add(watch);
    return () => {
      s.geoWatch.delete(watch);
    };
  });

  // сменилась тема — тот же расчёт другим цветом
  $effect(() => {
    void look.v;
    untrack(() => {
      tintCache = null;
      for (const t of tiles.values()) if (t.state === "ok") t.state = "stale";
      schedule();
    });
  });

  // камера ушла за пределы готового — досчитать новые плитки
  $effect(() => {
    void want;
    untrack(schedule);
  });

  onDestroy(() => {
    clearTimeout(timer);
    timer = undefined;
    store = null;
    worker?.terminate();
  });
</script>

<div class="glow-tiles" bind:this={host} style:display={hidden ? "none" : null}></div>
