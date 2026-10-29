/* Оформление. Тема одна — тёмная; меняются акцент (личная настройка
   устройства) и фон доски (общий, хранится в документе доски).
   Значения — атрибуты <html>: CSS-токены пересчитываются сами, а холсты
   (дальний план, свечение, мини-карта) перерисовываются по look.v. */

export const ACCENTS = [
  { id: "orange", label: "Оранжевый", color: "#f08a4b" },
  { id: "amber", label: "Янтарный", color: "#f2b544" },
  { id: "sand", label: "Песочный", color: "#d9b58c" },
  { id: "lime", label: "Лаймовый", color: "#a6d64e" },
  { id: "green", label: "Зелёный", color: "#4fcf88" },
  { id: "cyan", label: "Бирюзовый", color: "#36c3d3" },
  { id: "blue", label: "Синий", color: "#5c9df7" },
  { id: "indigo", label: "Индиго", color: "#7d86f5" },
  { id: "violet", label: "Фиолетовый", color: "#9f86f8" },
  { id: "pink", label: "Розовый", color: "#ee6fae" },
  { id: "red", label: "Красный", color: "#ef6461" },
  { id: "white", label: "Белый", color: "#e6e6ec" },
] as const;
export type Accent = (typeof ACCENTS)[number]["id"];

export const BACKDROPS = [
  { id: "graphite", label: "Графит", color: "#0f0f12", dot: "#ffffff" },
  { id: "midnight", label: "Полночь", color: "#0b0e17", dot: "#aabeff" },
  { id: "ocean", label: "Океан", color: "#08131a", dot: "#8cdceb" },
  { id: "forest", label: "Лес", color: "#0b120e", dot: "#a0e6b4" },
  { id: "plum", label: "Слива", color: "#120d17", dot: "#dcb4ff" },
  { id: "espresso", label: "Эспрессо", color: "#13100d", dot: "#ffe1be" },
  { id: "slate", label: "Сланец", color: "#15171c", dot: "#ffffff" },
  { id: "wine", label: "Вино", color: "#160b10", dot: "#ffb4cd" },
  { id: "olive", label: "Олива", color: "#111209", dot: "#e6eba0" },
  { id: "space", label: "Космос", color: "#07060f", dot: "#c8b9ff" },
  { id: "steel", label: "Сталь", color: "#11161d", dot: "#b4d2f0" },
  { id: "black", label: "Чёрный", color: "#050506", dot: "#ffffff" },
] as const;
export type Backdrop = (typeof BACKDROPS)[number]["id"];

/** Образец фона для меню (строится кодом, без пользовательского ввода). */
export function backdropGlyph(id: string): string {
  const b = BACKDROPS.find((x) => x.id === id) ?? BACKDROPS[0];
  const dots = [6, 13, 20].map((x) => `<circle cx="${x}" cy="8" r="1"/>`).join("");
  return `<svg width="26" height="16" viewBox="0 0 26 16" aria-hidden="true"><rect x=".5" y=".5" width="25" height="15" rx="4.5" fill="${b.color}" stroke="rgb(255 255 255 / .2)"/><g fill="${b.dot}" fill-opacity=".55">${dots}</g></svg>`;
}

export const accentGlyph = (color: string) =>
  `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="${color}"/></svg>`;

export const isBackdrop = (v: unknown): v is Backdrop => BACKDROPS.some((b) => b.id === v);

/** Версия оформления: растёт при каждой смене акцента или фона. */
export const look = $state({ v: 0 });
let ver = 0;

export function applyLook(attr: "accent" | "bg", value: string | null | undefined) {
  const el = document.documentElement;
  const next = value && value !== (attr === "bg" ? "graphite" : "orange") ? value : undefined;
  if (el.dataset[attr] === next) return;
  if (next) el.dataset[attr] = next;
  else delete el.dataset[attr];
  look.v = ++ver;
  const bg = BACKDROPS.find((b) => b.id === (el.dataset.bg ?? "graphite"))?.color ?? "#0f0f12";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}
