/* Оформление любого объекта: заливка (в том числе градиент), цвет текста,
   обводка, углы, тень, эффект, отражение, фильтр картинки и метка.
   Поля плоские и необязательные — старые доски выглядят как раньше. */
import { toasts } from "../lib/toast.svelte.ts";
import type { Board } from "./board.svelte.ts";
import { readableOn } from "../lib/color.ts";
import { colorCss, isHex, type NodeData, type NodeProps, type NodeType } from "./model.ts";
import type { NodeView } from "./store.svelte.ts";

export type Shadow = "none" | "s" | "m" | "l" | "glow" | "neon";
export type Effect = "none" | "float" | "pulse" | "wobble" | "bounce" | "spin" | "shake" | "rainbow" | "glow" | "breathe";
export type Flip = "h" | "v" | "hv";
export type Filter = "gray" | "sepia" | "vivid" | "dim" | "warm" | "cool" | "invert" | "blur";
export type BorderStyle = "solid" | "dashed" | "dotted" | "double";

export interface NodeStyle {
  /** Заливка: имя палитры или #hex; второй цвет — градиент под углом ga. */
  fc?: string;
  fc2?: string;
  ga?: number;
  /** Цвет текста. */
  tc?: string;
  /** Обводка: цвет, толщина (px), вид. */
  bc?: string;
  bw?: number;
  bs?: BorderStyle;
  /** Скругление углов, px. */
  rad?: number;
  shd?: Shadow;
  fx?: Effect;
  flip?: Flip;
  flt?: Filter;
  /** Метка в углу: эмодзи или пара слов, и её цвет. */
  tag?: string;
  tagc?: string;
  opacity?: number;
  /** Начертание текста: толщина, курсив, регистр, межбуквенный и межстрочный интервалы, эффект. */
  tw?: NodeProps["tw"];
  ti?: boolean;
  tt?: NodeProps["tt"];
  tls?: NodeProps["tls"];
  tlh?: NodeProps["tlh"];
  tfx?: NodeProps["tfx"];
}

export const TEXT_STYLE_KEYS = ["tw", "ti", "tt", "tls", "tlh", "tfx"] as const;
export const STYLE_KEYS = ["fc", "fc2", "ga", "tc", "bc", "bw", "bs", "rad", "shd", "fx", "flip", "flt", "tag", "tagc", "opacity", ...TEXT_STYLE_KEYS, "color", "font"] as const;

export const SHADOWS: [Shadow, string][] = [
  ["none", "Нет"],
  ["s", "Лёгкая"],
  ["m", "Средняя"],
  ["l", "Глубокая"],
  ["glow", "Свечение"],
  ["neon", "Неон"],
];
export const EFFECTS: [Effect, string][] = [
  ["none", "Нет"],
  ["float", "Парение"],
  ["pulse", "Пульс"],
  ["breathe", "Дыхание"],
  ["wobble", "Качание"],
  ["bounce", "Прыжки"],
  ["shake", "Дрожь"],
  ["spin", "Вращение"],
  ["glow", "Мерцание"],
  ["rainbow", "Радуга"],
];
export const FILTERS: [Filter | "none", string][] = [
  ["none", "Нет"],
  ["gray", "Ч/б"],
  ["sepia", "Сепия"],
  ["vivid", "Ярче"],
  ["dim", "Темнее"],
  ["warm", "Тёплый"],
  ["cool", "Холодный"],
  ["invert", "Негатив"],
  ["blur", "Размытие"],
];
export const WEIGHTS: [string, string][] = [
  ["light", "Тонкий"],
  ["", "Обычный"],
  ["bold", "Жирный"],
  ["heavy", "Чёрный"],
];
export const CASES: [string, string][] = [
  ["", "Как есть"],
  ["up", "ПРОПИСНЫЕ"],
  ["sc", "Капитель"],
];
export const SPACINGS: [string, string][] = [
  ["tight", "Плотно"],
  ["", "Обычно"],
  ["wide", "Свободно"],
  ["wider", "Вразрядку"],
];
export const LEADINGS: [string, string][] = [
  ["tight", "Плотно"],
  ["", "Обычно"],
  ["loose", "Свободно"],
];
export const TEXT_FX: [string, string][] = [
  ["", "Нет"],
  ["shadow", "Тень"],
  ["outline", "Обводка"],
  ["glow", "Свечение"],
  ["pop", "Объём"],
];

export const BORDERS: [BorderStyle, string][] = [
  ["solid", "Сплошная"],
  ["dashed", "Штрихи"],
  ["dotted", "Точки"],
  ["double", "Двойная"],
];

/** Чему что подходит. */
const NO_FILL = new Set<NodeType>(["path", "ink", "image", "video", "comment"]);
const NO_BOX = new Set<NodeType>(["path", "ink", "comment"]);
export const canFill = (t: NodeType) => !NO_FILL.has(t);
export const canBox = (t: NodeType) => !NO_BOX.has(t);
export const canFlip = (t: NodeType) => t === "image" || t === "sticker" || t === "shape" || t === "ink" || t === "video";
export const canFilter = (t: NodeType) => t === "image" || t === "video" || t === "sticker" || t === "link";
/** Где своё начертание текста имеет смысл: свободный текст объекта. */
const TEXT_STYLE_TYPES = new Set<NodeType>(["note", "text", "shape", "path", "frame"]);
export const canTextStyle = (t: NodeType) => TEXT_STYLE_TYPES.has(t);

export interface Preset {
  id: string;
  label: string;
  style: NodeStyle;
}

/** Готовые наборы — одним нажатием. */
export const PRESETS: Preset[] = [
  { id: "sunset", label: "Закат", style: { fc: "#ff7a59", fc2: "#c026d3", ga: 135, tc: "#ffffff", bw: 0, shd: "m", rad: 18 } },
  { id: "ocean", label: "Океан", style: { fc: "#0ea5e9", fc2: "#6366f1", ga: 135, tc: "#ffffff", bw: 0, shd: "m", rad: 18 } },
  { id: "mint", label: "Мята", style: { fc: "#34d399", fc2: "#06b6d4", ga: 120, tc: "#05261f", bw: 0, shd: "s", rad: 16 } },
  { id: "neon", label: "Неон", style: { fc: "#0b0b14", tc: "#e0fbff", bc: "#22d3ee", bw: 2, shd: "neon", rad: 14 } },
  { id: "paper", label: "Бумага", style: { fc: "#fdf6e3", tc: "#3b3325", bc: "#e8dcc0", bw: 1, shd: "s", rad: 4 } },
  { id: "ink", label: "Чернила", style: { fc: "#111113", tc: "#f4f4f5", bw: 0, shd: "l", rad: 12 } },
  { id: "outline", label: "Контур", style: { fc: "transparent", bc: "#a1a1aa", bw: 2, bs: "dashed", shd: "none", rad: 12 } },
  { id: "gold", label: "Золото", style: { fc: "#fde68a", fc2: "#f59e0b", ga: 160, tc: "#3f2a00", bc: "#b45309", bw: 1, shd: "glow", rad: 14 } },
  { id: "candy", label: "Леденец", style: { fc: "#fbcfe8", fc2: "#c4b5fd", ga: 90, tc: "#3b0764", bw: 0, shd: "s", rad: 26 } },
  { id: "matrix", label: "Матрица", style: { fc: "#02140a", tc: "#4ade80", bc: "#16a34a", bw: 1, shd: "glow", rad: 6, font: "mono" } as NodeStyle },
  { id: "arcade", label: "Аркада", style: { fc: "#120a2a", fc2: "#2b0f4a", ga: 180, tc: "#fef08a", bc: "#f472b6", bw: 2, shd: "neon", rad: 4, font: "pixel", tt: "up", tfx: "pop" } as NodeStyle },
  { id: "scroll", label: "Свиток", style: { fc: "#f3e3bf", fc2: "#e2c48e", ga: 180, tc: "#4a2f12", bc: "#9a6b34", bw: 2, bs: "double", shd: "m", rad: 6, font: "old" } as NodeStyle },
  { id: "comic", label: "Комикс", style: { fc: "#fde047", tc: "#111111", bc: "#111111", bw: 3, shd: "l", rad: 8, font: "marker", tw: "bold", tfx: "shadow" } as NodeStyle },
  { id: "title", label: "Заголовок", style: { fc: "#18181b", tc: "#fafafa", bw: 0, shd: "m", rad: 10, tw: "heavy", tt: "up", tls: "wide" } as NodeStyle },
  { id: "hologram", label: "Голограмма", style: { fc: "#0b1d2b", fc2: "#1b0b2e", ga: 120, tc: "#a5f3fc", bc: "#67e8f9", bw: 1, shd: "glow", rad: 14, font: "tech", tfx: "glow", tls: "wide" } as NodeStyle },
];

const css = (c: string | undefined) => (!c ? "" : c === "transparent" ? "transparent" : colorCss(c));

/** Классы и CSS-переменные узла для NodeHost. */
export function styleOf(p: NodeProps): { cls: string; vars: string } {
  const cls: string[] = [];
  const vars: string[] = [];
  if (p.fc) {
    const a = css(p.fc);
    const bg = p.fc2 ? `linear-gradient(${Math.round(p.ga ?? 135)}deg, ${a}, ${css(p.fc2)})` : a;
    cls.push("sx-fill");
    vars.push(`--fill:${bg}`, `--fill-c:${a}`);
  }
  if (p.tc) {
    cls.push("sx-text");
    vars.push(`--tc:${css(p.tc)}`);
  } else if (p.fc && p.fc !== "transparent") {
    // своя заливка без своего цвета текста — текст сам становится читаемым
    cls.push("sx-text");
    vars.push(`--tc:${isHex(p.fc) ? readableOn(p.fc) : "var(--solid-ink)"}`);
  }
  if (typeof p.bw === "number" || p.bc || p.bs) {
    cls.push("sx-border");
    vars.push(`--bw:${Math.max(0, Math.min(16, p.bw ?? 2))}px`, `--bc:${p.bc ? css(p.bc) : "var(--line-3)"}`, `--bs:${p.bs ?? "solid"}`);
  }
  if (typeof p.rad === "number") {
    cls.push("sx-rad");
    vars.push(`--rad:${Math.max(0, Math.min(200, p.rad))}px`);
  }
  if (p.shd) {
    cls.push(`shd-${p.shd}`);
    if (p.shd === "glow" || p.shd === "neon") vars.push(`--glow:${p.bc ? css(p.bc) : p.fc && p.fc !== "transparent" ? css(p.fc) : "var(--c, var(--accent))"}`);
  }
  if (p.fx && p.fx !== "none") cls.push(`fx-${p.fx}`);
  if (p.flip) cls.push(`flip-${p.flip}`);
  if (p.flt) cls.push(`flt-${p.flt}`);
  // начертание текста — классы, правила в custom.css
  if (p.tw) cls.push(`tw-${p.tw}`);
  if (p.ti) cls.push("ti");
  if (p.tt) cls.push(`tt-${p.tt}`);
  if (p.tls) cls.push(`tls-${p.tls}`);
  if (p.tlh) cls.push(`tlh-${p.tlh}`);
  if (p.tfx) cls.push(`tfx-${p.tfx}`);
  return { cls: cls.join(" "), vars: vars.join(";") };
}

export function hasStyle(p: NodeProps): boolean {
  return STYLE_KEYS.some((k) => k !== "color" && k !== "font" && (p as Record<string, unknown>)[k] !== undefined);
}

/* ------------------------- копировать/вставить ------------------------- */

const CLIP_KEY = "space:style-clip";

export function copyStyle(v: NodeView) {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) {
    const x = (v.props as Record<string, unknown>)[k];
    if (x !== undefined) out[k] = x;
  }
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(out));
  } catch {
    /* без памяти */
  }
  toasts.show("Оформление скопировано", { kind: "ok", ms: 1400 });
}

export function copiedStyle(): Record<string, unknown> | null {
  try {
    const x = JSON.parse(localStorage.getItem(CLIP_KEY) || "null");
    return x && typeof x === "object" ? x : null;
  } catch {
    return null;
  }
}

/** Патч, который заменяет оформление целиком (лишнее — убрать). */
export function stylePatch(style: Record<string, unknown>): Partial<NodeData> {
  const patch: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (k !== "color" && k !== "font") patch[k] = style[k] ?? undefined;
  if (style.color !== undefined) patch.color = style.color;
  if (style.font !== undefined) patch.font = style.font;
  return patch as Partial<NodeData>;
}

export function pasteStyle(b: Board, ids: string[]) {
  const st = copiedStyle();
  if (!st) return toasts.show("Сначала скопируйте оформление");
  b.view.updateMany(ids.map((id) => [id, stylePatch(st)]));
}

export function resetStyle(b: Board, ids: string[]) {
  b.view.updateMany(ids.map((id) => [id, stylePatch({})]));
}
