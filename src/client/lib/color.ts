/* Цвета: разбор, перевод между RGB/HSV/#hex и именами палитры доски. */
export type RGB = [number, number, number];
export interface HSV {
  h: number;
  s: number;
  v: number;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function normHex(raw: string): `#${string}` | null {
  let t = raw.trim().toLowerCase();
  if (!t) return null;
  if (!t.startsWith("#")) t = "#" + t;
  if (/^#[\da-f]{3}$/.test(t)) t = "#" + [...t.slice(1)].map((c) => c + c).join("");
  if (/^#[\da-f]{8}$/.test(t)) t = t.slice(0, 7);
  return /^#[\da-f]{6}$/.test(t) ? (t as `#${string}`) : null;
}

export function hexToRgb(hex: string): RGB | null {
  const h = normHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): `#${string}` {
  return `#${[r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

export function rgbToHsv([r, g, b]: RGB): HSV {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

export const hsvToHex = (c: HSV) => rgbToHex(hsvToRgb(c));

/** Любой CSS-цвет (имя палитры через var(--c-…), rgb(), #hex) — в #rrggbb. */
export function resolveCss(css: string): `#${string}` | null {
  const direct = normHex(css);
  if (direct) return direct;
  if (typeof document === "undefined") return null;
  const probe = document.createElement("span");
  probe.style.color = css;
  probe.style.display = "none";
  document.body.append(probe);
  const got = getComputedStyle(probe).color;
  probe.remove();
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(got);
  return m ? rgbToHex([Number(m[1]), Number(m[2]), Number(m[3])]) : null;
}

/** Контрастный цвет текста поверх заливки. */
export function readableOn(hex: string): "#111111" | "#ffffff" {
  const c = hexToRgb(hex);
  if (!c) return "#111111";
  const [r, g, b] = c.map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? "#111111" : "#ffffff";
}

/** Готовые цвета палитры «свой цвет». */
export const SWATCHES = [
  "#ffffff", "#d4d4d8", "#71717a", "#27272a", "#000000",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#fda4af", "#fde68a", "#bbf7d0",
  "#bae6fd", "#c7d2fe", "#e9d5ff", "#7c2d12", "#1e3a8a",
] as const;
