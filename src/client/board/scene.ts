/* Холст дальнего плана. При сильном отдалении DOM-узлы не рисуются
   вовсе — тысячи карточек превращаются в упрощённые фигуры на одном
   canvas. Тот же отрисовщик делает превью досок и мини-карту. */
import { fileUrl } from "./files.ts";
import { pinScale } from "./nodes/comment.ts";
import { aabb, intersects, type Rect } from "./geometry.ts";
import { checkKey, colorKey, COLORS, isHex } from "./model.ts";
import { dashArray, inkD, inkPx, shapeD, strokePx } from "./shapes.ts";
import type { BoardStore, NodeView } from "./store.svelte.ts";

export interface Palette {
  bg: string;
  card: string;
  codeBg: string;
  surface: string;
  line: string;
  ink: string;
  ink3: string;
  ink4: string;
  accent: string;
  colors: Record<string, string>;
  tint: number;
  tintLine: number;
  /** Цвета, уже смешанные с фоном карточки. */
  tinted: Record<string, string>;
  tintedLine: Record<string, string>;
  frameFill: Record<string, string>;
  shapeFill: Record<string, string>;
  cardRgb: RGB;
  bgRgb: RGB;
}

type RGB = [number, number, number];

function parseColor(s: string): RGB | null {
  s = s.trim();
  let m = /^#([\da-f]{6})$/i.exec(s);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^#([\da-f]{3})$/i.exec(s);
  if (m) return [...m[1]!].map((c) => parseInt(c + c, 16)) as RGB;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

const css = ([r, g, b]: RGB, a = 1) => (a >= 1 ? `rgb(${r | 0} ${g | 0} ${b | 0})` : `rgb(${r | 0} ${g | 0} ${b | 0} / ${a})`);

function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] * k + b[0] * (1 - k), a[1] * k + b[1] * (1 - k), a[2] * k + b[2] * (1 - k)];
}

let cachedLook = "";
let cachedPalette: Palette | null = null;

export function readPalette(): Palette {
  const ds = document.documentElement.dataset;
  const key = `${ds.accent ?? ""}|${ds.bg ?? ""}`;
  if (cachedPalette && cachedLook === key) return cachedPalette;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const card = parseColor(v("--card")) ?? [27, 27, 30];
  const bg = parseColor(v("--bg")) ?? [17, 17, 19];
  const tint = parseFloat(v("--tint")) / 100 || 0.15;
  const tintLine = parseFloat(v("--tint-line")) / 100 || 0.32;
  const colors: Record<string, string> = {};
  const tinted: Record<string, string> = {};
  const tintedLine: Record<string, string> = {};
  const frameFill: Record<string, string> = {};
  const shapeFill: Record<string, string> = {};
  for (const c of COLORS) {
    const rgb = parseColor(v(`--c-${c}`)) ?? [200, 200, 200];
    colors[c] = css(rgb);
    tinted[c] = c === "default" ? css(card) : css(mix(rgb, card, tint));
    tintedLine[c] = c === "default" ? v("--line-2") : css(rgb, tintLine);
    frameFill[c] = css(mix(rgb, bg, c === "default" ? 0.05 : 0.08));
    shapeFill[c] = css(rgb, tint);
  }
  cachedPalette = {
    bg: css(bg),
    card: css(card),
    codeBg: v("--code-bg") || css(card),
    surface: v("--surface-3") || css(card),
    line: v("--line-2"),
    ink: v("--ink"),
    ink3: v("--ink-3"),
    ink4: v("--ink-4"),
    accent: v("--accent"),
    colors,
    tint,
    tintLine,
    tinted,
    tintedLine,
    frameFill,
    shapeFill,
    cardRgb: card,
    bgRgb: bg,
  };
  cachedLook = key;
  return cachedPalette;
}

/** Ключ палитры для цвета узла: имя или свой #rrggbb — его оттенки
    досчитываются при первой встрече. */
export function palKey(pal: Palette, raw: unknown): string {
  const k = colorKey(raw);
  if (isHex(k) && !(k in pal.colors)) {
    const rgb = parseColor(k) ?? ([200, 200, 200] as RGB);
    pal.colors[k] = css(rgb);
    pal.tinted[k] = css(mix(rgb, pal.cardRgb, pal.tint));
    pal.tintedLine[k] = css(rgb, pal.tintLine);
    pal.frameFill[k] = css(mix(rgb, pal.bgRgb, 0.08));
    pal.shapeFill[k] = css(rgb, pal.tint);
  }
  return k;
}

/* ------------------------------ картинки ------------------------------ */

const images = new Map<string, { img: HTMLImageElement; ok: boolean; waiters: Set<() => void> }>();

function sceneImage(url: string, onload?: () => void): HTMLImageElement | null {
  let e = images.get(url);
  if (!e) {
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    const entry = { img, ok: false, waiters: new Set<() => void>() };
    e = entry;
    images.set(url, entry);
    img.onload = () => {
      entry.ok = true;
      for (const w of entry.waiters) w();
      entry.waiters.clear();
    };
    img.src = url;
    if (images.size > 400) {
      const first = images.keys().next().value;
      if (first) images.delete(first);
    }
  } else {
    // в конец очереди — недавно нужные не вытесняются
    images.delete(url);
    images.set(url, e);
  }
  if (!e.ok && onload) e.waiters.add(onload);
  return e.ok ? e.img : null;
}

/* ------------------------------ кэш путей ------------------------------ */

function inkPath(v: NodeView): Path2D {
  const p = v.props;
  const c = v.cache.inkPath as { pts: unknown; w: number; h: number; path: Path2D } | undefined;
  if (c && c.pts === p.pts && c.w === v.w && c.h === v.h) return c.path;
  const sx = p.ow ? v.w / p.ow : 1;
  const sy = p.oh ? v.h / p.oh : 1;
  const path = new Path2D(inkD(p.pts ?? [], inkPx(p.stroke) * Math.sqrt(Math.max(0.05, sx * sy)), sx, sy));
  v.cache.inkPath = { pts: p.pts, w: v.w, h: v.h, path };
  return path;
}

function textLines(v: NodeView): number[] {
  const c = v.cache.lines as { rev: number; lines: number[] } | undefined;
  if (c && c.rev === v.textRev) return c.lines;
  const lines = v.textValue
    .split("\n")
    .map((l) => l.replace(/^#+\s*|^[-*+]\s+(\[.\]\s*)?/, "").trim().length)
    .filter((n) => n > 0)
    .slice(0, 8);
  v.cache.lines = { rev: v.textRev, lines };
  return lines;
}

/* ------------------------------ отрисовка ------------------------------ */

export interface SceneView {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

export interface SceneOptions {
  dpr?: number;
  /** Подписи рамок рисовать на холсте (для превью); на доске их рисует DOM. */
  labels?: boolean;
  onImage?: () => void;
  background?: boolean;
  /** Узлы, которые не рисовать (например, их сейчас тащат). */
  skip?: ReadonlySet<string>;
  /** Только просмотр: спрятанное логикой не рисовать (редакторам — призраком). */
  readonly?: boolean;
}

/** Текущий масштаб отрисовки: мелкое на экране рисуется дешевле (без скруглений). */
let curZ = 1;

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r * curZ < 1.5) ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function drawScene(ctx: CanvasRenderingContext2D, s: BoardStore, view: SceneView, opts: SceneOptions = {}) {
  const pal = readPalette();
  const dpr = opts.dpr ?? 1;
  const { x, y, z } = view;
  curZ = z;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opts.background) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, view.w, view.h);
  } else ctx.clearRect(0, 0, view.w, view.h);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * x, dpr * y);
  const world: Rect = { x: -x / z, y: -y / z, w: view.w / z, h: view.h / z };
  const px = 1 / z;
  const order = s.order;

  // рамки — снизу, вложенные — над внешними
  for (const v of s.layerFrames(order.filter((f) => f.type === "frame"))) {
    if (v.props.hid && opts.readonly) continue;
    const r = v.rect;
    if (!intersects(r, world)) continue;
    const c = palKey(pal, v.props.color);
    ctx.globalAlpha = alphaOf(v);
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = pal.frameFill[c];
    ctx.fill();
    ctx.lineWidth = px;
    ctx.strokeStyle = c === "default" ? pal.line : pal.tintedLine[c];
    ctx.stroke();
  }

  for (const v of order) {
    if (v.type === "frame" || opts.skip?.has(v.id)) continue;
    if (v.props.hid && opts.readonly) continue;
    const b = v.type === "path" ? s.connector(v).paint : aabb(v.rect, v.r);
    if (!intersects(b, world)) continue;
    ctx.globalAlpha = alphaOf(v);
    // крошечное — просто точка
    if (b.w * z < 2 && b.h * z < 2 && v.type !== "path") {
      ctx.fillStyle = pal.colors[palKey(pal, v.props.color)];
      ctx.fillRect(b.x, b.y, Math.max(b.w, 2 * px), Math.max(b.h, 2 * px));
      continue;
    }
    if (v.r && v.type !== "path") {
      ctx.save();
      const cx = v.x + v.w / 2;
      const cy = v.y + v.H / 2;
      ctx.translate(cx, cy);
      ctx.rotate(v.r);
      ctx.translate(-cx, -cy);
      drawNode(ctx, s, v, pal, z, opts);
      ctx.restore();
    } else drawNode(ctx, s, v, pal, z, opts);
  }
  ctx.globalAlpha = 1;

  if (opts.labels) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${Math.max(10, Math.min(13, 12 * Math.sqrt(z * 4)))}px Inter Variable, Inter, system-ui, sans-serif`;
    ctx.fillStyle = pal.ink3;
    ctx.textBaseline = "bottom";
    for (const v of order) {
      if (v.type !== "frame" || !intersects(v.rect, world)) continue;
      const sx = v.x * z + x;
      const sy = v.y * z + y;
      if (v.w * z < 40) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy - 20, v.w * z, 20);
      ctx.clip();
      ctx.fillText(v.props.name || "Рамка", sx + 1, sy - 4);
      ctx.restore();
    }
  }
}

function bars(ctx: CanvasRenderingContext2D, lines: number[], x: number, y: number, w: number, lh: number, max: number, color: string) {
  // строки тоньше пикселя не видны — не рисуем; все строки узла — одним путём
  if (lh * 0.42 * curZ < 0.8) return;
  const round = lh * curZ > 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  let yy = y;
  for (const n of lines) {
    if (yy + lh > max) break;
    const bw = Math.max(lh, Math.min(w, n * lh * 0.42));
    if (round) ctx.roundRect(x, yy + lh * 0.3, bw, lh * 0.42, lh * 0.2);
    else ctx.rect(x, yy + lh * 0.3, bw, lh * 0.42);
    yy += lh;
  }
  ctx.fill();
}

const alphaOf = (v: NodeView) => (typeof v.props.opacity === "number" ? Math.max(0.1, Math.min(1, v.props.opacity)) : 1) * (v.props.hid ? 0.35 : 1);

/** Своя заливка из «Оформления»: цвет (у градиента — первый); null — нет своей. */
function fillOf(pal: Palette, v: NodeView): string | null {
  const fc = v.props.fc;
  if (!fc) return null;
  if (fc === "transparent") return "rgb(0 0 0 / 0)";
  return pal.colors[palKey(pal, fc)] ?? null;
}

function drawNode(ctx: CanvasRenderingContext2D, s: BoardStore, v: NodeView, pal: Palette, z: number, opts: SceneOptions) {
  const A = ctx.globalAlpha;
  const c = palKey(pal, v.props.color);
  const r = v.rect;
  const px = 1 / z;
  switch (v.type) {
    case "note":
    case "link":
    case "file":
    case "shelf": {
      rr(ctx, r.x, r.y, r.w, r.h, 13);
      ctx.fillStyle = fillOf(pal, v) ?? (v.type === "note" ? pal.tinted[c] : pal.card);
      ctx.fill();
      ctx.lineWidth = px;
      ctx.strokeStyle = v.type === "note" ? pal.tintedLine[c] : pal.line;
      ctx.stroke();
      if (v.type === "note") {
        if (z * 15 > 1.2) bars(ctx, textLines(v), r.x + 16, r.y + 12, r.w - 32, 23, r.y + r.h - 8, pal.ink4);
      } else if (v.type === "link") {
        const img = v.props.image && r.w >= 220 ? sceneImage(v.props.image, opts.onImage) : null;
        let top = r.y;
        if (img) {
          const ih = Math.min(190, r.w / 1.91);
          ctx.save();
          rr(ctx, r.x, r.y, r.w, r.h, 13);
          ctx.clip();
          ctx.drawImage(mipOf(v.props.image!, img, r.w * z * (opts.dpr ?? 1), opts.onImage), r.x, r.y, r.w, ih);
          ctx.restore();
          top += ih;
        }
        bars(ctx, [28, 18], r.x + 14, top + 10, r.w - 28, 22, r.y + r.h - 6, pal.ink4);
      } else {
        ctx.fillStyle = v.type === "shelf" ? pal.colors.yellow : pal.colors.blue;
        ctx.globalAlpha = A * 0.35;
        rr(ctx, r.x + 12, r.y + 12, 42, 42, 9);
        ctx.fill();
        ctx.globalAlpha = A;
        bars(ctx, [22], r.x + 66, r.y + 16, r.w - 80, 22, r.y + r.h, pal.ink4);
      }
      break;
    }
    case "code": {
      rr(ctx, r.x, r.y, r.w, r.h, 13);
      ctx.fillStyle = fillOf(pal, v) ?? pal.codeBg;
      ctx.fill();
      ctx.lineWidth = px;
      ctx.strokeStyle = pal.line;
      ctx.stroke();
      if (z * 13 > 1.2) bars(ctx, textLines(v), r.x + 14, r.y + 44, r.w - 28, 21, r.y + r.h - 8, pal.colors.blue + "");
      break;
    }
    case "text": {
      const lines = textLines(v);
      const size = { s: 16, m: 24, l: 36, xl: 56 }[v.props.size ?? "m"] ?? 24;
      ctx.globalAlpha = A * 0.55;
      bars(ctx, lines.length ? lines : [6], r.x + 4, r.y, r.w - 8, size * 1.3, r.y + r.h + size, c === "default" ? pal.ink : pal.colors[c]);
      ctx.globalAlpha = A;
      break;
    }
    case "image":
    case "video": {
      const p = v.props;
      const url = v.type === "image" ? fileUrl(p.preview || p.src) : p.image || (p.preview ? fileUrl(p.preview) : "");
      const img = url ? sceneImage(url, opts.onImage) : null;
      if (img) ctx.drawImage(mipOf(url, img, Math.max(r.w, r.h) * z * (opts.dpr ?? 1), opts.onImage), r.x, r.y, r.w, r.h);
      else {
        ctx.fillStyle = pal.surface;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      if (v.type === "video") {
        const k = Math.min(r.w, r.h) * 0.12;
        ctx.fillStyle = "rgb(0 0 0 / 0.55)";
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, k * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(r.x + r.w / 2 - k * 0.45, r.y + r.h / 2 - k * 0.65);
        ctx.lineTo(r.x + r.w / 2 + k * 0.7, r.y + r.h / 2);
        ctx.lineTo(r.x + r.w / 2 - k * 0.45, r.y + r.h / 2 + k * 0.65);
        ctx.fill();
      }
      break;
    }
    case "shape": {
      const p = v.props;
      const sw = strokePx(p.stroke);
      const path = new Path2D(shapeD(p.kind ?? "rect", r.x + sw / 2, r.y + sw / 2, r.w - sw, r.h - sw, p.pts));
      const own = fillOf(pal, v);
      if (own || p.fill !== "none") {
        ctx.fillStyle = own ?? (p.fill === "solid" ? pal.colors[c] : pal.shapeFill[c]);
        ctx.fill(path);
      }
      ctx.lineWidth = Math.max(typeof p.bw === "number" ? p.bw : sw, px);
      ctx.strokeStyle = p.bc ? (pal.colors[palKey(pal, p.bc)] ?? pal.colors[c]) : pal.colors[c];
      ctx.lineJoin = "round";
      ctx.stroke(path);
      break;
    }
    case "path": {
      const p = v.props;
      const sw = strokePx(p.stroke);
      const geo = s.connector(v);
      if (!geo.d) break;
      ctx.lineWidth = Math.max(sw, px * 1.2);
      ctx.strokeStyle = pal.colors[c];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const dash = dashArray(p.dash, sw);
      ctx.setLineDash(dash ? dash.split(" ").map(Number) : []);
      ctx.stroke(new Path2D(geo.d));
      ctx.setLineDash([]);
      for (const h of geo.heads) {
        if (!h || !h.d) continue;
        const hp = new Path2D(h.d);
        if (h.style !== "stroke") {
          ctx.fillStyle = h.style === "fill" ? pal.colors[c] : pal.bg;
          ctx.fill(hp);
        }
        if (h.style !== "fill" || sw * z < 3) ctx.stroke(hp);
      }
      // подпись — плашка цвета фона с «строками»
      if (v.textValue.trim()) {
        const lines = textLines(v);
        const fs = { s: 14, m: 17, l: 23, xl: 32 }[p.size ?? "s"] ?? 14;
        const lh = fs * 1.3;
        const n = Math.max(1, Math.min(lines.length, 4));
        const w = Math.min(260, Math.max(28, Math.max(...lines, 2) * fs * 0.52 + 14));
        const h = n * lh + 4;
        rr(ctx, geo.label.x - w / 2, geo.label.y - h / 2, w, h, 7);
        ctx.fillStyle = pal.bg;
        ctx.fill();
        bars(ctx, lines.slice(0, n), geo.label.x - w / 2 + 7, geo.label.y - h / 2 + 2, w - 14, lh, geo.label.y + h / 2, pal.ink4);
      }
      break;
    }
    case "ink": {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.fillStyle = pal.colors[c];
      ctx.fill(inkPath(v));
      ctx.restore();
      break;
    }
    case "sticker": {
      const size = Math.min(r.w, r.h) * 0.84;
      if (size * z < 3) {
        ctx.fillStyle = pal.colors.yellow;
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, size / 2.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      ctx.font = `${size}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = pal.ink;
      ctx.fillText(v.props.emoji || "⭐", r.x + r.w / 2, r.y + r.h / 2 + size * 0.04);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      break;
    }
    case "comment": {
      const first = Object.entries(v.props as Record<string, unknown>).find(([k]) => k.startsWith("m:"))?.[1] as { c?: string } | undefined;
      // как .pin: острый угол внизу слева — точка привязки
      const S = r.w * pinScale(z);
      ctx.beginPath();
      ctx.arc(r.x + S / 2, r.y + r.h - S / 2, S / 2, Math.PI, Math.PI * 2.5);
      ctx.lineTo(r.x, r.y + r.h);
      ctx.closePath();
      ctx.fillStyle = v.props.resolved ? pal.surface : (first?.c ?? pal.accent);
      ctx.fill();
      ctx.lineWidth = Math.max(px, 1.5 / z);
      ctx.strokeStyle = pal.bg;
      ctx.stroke();
      break;
    }
    case "button":
    case "switch":
    case "slider":
    case "rating":
    case "clock":
    case "countdown":
    case "chart":
    case "qr":
    case "wheel":
    case "status":
    case "tracker":
    case "calc":
    case "gate":
    case "stopwatch":
    case "coin":
    case "flipcard":
    case "deck":
    case "random":
    case "score":
    case "turns":
    case "buzzer":
    case "checklist":
    case "input":
    case "calendar":
    case "icon":
    case "token":
    case "words":
    case "spoiler":
      drawWidget(ctx, v, pal, z, c);
      break;
    case "task":
    case "poll":
    case "table":
    case "timer":
    case "audio":
    case "counter":
    case "dice":
    case "progress": {
      rr(ctx, r.x, r.y, r.w, r.h, 13);
      const tinted = v.type === "task" || v.type === "counter" || v.type === "dice" || v.type === "progress";
      ctx.fillStyle = fillOf(pal, v) ?? (tinted ? pal.tinted[c] : pal.card);
      ctx.fill();
      ctx.lineWidth = px;
      ctx.strokeStyle = tinted ? pal.tintedLine[c] : pal.line;
      ctx.stroke();
      if (z * 14 < 1.2) break;
      const mid = (text: string, fs: number, y: number, color: string) => {
        ctx.fillStyle = color;
        ctx.font = `700 ${fs}px Inter Variable, Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, r.x + r.w / 2, y);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      };
      if (v.type === "counter") {
        let n = typeof v.props.n0 === "number" ? v.props.n0 : 0;
        for (const [k, x] of Object.entries(v.props as Record<string, unknown>)) if (k.startsWith("d:") && typeof x === "number") n += x;
        mid(String(Math.round(n * 100) / 100), Math.min(r.h * 0.36, r.w * 0.3), r.y + r.h * 0.56, c === "default" ? pal.ink : pal.colors[c]);
        break;
      }
      if (v.type === "dice") {
        const vals = v.props.roll?.v ?? [];
        const n = Math.max(1, Math.min(6, v.props.count ?? 1));
        const sz = Math.min(r.h * 0.42, (r.w - 24) / n - 8);
        const x0 = r.x + r.w / 2 - (n * (sz + 8) - 8) / 2;
        for (let i = 0; i < n; i++) {
          rr(ctx, x0 + i * (sz + 8), r.y + r.h * 0.42 - sz / 2, sz, sz, sz * 0.2);
          ctx.fillStyle = pal.ink;
          ctx.fill();
          if (vals[i]) {
            ctx.fillStyle = pal.card;
            ctx.font = `700 ${sz * 0.5}px Inter Variable, Inter, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(vals[i]), x0 + i * (sz + 8) + sz / 2, r.y + r.h * 0.42);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
          }
        }
        break;
      }
      if (v.type === "progress") {
        const k = Math.max(0, Math.min(100, v.props.pv ?? 0)) / 100;
        rr(ctx, r.x + 16, r.y + r.h - 32, r.w - 32, 12, 6);
        ctx.fillStyle = pal.surface;
        ctx.fill();
        if (k > 0) {
          rr(ctx, r.x + 16, r.y + r.h - 32, Math.max(12, (r.w - 32) * k), 12, 6);
          ctx.fillStyle = c === "default" ? pal.accent : pal.colors[c];
          ctx.fill();
        }
        bars(ctx, [Math.min(14, (r.w - 32) / 12)], r.x + 16, r.y + 16, r.w * 0.5, 20, r.y + r.h - 40, pal.ink4);
        break;
      }
      if (v.type === "task") {
        if (c !== "default") {
          ctx.fillStyle = pal.colors[c];
          ctx.fillRect(r.x, r.y + 6, 3, r.h - 12);
        }
        ctx.lineWidth = Math.max(px, 1.6);
        ctx.strokeStyle = v.props.done ? pal.colors.green : pal.ink4;
        rr(ctx, r.x + 16, r.y + 15, 20, 20, 6);
        if (v.props.done) {
          ctx.fillStyle = pal.colors.green;
          ctx.fill();
        } else ctx.stroke();
        bars(ctx, textLines(v), r.x + 48, r.y + 12, r.w - 64, 23, r.y + r.h - 6, pal.ink4);
      } else if (v.type === "poll") {
        bars(ctx, [24], r.x + 16, r.y + 12, r.w - 32, 23, r.y + r.h, pal.ink4);
        const n = (v.props.opts ?? []).length;
        ctx.fillStyle = pal.surface;
        for (let i = 0; i < n; i++) {
          const y = r.y + 50 + i * 42;
          if (y + 36 > r.y + r.h) break;
          rr(ctx, r.x + 12, y, r.w - 24, 36, 9);
          ctx.fill();
        }
      } else if (v.type === "table") {
        const rows = (v.props.rows ?? []).length || 1;
        const cols = (v.props.cols ?? []).length || 1;
        ctx.strokeStyle = pal.line;
        ctx.lineWidth = px;
        ctx.beginPath();
        for (let i = 1; i < rows; i++) {
          const y = r.y + (r.h * i) / rows;
          ctx.moveTo(r.x, y);
          ctx.lineTo(r.x + r.w, y);
        }
        const cw = v.props.cw && v.props.cw.length === cols ? v.props.cw : null;
        const sum = cw ? cw.reduce((a, b) => a + b, 0) : cols;
        let acc = 0;
        for (let i = 0; i < cols - 1; i++) {
          acc += cw ? cw[i]! : 1;
          const x = r.x + (r.w * acc) / sum;
          ctx.moveTo(x, r.y);
          ctx.lineTo(x, r.y + r.h);
        }
        ctx.stroke();
        if (v.props.head !== false && rows > 1) {
          ctx.fillStyle = pal.surface;
          ctx.globalAlpha = A * 0.6;
          ctx.fillRect(r.x + px, r.y + px, r.w - 2 * px, r.h / rows - px);
          ctx.globalAlpha = A;
        }
      } else if (v.type === "timer") {
        ctx.fillStyle = typeof v.props.end === "number" ? pal.accent : pal.ink;
        const fs = Math.min(r.h * 0.32, r.w * 0.18);
        ctx.font = `700 ${fs}px Inter Variable, Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const ms = typeof v.props.end === "number" ? Math.max(0, v.props.end - Date.now()) : (v.props.left ?? v.props.dur ?? 300_000);
        const sec = Math.ceil(ms / 1000);
        ctx.fillText(`${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`, r.x + r.w / 2, r.y + r.h * 0.45);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      } else {
        ctx.fillStyle = pal.colors.cyan;
        ctx.globalAlpha = A * 0.35;
        ctx.beginPath();
        ctx.arc(r.x + 36, r.y + r.h / 2, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = A;
        bars(ctx, [20, 30], r.x + 70, r.y + 16, r.w - 86, 22, r.y + r.h, pal.ink4);
      }
      break;
    }
  }
}

/* ------------------------------ виджеты ------------------------------ */

function drawWidget(ctx: CanvasRenderingContext2D, v: NodeView, pal: Palette, z: number, c: string) {
  const A = ctx.globalAlpha;
  const r = v.rect;
  const p = v.props;
  const px = 1 / z;
  const accent = c === "default" ? pal.accent : pal.colors[c]!;
  const round = v.type === "gate" || v.type === "wheel" || v.type === "token" || v.type === "icon";
  if (!round) {
    rr(ctx, r.x, r.y, r.w, r.h, v.type === "button" ? Math.min(r.h / 2, 18) : 14);
    ctx.fillStyle = fillOf(pal, v) ?? (v.type === "qr" ? "#ffffff" : c === "default" ? pal.card : pal.tinted[c]!);
    ctx.fill();
    ctx.lineWidth = px;
    ctx.strokeStyle = c === "default" ? pal.line : pal.tintedLine[c]!;
    ctx.stroke();
  }
  if (z * 14 < 1.2) return;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (v.type) {
    case "button": {
      rr(ctx, r.x + 10, r.y + 10, r.w - 20, r.h - 20, Math.min((r.h - 20) / 2, 14));
      ctx.fillStyle = p.bv === "outline" ? pal.surface : accent;
      ctx.globalAlpha = A * (p.bv === "soft" ? 0.4 : 1);
      ctx.fill();
      ctx.globalAlpha = A;
      break;
    }
    case "switch": {
      const tw = Math.min(56, r.w * 0.3);
      const th = Math.min(30, r.h * 0.45);
      const tx = r.x + r.w - tw - 16;
      rr(ctx, tx, cy - th / 2, tw, th, th / 2);
      ctx.fillStyle = p.on ? pal.colors.green! : pal.surface;
      ctx.fill();
      ctx.fillStyle = pal.card;
      ctx.beginPath();
      ctx.arc(p.on ? tx + tw - th / 2 : tx + th / 2, cy, th * 0.38, 0, Math.PI * 2);
      ctx.fill();
      bars(ctx, [14], r.x + 16, cy - 12, r.w - tw - 48, 24, r.y + r.h, pal.ink4);
      break;
    }
    case "slider":
    case "countdown":
    case "calc": {
      bars(ctx, [12], r.x + 16, r.y + 12, r.w * 0.5, 22, r.y + r.h, pal.ink4);
      if (v.type === "slider") {
        const lo = p.min ?? 0;
        const hi = p.max ?? 100;
        const k = hi > lo ? Math.max(0, Math.min(1, ((p.sv ?? 0) - lo) / (hi - lo))) : 0;
        const y = r.y + r.h * 0.68;
        rr(ctx, r.x + 16, y - 4, r.w - 32, 8, 4);
        ctx.fillStyle = pal.surface;
        ctx.fill();
        rr(ctx, r.x + 16, y - 4, Math.max(8, (r.w - 32) * k), 8, 4);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r.x + 16 + (r.w - 32) * k, y, 9, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = A * 0.7;
        bars(ctx, [v.type === "calc" ? 5 : 9], r.x + 16, r.y + r.h * 0.45, r.w - 32, Math.min(46, r.h * 0.4), r.y + r.h, accent);
        ctx.globalAlpha = A;
      }
      break;
    }
    case "rating": {
      const n = Math.max(1, Math.min(10, p.max ?? 5));
      const sz = Math.min((r.w - 32) / n - 6, r.h * 0.3);
      let sum = 0;
      let cnt = 0;
      for (const [k, x] of Object.entries(p as Record<string, unknown>)) if (k.startsWith("rt:") && typeof x === "number") (sum += x), cnt++;
      const avg = cnt ? sum / cnt : 0;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < Math.round(avg) ? pal.colors.yellow! : pal.surface;
        ctx.beginPath();
        ctx.arc(r.x + 16 + sz / 2 + i * (sz + 6), r.y + r.h * 0.62, sz / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      bars(ctx, [12], r.x + 16, r.y + 12, r.w * 0.5, 22, r.y + r.h, pal.ink4);
      break;
    }
    case "clock": {
      const R = Math.min(r.w, r.h) * 0.34;
      ctx.strokeStyle = pal.ink4;
      ctx.lineWidth = Math.max(px, R * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy + 6, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + 6);
      ctx.lineTo(cx - R * 0.45, cy + 6 - R * 0.3);
      ctx.moveTo(cx, cy + 6);
      ctx.lineTo(cx + R * 0.55, cy + 6 - R * 0.45);
      ctx.strokeStyle = accent;
      ctx.stroke();
      break;
    }
    case "chart": {
      const data = (p.data ?? []).slice(0, 12);
      const n = Math.max(3, data.length);
      if (p.ct === "pie" || p.ct === "donut") {
        const R = Math.min(r.w, r.h) * 0.36;
        const tot = data.reduce((a, d) => a + Math.max(0, d.v), 0) || 1;
        let a0 = -Math.PI / 2;
        (data.length ? data : [{ l: "", v: 1 }]).forEach((d, i) => {
          const a1 = a0 + (Math.max(0, d.v) / tot) * Math.PI * 2;
          ctx.fillStyle = d.c ? (pal.colors[palKey(pal, d.c)] ?? accent) : pal.colors[COLORS[(i % 8) + 2]!]!;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, R, a0, a1);
          ctx.fill();
          a0 = a1;
        });
        if (p.ct === "donut") {
          ctx.fillStyle = fillOf(pal, v) ?? pal.card;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      const max = Math.max(1, ...data.map((d) => d.v));
      const bw = (r.w - 32) / n;
      ctx.fillStyle = accent;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const k = data[i] ? Math.max(0.04, data[i]!.v / max) : 0.3 + ((i * 37) % 50) / 100;
        const h = (r.h - 56) * k;
        ctx.rect(r.x + 16 + i * bw + bw * 0.15, r.y + r.h - 16 - h, bw * 0.7, h);
      }
      ctx.fill();
      break;
    }
    case "qr": {
      // узор вместо настоящего кода — издали он всё равно не читается
      const m = Math.min(r.w, r.h) - 24;
      const cell = m / 9;
      const x0 = cx - m / 2;
      const y0 = cy - m / 2;
      let seed = 0;
      for (const ch of v.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      ctx.fillStyle = "#111111";
      ctx.beginPath();
      for (let i = 0; i < 9; i++)
        for (let j = 0; j < 9; j++) {
          const corner = (i < 3 && j < 3) || (i > 5 && j < 3) || (i < 3 && j > 5);
          seed = (seed * 1103515245 + 12345) >>> 0;
          if (corner ? !(i % 6 === 1 && j % 6 === 1) : seed % 3 === 0) ctx.rect(x0 + i * cell, y0 + j * cell, cell, cell);
        }
      ctx.fill();
      break;
    }
    case "wheel": {
      const R = Math.min(r.w, r.h) / 2 - 4;
      const n = Math.max(2, Math.min(24, (p.opts ?? []).length || 6));
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = pal.colors[COLORS[(i % 8) + 2]!]!;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = Math.max(px, 3);
      ctx.strokeStyle = pal.card;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "status": {
      const list = Array.isArray(p.sts) && p.sts.length ? p.sts : null;
      const st = list?.[p.st ?? 0];
      const col = st ? (pal.colors[palKey(pal, st.c)] ?? accent) : [pal.colors.gray, pal.colors.blue, pal.colors.orange, pal.colors.green][Math.max(0, Math.min(3, p.st ?? 0))]!;
      rr(ctx, r.x + 12, cy - Math.min(18, r.h * 0.3), r.w - 24, Math.min(36, r.h * 0.6), Math.min(18, r.h * 0.3));
      ctx.fillStyle = col!;
      ctx.globalAlpha = A * 0.45;
      ctx.fill();
      ctx.globalAlpha = A;
      break;
    }
    case "tracker": {
      const n = Math.max(1, Math.min(60, p.cells ?? 7));
      const cols = Math.min(n, 10);
      const rows = Math.ceil(n / cols);
      const cw = (r.w - 32) / cols;
      const ch = Math.min(cw, (r.h - 52) / rows);
      for (let i = 0; i < n; i++) {
        const on = !!(p as Record<string, unknown>)[`k:${i}`];
        rr(ctx, r.x + 16 + (i % cols) * cw + 2, r.y + 44 + Math.floor(i / cols) * ch + 2, cw - 4, ch - 4, 4);
        ctx.fillStyle = on ? accent : pal.surface;
        ctx.fill();
      }
      bars(ctx, [12], r.x + 16, r.y + 10, r.w * 0.5, 22, r.y + 40, pal.ink4);
      break;
    }
    case "stopwatch":
    case "random": {
      bars(ctx, [12], r.x + 16, r.y + 12, r.w * 0.5, 22, r.y + r.h, pal.ink4);
      ctx.globalAlpha = A * 0.7;
      bars(ctx, [v.type === "random" ? 4 : 8], cx - Math.min(r.w - 32, (v.type === "random" ? 4 : 8) * 0.42 * 46) / 2, r.y + r.h * 0.4, r.w - 32, Math.min(46, r.h * 0.4), r.y + r.h, accent);
      ctx.globalAlpha = A;
      break;
    }
    case "input": {
      bars(ctx, [12], r.x + 16, r.y + 10, r.w * 0.5, 22, r.y + r.h, pal.ink4);
      rr(ctx, r.x + 14, r.y + Math.min(44, r.h * 0.45), r.w - 28, Math.min(40, r.h * 0.4), 9);
      ctx.fillStyle = pal.surface;
      ctx.fill();
      break;
    }
    case "flipcard":
    case "spoiler": {
      const on = !!p.on && !(v.type === "flipcard" ? p.self : p.sm === "self");
      if (v.type === "spoiler" && !on) {
        rr(ctx, r.x + 10, r.y + 10, r.w - 20, r.h - 20, 10);
        ctx.fillStyle = accent;
        ctx.globalAlpha = A * 0.35;
        ctx.fill();
        ctx.globalAlpha = A;
      }
      bars(ctx, [Math.max(4, Math.min(16, ((on ? p.bt : v.type === "flipcard" ? p.ft : p.title) ?? "").length))], cx - (r.w - 48) / 4, cy - 12, (r.w - 48) / 2, 24, r.y + r.h, on ? accent : pal.ink4);
      break;
    }
    case "coin": {
      const R = Math.max(4, Math.min(r.w, r.h - 50) * 0.36);
      ctx.beginPath();
      ctx.arc(cx, r.y + (r.h - 34) / 2 + 4, R, 0, Math.PI * 2);
      ctx.fillStyle = pal.colors.yellow!;
      ctx.fill();
      ctx.lineWidth = Math.max(px, R * 0.08);
      ctx.strokeStyle = pal.colors.orange!;
      ctx.stroke();
      break;
    }
    case "deck": {
      const ch = Math.max(8, Math.min(r.h - 76, (r.w - 48) / 2 / 0.7));
      const cw = ch * 0.7;
      const y = r.y + 16;
      for (let i = 2; i >= 0; i--) {
        rr(ctx, cx - cw - 8 - i * 3, y + i * 2, cw, ch, cw * 0.1);
        ctx.fillStyle = accent;
        ctx.globalAlpha = A * (1 - i * 0.25);
        ctx.fill();
      }
      ctx.globalAlpha = A;
      rr(ctx, cx + 8, y, cw, ch, cw * 0.1);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = px;
      ctx.strokeStyle = pal.line;
      ctx.stroke();
      break;
    }
    case "score":
    case "turns":
    case "checklist": {
      bars(ctx, [12], r.x + 16, r.y + 10, r.w * 0.5, 22, r.y + r.h, pal.ink4);
      const list = (v.type === "checklist" ? p.cl : p.pl) ?? [];
      const n = Math.max(1, Math.min(10, list.length || 3));
      const lh = Math.min(32, (r.h - 52) / n);
      const raw = p as Record<string, unknown>;
      for (let i = 0; i < n; i++) {
        const y = r.y + 42 + i * lh;
        if (y + lh > r.y + r.h - 4) break;
        const it = list[i] as { id: string; c?: string } | undefined;
        const s = lh * 0.6;
        rr(ctx, r.x + 16, y + lh * 0.2, s, s, v.type === "checklist" ? s * 0.25 : s / 2);
        ctx.fillStyle =
          v.type === "checklist" ? (it && raw[checkKey(it.id)] ? accent : pal.surface) : (pal.colors[palKey(pal, it?.c ?? COLORS[(i % 8) + 2]!)] ?? accent);
        ctx.fill();
        bars(ctx, [10], r.x + 22 + s, y, r.w - 56 - s, lh, r.y + r.h, v.type === "turns" && i === (p.cur ?? 0) ? accent : pal.ink4);
      }
      break;
    }
    case "buzzer": {
      const R = Math.max(4, Math.min(r.w * 0.3, (r.h - 60) * 0.42));
      ctx.beginPath();
      ctx.arc(cx, r.y + 36 + R, R, 0, Math.PI * 2);
      ctx.fillStyle = c === "default" ? pal.colors.red! : accent;
      ctx.fill();
      break;
    }
    case "calendar": {
      bars(ctx, [10], r.x + 16, r.y + 10, r.w * 0.5, 22, r.y + r.h, pal.ink4);
      const cw = (r.w - 28) / 7;
      const ch = Math.min(cw, (r.h - 56) / 6);
      const raw = Object.keys(p as Record<string, unknown>);
      const now = new Date();
      const ym = /^\d{4}-\d{2}$/.test(p.ym ?? "") ? p.ym! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const marked = new Set(raw.filter((k) => k.startsWith(`k:${ym}-`)).map((k) => Number(k.slice(10, 12))));
      ctx.beginPath();
      for (let i = 0; i < 35; i++) {
        if (marked.has(i + 1)) continue;
        ctx.rect(r.x + 14 + (i % 7) * cw + 2, r.y + 48 + Math.floor(i / 7) * ch + 2, cw - 4, ch - 4);
      }
      ctx.fillStyle = pal.surface;
      ctx.fill();
      ctx.beginPath();
      for (const d of marked) {
        const i = d - 1;
        if (i < 35) ctx.rect(r.x + 14 + (i % 7) * cw + 2, r.y + 48 + Math.floor(i / 7) * ch + 2, cw - 4, ch - 4);
      }
      ctx.fillStyle = accent;
      ctx.fill();
      break;
    }
    case "words": {
      bars(ctx, [14], r.x + 16, r.y + 10, r.w * 0.6, 22, r.y + r.h, pal.ink4);
      const sizes = [22, 14, 30, 16, 12, 20, 18, 12];
      let x = r.x + 18;
      let y = r.y + 48;
      ctx.globalAlpha = A * 0.75;
      for (let i = 0; i < sizes.length; i++) {
        const h = sizes[i]!;
        const w = h * (2.2 + (i % 3) * 0.6);
        if (x + w > r.x + r.w - 16) {
          x = r.x + 18;
          y += 36;
        }
        if (y + h > r.y + r.h - 10) break;
        rr(ctx, x, y + (30 - h) / 2, w, h * 0.6, h * 0.2);
        ctx.fillStyle = pal.colors[COLORS[(i % 8) + 2]!]!;
        ctx.fill();
        x += w + 10;
      }
      ctx.globalAlpha = A;
      break;
    }
    case "icon": {
      const R = Math.min(r.w, r.h) * 0.36;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? R * 0.45 : R;
        ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.lineWidth = Math.max(px, R * 0.12);
      ctx.lineJoin = "round";
      ctx.strokeStyle = c === "default" ? pal.ink : accent;
      ctx.stroke();
      break;
    }
    case "token": {
      const R = Math.min(r.w, r.h) / 2 - 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = fillOf(pal, v) ?? (c === "default" ? pal.colors.blue! : accent);
      ctx.fill();
      ctx.lineWidth = Math.max(px, 2);
      ctx.strokeStyle = pal.card;
      ctx.stroke();
      break;
    }
    case "gate": {
      const R = Math.min(r.w, r.h) / 2 - 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = fillOf(pal, v) ?? (p.on ? pal.colors.green! : pal.card);
      ctx.fill();
      ctx.lineWidth = Math.max(px, 2);
      ctx.strokeStyle = p.on ? pal.colors.green! : pal.line;
      ctx.stroke();
      break;
    }
  }
}

/* ---------------------- уменьшенные копии картинок ----------------------
   Рисовать оригинал в 2000 точек размером в 40 на каждом кадре дорого:
   для дальнего плана держим копии по 64, 160 и 400 точек. */
const MIPS = [64, 160, 400];
const mips = new Map<string, { bmp: ImageBitmap | null; failed: boolean }>();
let mipsBroken = typeof createImageBitmap !== "function";

function mipOf(url: string, img: HTMLImageElement, screenPx: number, onload?: () => void): CanvasImageSource {
  if (mipsBroken) return img;
  const nat = Math.max(img.naturalWidth, img.naturalHeight);
  const size = MIPS.find((m) => m >= screenPx * 1.15);
  if (!size || size >= nat * 0.75) return img;
  const key = `${size}\u0001${url}`;
  let e = mips.get(key);
  if (e) {
    mips.delete(key);
    mips.set(key, e);
    return e.bmp ?? img;
  }
  e = { bmp: null, failed: false };
  const entry = e;
  mips.set(key, entry);
  const k = size / nat;
  createImageBitmap(img, { resizeWidth: Math.max(1, Math.round(img.naturalWidth * k)), resizeHeight: Math.max(1, Math.round(img.naturalHeight * k)), resizeQuality: "medium" })
    .then((bmp) => {
      if (mips.get(key) !== entry) return bmp.close();
      entry.bmp = bmp;
      onload?.();
    })
    .catch(() => {
      entry.failed = true;
      mipsBroken = true;
    });
  if (mips.size > 700) {
    const first = mips.keys().next().value;
    if (first) {
      mips.get(first)?.bmp?.close();
      mips.delete(first);
    }
  }
  return img;
}

/* ------------------------------ превью ------------------------------ */

/** Превью доски: всё содержимое, вписанное в w×h. */
export async function renderThumb(s: BoardStore, w = 640, h = 400): Promise<Blob | null> {
  const box = s.allBounds();
  if (!box) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pad = 28;
  const z = Math.min((w - pad * 2) / Math.max(box.w, 1), (h - pad * 2) / Math.max(box.h, 1), 1);
  const view = { x: w / 2 - (box.x + box.w / 2) * z, y: h / 2 - (box.y + box.h / 2) * z, z, w, h };
  // картинкам — шанс догрузиться
  drawScene(ctx, s, view, { background: true, readonly: true, onImage: () => {} });
  await new Promise((r) => setTimeout(r, 400));
  drawScene(ctx, s, view, { background: true, labels: true, readonly: true });
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/webp", 0.82));
}

/* ------------------------------ мини-карта ------------------------------ */

export function drawMini(ctx: CanvasRenderingContext2D, s: BoardStore, view: SceneView, dpr: number) {
  const pal = readPalette();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
  const min = 1.5 / view.z;
  for (const v of s.order) {
    const b = v.type === "path" ? s.bounds(v) : aabb(v.rect, v.r);
    const c = palKey(pal, v.props.color);
    if (v.type === "frame") {
      ctx.fillStyle = pal.frameFill[c];
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 1 / view.z;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      continue;
    }
    ctx.fillStyle =
      v.type === "note" ? (c === "default" ? pal.ink4 : pal.colors[c]) : v.type === "image" || v.type === "video" ? pal.ink3 : v.type === "path" || v.type === "ink" ? pal.ink4 : pal.ink4;
    ctx.globalAlpha = v.type === "path" || v.type === "ink" ? 0.6 : 0.9;
    ctx.fillRect(b.x, b.y, Math.max(b.w, min), Math.max(b.h, min));
  }
  ctx.globalAlpha = 1;
}
