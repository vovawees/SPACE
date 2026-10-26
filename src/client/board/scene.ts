/* Холст дальнего плана. При сильном отдалении DOM-узлы не рисуются
   вовсе — тысячи карточек превращаются в упрощённые фигуры на одном
   canvas. Тот же отрисовщик делает превью досок и мини-карту. */
import { fileUrl } from "./files.ts";
import { pinScale } from "./nodes/comment.ts";
import { aabb, intersects, type Rect } from "./geometry.ts";
import { colorKey, COLORS, isHex } from "./model.ts";
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

  // рамки — снизу
  for (const v of order) {
    if (v.type !== "frame") continue;
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

const alphaOf = (v: NodeView) => (typeof v.props.opacity === "number" ? Math.max(0.1, Math.min(1, v.props.opacity)) : 1);

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
      ctx.fillStyle = v.type === "note" ? pal.tinted[c] : pal.card;
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
          ctx.drawImage(img, r.x, r.y, r.w, ih);
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
      ctx.fillStyle = pal.codeBg;
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
      if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
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
      if (p.fill !== "none") {
        ctx.fillStyle = p.fill === "solid" ? pal.colors[c] : pal.shapeFill[c];
        ctx.fill(path);
      }
      ctx.lineWidth = Math.max(sw, px);
      ctx.strokeStyle = pal.colors[c];
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
      ctx.fillStyle = tinted ? pal.tinted[c] : pal.card;
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
  drawScene(ctx, s, view, { background: true, onImage: () => {} });
  await new Promise((r) => setTimeout(r, 400));
  drawScene(ctx, s, view, { background: true, labels: true });
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
