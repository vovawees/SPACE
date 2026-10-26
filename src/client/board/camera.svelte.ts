/* Камера: сдвиг и масштаб. Экран = мир × z + (x, y).
   Отсечение (cull) — прямоугольник мира с запасом вокруг экрана; он
   пересчитывается, только когда экран выходит за запас или масштаб
   заметно меняется — поэтому при обычной прокрутке DOM не трогается. */
import type { Pt, Rect } from "./geometry.ts";

export const MIN_ZOOM = 0.04;
export const MAX_ZOOM = 8;

export class Camera {
  x = $state(0);
  y = $state(0);
  z = $state(1);
  vw = $state(800);
  vh = $state(600);
  /** Идёт движение (прокрутка/масштаб) — слой мира в режиме will-change. */
  moving = $state(false);
  cull = $state.raw<Rect>({ x: -2000, y: -2000, w: 4000, h: 4000 });
  /** Масштаб, при котором считался cull. */
  private cullZ = 1;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private anim = 0;

  toWorld(sx: number, sy: number): Pt {
    return { x: (sx - this.x) / this.z, y: (sy - this.y) / this.z };
  }

  toScreen(wx: number, wy: number): Pt {
    return { x: wx * this.z + this.x, y: wy * this.z + this.y };
  }

  /** Видимая область мира. */
  get view(): Rect {
    return { x: -this.x / this.z, y: -this.y / this.z, w: this.vw / this.z, h: this.vh / this.z };
  }

  get center(): Pt {
    return this.toWorld(this.vw / 2, this.vh / 2);
  }

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.touch();
  }

  pan(dx: number, dy: number) {
    this.stop();
    this.x += dx;
    this.y += dy;
    this.touch();
  }

  zoomAt(sx: number, sy: number, factor: number) {
    this.stop();
    const z = clampZoom(this.z * factor);
    const k = z / this.z;
    this.x = sx - (sx - this.x) * k;
    this.y = sy - (sy - this.y) * k;
    this.z = z;
    this.touch();
  }

  zoomTo(z: number, animate = true) {
    const c = { x: this.vw / 2, y: this.vh / 2 };
    const nz = clampZoom(z);
    const w = this.toWorld(c.x, c.y);
    this.go(c.x - w.x * nz, c.y - w.y * nz, nz, animate);
  }

  /** Показать прямоугольник мира целиком. */
  fit(r: Rect, opts: { pad?: number; maxZoom?: number; animate?: boolean; insetTop?: number; insetBottom?: number } = {}) {
    const pad = opts.pad ?? 80;
    const top = opts.insetTop ?? 64;
    const bottom = opts.insetBottom ?? 84;
    const aw = Math.max(50, this.vw - pad * 2);
    const ah = Math.max(50, this.vh - pad * 2 - top - bottom);
    const z = clampZoom(Math.min(aw / Math.max(r.w, 1), ah / Math.max(r.h, 1), opts.maxZoom ?? 1));
    const x = this.vw / 2 - (r.x + r.w / 2) * z;
    const y = top + (this.vh - top - bottom) / 2 - (r.y + r.h / 2) * z;
    this.go(x, y, z, opts.animate ?? true);
  }

  /** Подвинуть доску ровно настолько, чтобы прямоугольник стал виден (с полями под панелями). */
  reveal(r: Rect, pad = 72) {
    const top = 64 + pad;
    const bottom = 96 + pad;
    const a = this.toScreen(r.x, r.y);
    const c = this.toScreen(r.x + r.w, r.y + r.h);
    let dx = 0;
    let dy = 0;
    if (c.x - a.x > this.vw - pad * 2) dx = this.vw / 2 - (a.x + c.x) / 2;
    else if (a.x < pad) dx = pad - a.x;
    else if (c.x > this.vw - pad) dx = this.vw - pad - c.x;
    if (c.y - a.y > this.vh - top - bottom) dy = this.vh / 2 - (a.y + c.y) / 2;
    else if (a.y < top) dy = top - a.y;
    else if (c.y > this.vh - bottom) dy = this.vh - bottom - c.y;
    if (dx || dy) this.go(this.x + dx, this.y + dy, this.z);
  }

  centerOn(p: Pt, animate = true) {
    this.go(this.vw / 2 - p.x * this.z, this.vh / 2 - p.y * this.z, this.z, animate);
  }

  go(x: number, y: number, z: number, animate = true) {
    this.stop();
    if (!animate || document.documentElement.hasAttribute("data-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.set(x, y, z);
      return;
    }
    const z0 = this.z;
    // центр экрана в мире — в начале и в конце
    const c0 = this.toWorld(this.vw / 2, this.vh / 2);
    const c1 = { x: (this.vw / 2 - x) / z, y: (this.vh / 2 - y) / z };
    const lz0 = Math.log(z0);
    const lz1 = Math.log(z);
    const t0 = performance.now();
    const dur = 380;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const nz = Math.exp(lz0 + (lz1 - lz0) * e);
      const cx = c0.x + (c1.x - c0.x) * e;
      const cy = c0.y + (c1.y - c0.y) * e;
      this.z = nz;
      this.x = this.vw / 2 - cx * nz;
      this.y = this.vh / 2 - cy * nz;
      this.touch();
      if (k < 1) this.anim = requestAnimationFrame(step);
      else {
        this.x = x;
        this.y = y;
        this.z = z;
        this.anim = 0;
        this.touch();
      }
    };
    this.anim = requestAnimationFrame(step);
  }

  stop() {
    if (this.anim) cancelAnimationFrame(this.anim);
    this.anim = 0;
  }

  /** Отметить движение и обновить отсечение. */
  touch() {
    if (!this.moving) this.moving = true;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => (this.moving = false), 160);
    this.updateCull();
  }

  updateCull(force = false) {
    const v = this.view;
    const c = this.cull;
    const inside = v.x >= c.x && v.y >= c.y && v.x + v.w <= c.x + c.w && v.y + v.h <= c.y + c.h;
    const zoomChanged = this.z / this.cullZ > 1.6 || this.z / this.cullZ < 0.625;
    if (!force && inside && !zoomChanged) return;
    // запас вокруг экрана; при отдалении в него попадает много узлов — берём меньше
    const k = this.z < 0.5 ? 0.35 : 0.6;
    const mx = v.w * k;
    const my = v.h * k;
    this.cull = { x: v.x - mx, y: v.y - my, w: v.w + mx * 2, h: v.h + my * 2 };
    this.cullZ = this.z;
  }

  resize(w: number, h: number) {
    this.vw = w;
    this.vh = h;
    this.updateCull(true);
  }
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Ступени для кнопок +/−. */
const STEPS = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

export function nextZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return STEPS.find((s) => s > z * 1.01) ?? MAX_ZOOM;
  return [...STEPS].reverse().find((s) => s < z / 1.01) ?? MIN_ZOOM;
}
