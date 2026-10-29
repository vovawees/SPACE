/* Разработка и дизайн (1.3): канбан, дорожная карта, карточка персонажа,
   таблица добычи, кривая баланса, палитра, карта уровня и покер
   планирования. Всё, что правят одновременно несколько человек (карточки,
   этапы, клетки карты, карты покера), лежит в отдельных полях — правки
   разных людей не затирают друг друга. */
import { nanoid } from "nanoid";
import type { Board } from "../board.svelte.ts";
import {
  barKey,
  cardKey,
  objectKey,
  pokerKey,
  terrainKey,
  type CurveSeries,
  type KanbanCard,
  type KanbanCol,
  type LootItem,
  type NodeData,
  type NodeProps,
  type PeriodUnit,
  type Player,
  type RoadBar,
  type Swatch,
  type Tile,
} from "../model.ts";
import type { BoardStore, NodeView } from "../store.svelte.ts";
import { compile } from "./formula.ts";
import { randInt } from "./games.ts";
import { MONTHS } from "./play.ts";
import { inputsOf, numValue } from "./values.ts";

type Patch = Record<string, unknown>;
const raw = (p: NodeProps) => p as Record<string, unknown>;
const put = (b: Board, id: string, patch: Patch) => b.view.update(id, patch as Partial<NodeData>);
const putMany = (b: Board, list: [string, Patch][]) => b.view.updateMany(list.map(([id, p]) => [id, p as Partial<NodeData>]));
type Who = { n: string; c: string };
const by = (b: Board): Who => ({ n: b.me.name, c: b.me.color });

/** Записи с приставкой (kc:, rb:): id и значение-объект. */
function entries<T extends object>(p: NodeProps, prefix: string): (T & { id: string })[] {
  const out: (T & { id: string })[] = [];
  for (const [k, x] of Object.entries(raw(p))) if (k.startsWith(prefix) && x && typeof x === "object") out.push({ ...(x as T), id: k.slice(prefix.length) });
  return out;
}

/** Порядковый номер между соседями (дробный — вставка без перенумерации). */
export function orderBetween(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 1;
  if (a === undefined) return b! - 1;
  if (b === undefined) return a + 1;
  return (a + b) / 2;
}

/* --------------------------------- канбан --------------------------------- */

export const DEFAULT_COLS: KanbanCol[] = [
  { id: "a", t: "Идеи", c: "gray" },
  { id: "b", t: "В работе", c: "blue" },
  { id: "d", t: "Готово", c: "green" },
];
export const kanbanCols = (p: NodeProps): KanbanCol[] => (Array.isArray(p.kb) && p.kb.length ? p.kb : DEFAULT_COLS);
export type Card = KanbanCard & { id: string };

/** Карточки по колонкам, по порядку; карточки удалённой колонки — в первой. */
export function cardsByCol(p: NodeProps): Map<string, Card[]> {
  const cols = kanbanCols(p);
  const map = new Map(cols.map((c) => [c.id, [] as Card[]]));
  for (const c of entries<KanbanCard>(p, "kc:")) {
    if (typeof c.t !== "string") continue;
    (map.get(c.col) ?? map.get(cols[0]!.id)!).push(c);
  }
  for (const list of map.values()) list.sort((a, b) => (a.o ?? 0) - (b.o ?? 0) || a.id.localeCompare(b.id));
  return map;
}

/** [в последней колонке, всего]. */
export function kanbanDone(p: NodeProps): [number, number] {
  const by = cardsByCol(p);
  const cols = kanbanCols(p);
  let all = 0;
  for (const l of by.values()) all += l.length;
  return [by.get(cols.at(-1)!.id)?.length ?? 0, all];
}

export function addCard(b: Board, v: NodeView, col: string, t: string, at: "start" | "end" = "end"): string {
  const list = cardsByCol(v.props).get(col) ?? [];
  const id = nanoid(8);
  const o = at === "start" ? orderBetween(undefined, list[0]?.o) : orderBetween(list.at(-1)?.o, undefined);
  put(b, v.id, { [cardKey(id)]: { t: t.slice(0, 500), col, o } satisfies KanbanCard });
  return id;
}

/** Переложить карточку: в колонку col, перед карточкой с номером index (без неё самой). */
export function moveCard(b: Board, v: NodeView, id: string, col: string, index: number) {
  const card = raw(v.props)[cardKey(id)] as KanbanCard | undefined;
  if (!card) return;
  const list = (cardsByCol(v.props).get(col) ?? []).filter((c) => c.id !== id);
  const i = Math.max(0, Math.min(list.length, index));
  const o = orderBetween(list[i - 1]?.o, list[i]?.o);
  if (card.col === col && card.o === o) return;
  put(b, v.id, { [cardKey(id)]: { ...card, col, o } });
}

export function setCard(b: Board, v: NodeView, id: string, patch: Partial<KanbanCard>) {
  const card = raw(v.props)[cardKey(id)] as KanbanCard | undefined;
  if (card) put(b, v.id, { [cardKey(id)]: { ...card, ...patch } });
}

export const removeCard = (b: Board, v: NodeView, id: string) => put(b, v.id, { [cardKey(id)]: undefined });

/** Убрать карточки последней колонки («Готово»). */
export function clearDone(b: Board, ids: string[]) {
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "kanban") return [];
      const last = kanbanCols(v.props).at(-1)!.id;
      const patch: Patch = {};
      for (const c of cardsByCol(v.props).get(last) ?? []) patch[cardKey(c.id)] = undefined;
      return [[id, patch] as [string, Patch]];
    }),
  );
}

/* ----------------------------- дорожная карта ----------------------------- */

export const PERIOD_UNITS: [PeriodUnit, string][] = [
  ["w", "Недели"],
  ["s", "Спринты"],
  ["m", "Месяцы"],
  ["q", "Кварталы"],
  ["d", "Дни"],
];
const MON_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const periodCount = (p: NodeProps) => Math.max(2, Math.min(36, Math.round(p.pn ?? 8)));

/** Подписи периодов: «Нед 1», «Спринт 3», «Мар», «Q2», «День 5». */
export function periodLabels(p: NodeProps): string[] {
  const n = periodCount(p);
  const s = Math.round(p.ps ?? (p.pu === "m" ? new Date().getMonth() : 1));
  return Array.from({ length: n }, (_, i) => {
    switch (p.pu ?? "w") {
      case "m":
        return MON_SHORT[(((s + i) % 12) + 12) % 12]!;
      case "q":
        return `Q${((((s - 1 + i) % 4) + 4) % 4) + 1}`;
      case "s":
        return `Спринт ${s + i}`;
      case "d":
        return `День ${s + i}`;
      default:
        return `Нед ${s + i}`;
    }
  });
}

/** Где «сейчас» на шкале (в периодах от начала); null — не показывать.
    Для месяцев — по календарю, для остального — поле cur (номер периода). */
export function nowPos(p: NodeProps, d = new Date()): number | null {
  if ((p.pu ?? "w") === "m" && typeof p.cur !== "number") {
    const s = Math.round(p.ps ?? d.getMonth());
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return ((((d.getMonth() - s) % 12) + 12) % 12) + (d.getDate() - 0.5) / days;
  }
  return typeof p.cur === "number" && p.cur > 0 ? p.cur - 0.5 : null;
}

export type Bar = RoadBar & { id: string };

export function roadBars(p: NodeProps): Bar[] {
  const n = periodCount(p);
  return entries<RoadBar>(p, "rb:")
    .filter((x) => typeof x.s === "number")
    .map((x) => {
      const s = Math.max(0, Math.min(n - 1, Math.round(x.s)));
      return { ...x, s, d: x.m ? 1 : Math.max(1, Math.min(n - s, Math.round(x.d ?? 1))) };
    })
    .sort((a, b) => (a.o ?? 0) - (b.o ?? 0) || a.id.localeCompare(b.id));
}

export function addBar(b: Board, v: NodeView, t: string, o: Partial<RoadBar> = {}): string {
  const bars = roadBars(v.props);
  const id = nanoid(8);
  const n = periodCount(v.props);
  const last = bars.at(-1);
  const s = Math.min(n - 1, last ? last.s + (last.m ? 0 : last.d) : 0);
  put(b, v.id, { [barKey(id)]: { t: t.slice(0, 200), s, d: Math.min(2, n - s), o: orderBetween(last?.o, undefined), ...o } satisfies RoadBar });
  return id;
}

export function setBar(b: Board, v: NodeView, id: string, patch: Partial<RoadBar>) {
  const bar = raw(v.props)[barKey(id)] as RoadBar | undefined;
  if (bar) put(b, v.id, { [barKey(id)]: { ...bar, ...patch } });
}

export const removeBar = (b: Board, v: NodeView, id: string) => put(b, v.id, { [barKey(id)]: undefined });

/** Доля завершённого по всем этапам (вехи — готовы, когда 100 %). */
export function roadShare(p: NodeProps): number {
  const bars = roadBars(p);
  if (!bars.length) return 0;
  const sum = bars.reduce((a, x) => a + (x.m ? 1 : x.d), 0);
  return bars.reduce((a, x) => a + ((x.m ? 1 : x.d) * Math.max(0, Math.min(100, x.pv ?? 0))) / 100, 0) / sum;
}

/* --------------------------- карточка персонажа --------------------------- */

export const statsOf = (p: NodeProps): Player[] => (Array.isArray(p.pl) ? p.pl : []);
export function statVal(p: NodeProps, id: string): number {
  const x = raw(p)[`sc:${id}`];
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

/* ------------------------------ таблица добычи ------------------------------ */

export const LOOT_MS = 1400;
export const RARITY: [string, string][] = [
  ["gray", "Обычное"],
  ["green", "Необычное"],
  ["blue", "Редкое"],
  ["violet", "Эпическое"],
  ["orange", "Легендарное"],
];
export const lootItems = (p: NodeProps): LootItem[] => (Array.isArray(p.lo) ? p.lo.filter((x) => x && typeof x.t === "string") : []);
const weightOf = (x: LootItem) => (Number.isFinite(x.w) && x.w > 0 ? x.w : 0);

/** Шансы предметов (доли, в сумме 1). */
export function lootChances(p: NodeProps): number[] {
  const items = lootItems(p);
  const sum = items.reduce((a, x) => a + weightOf(x), 0);
  return items.map((x) => (sum > 0 ? weightOf(x) / sum : 0));
}

/** Взвешенный выбор: r — случайное число [0, 1). */
export function lootPick(items: LootItem[], r: number): LootItem | null {
  const sum = items.reduce((a, x) => a + weightOf(x), 0);
  if (sum <= 0) return null;
  let t = r * sum;
  for (const x of items) {
    t -= weightOf(x);
    if (t < 0 && weightOf(x) > 0) return x;
  }
  return [...items].reverse().find((x) => weightOf(x) > 0) ?? null;
}

export const lootCount = (p: NodeProps) => Math.max(1, Math.min(10, Math.round(p.count ?? 1)));

export function lootPatch(p: NodeProps, who: Who): Patch | null {
  const items = lootItems(p);
  const got: string[] = [];
  for (let k = 0; k < lootCount(p); k++) {
    const x = lootPick(items, (randInt(1_000_000) - 1) / 1_000_000);
    if (x) got.push(x.id);
  }
  if (!got.length) return null;
  return { drop: { s: (p.drop?.s ?? 0) + 1, i: got, ...who } };
}

export function rollLoot(b: Board, ids: string[]): boolean {
  if (b.readonly) return false;
  const list = ids.flatMap((id) => {
    const v = b.view.get(id);
    const patch = v?.type === "loot" ? lootPatch(v.props, by(b)) : null;
    return patch ? [[id, patch] as [string, Patch]] : [];
  });
  if (list.length) putMany(b, list);
  return list.length > 0;
}

/** Что выпало последним: предметы по порядку. */
export function lootDrop(p: NodeProps): LootItem[] {
  const items = lootItems(p);
  return (p.drop?.i ?? []).map((id) => items.find((x) => x.id === id)).filter((x): x is LootItem => !!x);
}

/* ------------------------------ кривая баланса ------------------------------ */

export const curveSeries = (p: NodeProps): CurveSeries[] => (Array.isArray(p.fs) ? p.fs.filter((x) => x && typeof x.f === "string") : []);

export function curveRange(p: NodeProps): [number, number] {
  const a = Number.isFinite(p.min) ? p.min! : 1;
  const c = Number.isFinite(p.max) ? p.max! : 20;
  return a === c ? [a, a + 1] : [Math.min(a, c), Math.max(a, c)];
}

/** x из входящей стрелки (ползунок «Уровень» → кривая); null — нет входа. */
export function curveInput(s: BoardStore, v: NodeView, depth = 0): number | null {
  if (depth > 6) return null;
  for (const src of inputsOf(s, v)) {
    const n = numValue(s, src, depth + 1);
    if (n !== null) return n;
  }
  return null;
}

/** Значение первой формулы при x входа (без входа — при начале шкалы). */
export function curveValue(s: BoardStore, v: NodeView, depth = 0): number | null {
  const f = curveSeries(v.props)[0];
  if (!f) return null;
  const x = curveInput(s, v, depth) ?? curveRange(v.props)[0];
  const y = compile(f.f).at(x);
  return Number.isFinite(y) ? Math.round(y * 1000) / 1000 : null;
}

/* --------------------------------- палитра --------------------------------- */

export const swatchesOf = (p: NodeProps): Swatch[] => (Array.isArray(p.sw) ? p.sw.filter((x) => x && /^#[\da-f]{6}$/i.test(x.hex)) : []);

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Светлый ли цвет (тёмный текст поверх). */
export function isLight(hex: string): boolean {
  const [r, g, b] = hexRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.32;
}

export function hexHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function hslHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

/** Следующий цвет палитры: соседний по кругу оттенков. */
export function nextSwatch(list: Swatch[]): string {
  const last = list.at(-1)?.hex;
  if (!last) return "#7c6cf2";
  const [h, s, l] = hexHsl(last);
  return hslHex((h + 32) % 360, Math.max(35, s), Math.max(35, Math.min(70, l)));
}

const slug = (t: string, i: number) =>
  (t || `color-${i + 1}`)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || `color-${i + 1}`;

/** Палитра как текст: CSS-переменные или список HEX. */
export function paletteText(p: NodeProps, kind: "css" | "hex"): string {
  const list = swatchesOf(p);
  if (kind === "hex") return list.map((x) => x.hex.toUpperCase()).join("\n");
  return `:root {\n${list.map((x, i) => `  --${slug(x.t ?? "", i)}: ${x.hex};`).join("\n")}\n}`;
}

/* -------------------------------- карта уровня -------------------------------- */

export const DEFAULT_TILES: Tile[] = [
  { id: "grass", t: "Трава", c: "#5a9e4b" },
  { id: "sand", t: "Песок", c: "#d8bf73" },
  { id: "water", t: "Вода", c: "#3e7fc1" },
  { id: "stone", t: "Камень", c: "#7d808a" },
  { id: "wall", t: "Стена", c: "#3c3742" },
  { id: "lava", t: "Лава", c: "#e2582c" },
  { id: "hero", t: "Герой", e: "🧙" },
  { id: "enemy", t: "Враг", e: "👾" },
  { id: "chest", t: "Сундук", e: "💰" },
  { id: "key", t: "Ключ", e: "🔑" },
  { id: "door", t: "Дверь", e: "🚪" },
  { id: "tree", t: "Дерево", e: "🌲" },
];
export const tilesOf = (p: NodeProps): Tile[] => (Array.isArray(p.tiles) && p.tiles.length ? p.tiles : DEFAULT_TILES);
export const MAP_MAX = 48;
export function mapSize(p: NodeProps): [number, number] {
  const c = (n: number | undefined, d: number) => Math.max(2, Math.min(MAP_MAX, Math.round(n ?? d)));
  return [c(p.gw, 16), c(p.gh, 10)];
}
export const isObjectTile = (t: Tile | undefined) => !!t?.e && !t.c;

export interface MapCell {
  x: number;
  y: number;
  t: string;
}

/** Занятые клетки: местность и предметы (в пределах карты). */
export function mapCells(p: NodeProps): { ground: MapCell[]; things: MapCell[] } {
  const [w, h] = mapSize(p);
  const ground: MapCell[] = [];
  const things: MapCell[] = [];
  for (const [k, val] of Object.entries(raw(p))) {
    if (typeof val !== "string" || (k[1] !== "t" && k[1] !== "o") || k[0] !== "g" || k[2] !== ":") continue;
    const i = k.indexOf(":", 3);
    const x = Number(k.slice(3, i));
    const y = Number(k.slice(i + 1));
    if (!(x >= 0 && y >= 0 && x < w && y < h)) continue;
    (k[1] === "t" ? ground : things).push({ x, y, t: val });
  }
  return { ground, things };
}

/** Правка клетки кистью: местность или предмет; null — ластик. */
export function paintPatch(p: NodeProps, x: number, y: number, tile: Tile | null): Patch {
  if (!tile) return { [terrainKey(x, y)]: undefined, [objectKey(x, y)]: undefined };
  if (isObjectTile(tile)) return { [objectKey(x, y)]: raw(p)[objectKey(x, y)] === tile.id ? undefined : tile.id };
  return { [terrainKey(x, y)]: tile.id };
}

/** Заливка связной области одной местности. */
export function fillPatch(p: NodeProps, x0: number, y0: number, tile: Tile | null): Patch {
  const [w, h] = mapSize(p);
  const at = (x: number, y: number) => (raw(p)[terrainKey(x, y)] as string | undefined) ?? "";
  const from = at(x0, y0);
  const to = tile && !isObjectTile(tile) ? tile.id : "";
  const patch: Patch = {};
  if (from === to) return patch;
  const seen = new Uint8Array(w * h);
  const stack = [[x0, y0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x! < 0 || y! < 0 || x! >= w || y! >= h || seen[y! * w + x!] || at(x!, y!) !== from) continue;
    seen[y! * w + x!] = 1;
    patch[terrainKey(x!, y!)] = to || undefined;
    stack.push([x! + 1, y!], [x! - 1, y!], [x!, y! + 1], [x!, y! - 1]);
  }
  return patch;
}

export function clearMapPatch(p: NodeProps): Patch {
  const patch: Patch = {};
  for (const k of Object.keys(raw(p))) if (k.startsWith("gt:") || k.startsWith("go:")) patch[k] = undefined;
  return patch;
}

/** Остров для новой карты: вода вокруг, песок, трава, пара предметов. */
export function islandPatch(w: number, h: number): Patch {
  const patch: Patch = { gb: "water" };
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = ((x - cx) / (w * 0.36)) ** 2 + ((y - cy) / (h * 0.36)) ** 2;
      if (d < 0.55) patch[terrainKey(x, y)] = "grass";
      else if (d < 1) patch[terrainKey(x, y)] = "sand";
    }
  const put = (x: number, y: number, t: string) => (patch[objectKey(Math.round(x), Math.round(y))] = t);
  put(cx - 2, cy, "hero");
  put(cx + 2, cy - 1, "tree");
  put(cx + 1, cy + 1, "chest");
  put(cx - 1, cy - 2, "tree");
  return patch;
}

/* ------------------------------ покер планирования ------------------------------ */

export const POKER_DECKS: Record<"fib" | "tshirt" | "pow2", string[]> = {
  fib: ["0", "½", "1", "2", "3", "5", "8", "13", "21", "?", "☕"],
  tshirt: ["XS", "S", "M", "L", "XL", "XXL", "?"],
  pow2: ["0", "1", "2", "4", "8", "16", "32", "?"],
};
export const POKER_KINDS: [NonNullable<NodeProps["pk"]>, string][] = [
  ["fib", "Фибоначчи"],
  ["tshirt", "Размеры футболок"],
  ["pow2", "Степени двойки"],
  ["custom", "Своя колода"],
];
const SHIRT = ["XS", "S", "M", "L", "XL", "XXL"];

export function pokerFaces(p: NodeProps): string[] {
  if (p.pk === "custom") {
    const f = (p.faces ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (f.length) return f.slice(0, 24);
  }
  return POKER_DECKS[p.pk === "tshirt" || p.pk === "pow2" ? p.pk : "fib"];
}

export interface PokerVote {
  id: string;
  v: string;
  n: string;
  c: string;
}

export function pokerVotes(p: NodeProps): PokerVote[] {
  const out: PokerVote[] = [];
  for (const [k, x] of Object.entries(raw(p)))
    if (k.startsWith("pp:") && x && typeof x === "object" && typeof (x as PokerVote).v === "string") out.push({ ...(x as PokerVote), id: k.slice(3) });
  return out.sort((a, b) => a.n.localeCompare(b.n, "ru"));
}

const faceNum = (f: string): number | null => {
  if (f === "½") return 0.5;
  const i = SHIRT.indexOf(f.toUpperCase());
  if (i >= 0) return i + 1;
  const n = Number(f.replace(",", "."));
  return f.trim() && Number.isFinite(n) ? n : null;
};

export interface PokerSum {
  n: number;
  /** Среднее числовых карт (для футболок — номер размера). */
  avg: number | null;
  /** Подпись среднего: число или ближайший размер. */
  label: string;
  min: string | null;
  max: string | null;
  /** Все выбрали одно и то же. */
  same: boolean;
}

export function pokerSummary(p: NodeProps): PokerSum {
  const votes = pokerVotes(p);
  const nums = votes.map((x) => faceNum(x.v)).filter((n): n is number => n !== null);
  const shirt = p.pk === "tshirt";
  const avg = nums.length ? nums.reduce((a, n) => a + n, 0) / nums.length : null;
  const byNum = votes.filter((x) => faceNum(x.v) !== null).sort((a, b) => faceNum(a.v)! - faceNum(b.v)!);
  const label = avg === null ? "—" : shirt ? (SHIRT[Math.max(0, Math.min(SHIRT.length - 1, Math.round(avg) - 1))] ?? "—") : avg.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return { n: votes.length, avg, label, min: byNum[0]?.v ?? null, max: byNum.at(-1)?.v ?? null, same: votes.length > 1 && votes.every((x) => x.v === votes[0]!.v) };
}

export function pokerVote(b: Board, v: NodeView, face: string | null) {
  if (b.readonly) return;
  const key = pokerKey(b.me.id);
  const cur = raw(v.props)[key] as PokerVote | undefined;
  put(b, v.id, { [key]: face === null || cur?.v === face ? undefined : { v: face, ...by(b) } });
}

export function pokerReveal(b: Board, ids: string[], on?: boolean) {
  if (b.readonly) return;
  const all = ids.map((id) => b.view.get(id)).filter((v): v is NodeView => v?.type === "estimate");
  const next = on ?? !all.every((v) => v.props.on);
  putMany(b, all.map((v) => [v.id, { on: next || undefined }]));
}

export function pokerReset(b: Board, ids: string[]) {
  if (b.readonly) return;
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "estimate") return [];
      const patch: Patch = { on: undefined };
      for (const k of Object.keys(raw(v.props))) if (k.startsWith("pp:")) patch[k] = undefined;
      return [[id, patch] as [string, Patch]];
    }),
  );
}
