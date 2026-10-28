/* Игры и приборы 1.2: секундомер, монетка, карточка, колода, случайный
   выбор, табло, очередь ходов, «кто первый», чек-лист, поле ввода,
   календарь, облако слов, сюрприз. Всё общее для участников; там, где
   жмут одновременно несколько человек, каждый пишет только своё поле —
   правки не теряются. */
import type { Board } from "../board.svelte.ts";
import { buzzKey, checkKey, dayKey, scoreKey, wordsKey, type NodeData, type NodeProps, type Player } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";
import { toasts } from "../../lib/toast.svelte.ts";
import { candidates, loadMembers } from "./actions.ts";
import { randInt } from "./games.ts";
import { playSound } from "./sound.ts";

type Patch = Record<string, unknown>;
const put = (b: Board, id: string, patch: Patch) => b.view.update(id, patch as Partial<NodeData>);
const putMany = (b: Board, list: [string, Patch][]) => b.view.updateMany(list.map(([id, p]) => [id, p as Partial<NodeData>]));
const R = (n: number) => Math.round(n * 1000) / 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const raw = (p: NodeProps) => p as Record<string, unknown>;

/** Случайная перестановка (честная, через crypto). */
export function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1) - 1;
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type Who = { n: string; c: string };
const by = (b: Board): Who => ({ n: b.me.name, c: b.me.color });

/* ------------------------------ секундомер ------------------------------ */

export const swRunning = (p: NodeProps) => typeof p.t0 === "number";

export function swElapsed(p: NodeProps, now = Date.now()): number {
  const acc = typeof p.acc === "number" && Number.isFinite(p.acc) ? Math.max(0, p.acc) : 0;
  return typeof p.t0 === "number" ? acc + Math.max(0, now - p.t0) : acc;
}

export type SwAct = "toggle" | "start" | "stop" | "reset" | "lap";

export function swPatch(p: NodeProps, kind: SwAct, now = Date.now()): Patch {
  const run = swRunning(p);
  switch (kind) {
    case "toggle":
      return run ? { t0: null, acc: swElapsed(p, now) } : { t0: now };
    case "start":
      return run ? {} : { t0: now };
    case "stop":
      return run ? { t0: null, acc: swElapsed(p, now) } : {};
    case "reset":
      return { t0: null, acc: 0, laps: undefined };
    case "lap":
      return { laps: [...(p.laps ?? []), swElapsed(p, now)].slice(-30) };
  }
}

/** «02:15», «1:02:15», с сотыми — «02:15.37». */
export function swText(ms: number, cs = false): string {
  const t = Math.floor(Math.max(0, ms) / 10);
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000) % 60;
  const h = Math.floor(t / 360000);
  const base = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return cs ? `${base}.${pad(t % 100)}` : base;
}

/* -------------------------------- монетка -------------------------------- */

export const COIN_SIDES = ["Орёл", "Решка"];
export const coinSides = (p: NodeProps): [string, string] => [p.cf?.[0]?.trim() || COIN_SIDES[0]!, p.cf?.[1]?.trim() || COIN_SIDES[1]!];
export const COIN_MS = 1250;

/** Бросок монетки — правка узла (для кнопки и для логики). */
export function coinPatch(p: NodeProps, who: Who): Patch {
  const side = (randInt(2) - 1) as 0 | 1;
  const ch = [p.ch?.[0] ?? 0, p.ch?.[1] ?? 0];
  ch[side]!++;
  return { coin: { s: (p.coin?.s ?? 0) + 1, v: side, ...who }, ch };
}

export function flipCoin(b: Board, ids: string[]) {
  if (b.readonly) return;
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      return v?.type === "coin" ? [[id, coinPatch(v.props, by(b))] as [string, Patch]] : [];
    }),
  );
}

/* -------------------------------- карточка -------------------------------- */

export function flipCard(b: Board, ids: string[], to?: boolean) {
  if (b.readonly) return;
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "flipcard") return [];
      const on = to ?? !v.props.on;
      return [[id, { on: on || undefined }] as [string, Patch]];
    }),
  );
}

/* --------------------------------- колода --------------------------------- */

const SUITS: [string, boolean][] = [
  ["♠", false],
  ["♥", true],
  ["♦", true],
  ["♣", false],
];
const RANKS_36 = ["6", "7", "8", "9", "10", "В", "Д", "К", "Т"];
const RANKS_52 = ["2", "3", "4", "5", ...RANKS_36];

export interface Card {
  t: string;
  /** Масть (для обычной колоды) и красная ли. */
  suit?: string;
  rank?: string;
  red?: boolean;
}

export function deckCards(p: NodeProps): Card[] {
  const kind = p.dk ?? "36";
  if (kind === "custom") {
    const list = (p.opts ?? []).map((o) => o.t.trim()).filter(Boolean);
    return (list.length ? list : ["Карта 1", "Карта 2", "Карта 3"]).map((t) => ({ t }));
  }
  const ranks = kind === "52" ? RANKS_52 : RANKS_36;
  return SUITS.flatMap(([suit, red]) => ranks.map((rank) => ({ t: `${rank}${suit}`, suit, rank, red })));
}

/** Сколько карт осталось в колоде. */
export function deckLeft(p: NodeProps): number {
  const n = deckCards(p).length;
  return Array.isArray(p.pile) ? p.pile.filter((i) => i >= 0 && i < n).length : n;
}

/** Вытянуть верхнюю карту; null — колода пуста. */
export function drawPatch(p: NodeProps, who: Who): Patch | null {
  const n = deckCards(p).length;
  const pile = Array.isArray(p.pile) ? p.pile.filter((i) => i >= 0 && i < n) : shuffled(Array.from({ length: n }, (_, i) => i));
  if (!pile.length) return null;
  const [i, ...rest] = pile;
  return { pile: rest, top: { i: i!, s: (p.top?.s ?? 0) + 1, ...who }, out: [...(p.out ?? []), i!].slice(-60) };
}

export function shufflePatch(p: NodeProps): Patch {
  const n = deckCards(p).length;
  // номер перетасовки — чтобы у всех проигралась анимация
  return { pile: shuffled(Array.from({ length: n }, (_, i) => i)), top: null, out: undefined, shf: (p.shf ?? 0) + 1 };
}

export function deckDraw(b: Board, ids: string[]): boolean {
  if (b.readonly) return false;
  const list = ids.flatMap((id) => {
    const v = b.view.get(id);
    const patch = v?.type === "deck" ? drawPatch(v.props, by(b)) : null;
    return patch ? [[id, patch] as [string, Patch]] : [];
  });
  if (list.length) putMany(b, list);
  return list.length > 0;
}

export function deckShuffle(b: Board, ids: string[]) {
  if (b.readonly) return;
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      return v?.type === "deck" ? [[id, shufflePatch(v.props)] as [string, Patch]] : [];
    }),
  );
}

/* ---------------------------- случайный выбор ---------------------------- */

/** Сколько крутится выбор (логика ждёт, пока результат покажут). */
export const RANDOM_MS = 1900;

export const RANDOM_MODES: [NonNullable<NodeProps["rm"]>, string][] = [
  ["num", "Число"],
  ["list", "Из списка"],
  ["people", "Участник"],
];

export function randomPool(b: Board, v: NodeView): string[] {
  const p = v.props;
  switch (p.rm ?? "num") {
    case "list":
      return (p.opts ?? []).map((o) => o.t.trim()).filter(Boolean);
    case "people":
      return [...new Set(candidates(b).map((a) => a.name))];
    default:
      return [];
  }
}

/** Числа: пределы «от» и «до» (целые, по возрастанию). */
export function randomRange(p: NodeProps): [number, number] {
  const a = p.min ?? 1;
  const c = p.max ?? 100;
  return [Math.ceil(Math.min(a, c)), Math.floor(Math.max(a, c))];
}

/** Случайный выбор — правка узла; null — выбирать не из чего. */
export function randomPatch(b: Board, v: NodeView, who: Who = by(b)): Patch | null {
  const p = v.props;
  const s = (p.rnd?.s ?? 0) + 1;
  if ((p.rm ?? "num") === "num") {
    const [lo, hi] = randomRange(p);
    const span = Math.max(1, Math.min(1e9, hi - lo + 1));
    const usedNums = p.uniq ? new Set(p.used ?? []) : null;
    let val = lo + randInt(span) - 1;
    if (usedNums && usedNums.size < span) for (let k = 0; k < 400 && usedNums.has(String(val)); k++) val = lo + randInt(span) - 1;
    const used = p.uniq ? (usedNums && usedNums.size < span ? [...usedNums, String(val)] : [String(val)]).slice(-500) : undefined;
    return { rnd: { s, v: String(val), ...who }, used };
  }
  const pool = randomPool(b, v);
  if (!pool.length) return null;
  let left = p.uniq ? pool.filter((x) => !(p.used ?? []).includes(x)) : pool;
  const restart = !left.length;
  if (restart) left = pool;
  const val = left[randInt(left.length) - 1]!;
  const used = p.uniq ? [...(restart ? [] : (p.used ?? [])), val].slice(-500) : undefined;
  return { rnd: { s, v: val, ...who }, used };
}

export async function genRandom(b: Board, ids: string[]) {
  if (b.readonly) return;
  if (ids.some((id) => b.view.get(id)?.props.rm === "people")) await loadMembers(b);
  const list = ids.flatMap((id) => {
    const v = b.view.get(id);
    const patch = v?.type === "random" ? randomPatch(b, v) : null;
    return patch ? [[id, patch] as [string, Patch]] : [];
  });
  if (list.length) putMany(b, list);
  else if (ids.length) {
    const v = b.view.get(ids[0]!);
    if (v?.props.rm === "list") toasts.show("Добавьте варианты в настройках");
  }
}

/* ------------------------------ табло и ходы ------------------------------ */

export const PLAYER_COLORS = ["blue", "red", "green", "orange", "violet", "cyan", "pink", "yellow"];

export function playersOf(p: NodeProps): Player[] {
  return Array.isArray(p.pl) && p.pl.length ? p.pl : [{ id: "a", t: "Игрок 1", c: "blue" }];
}

export function scoreOf(p: NodeProps, pid: string): number {
  const x = raw(p)[scoreKey(pid)];
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

export function addScore(b: Board, v: NodeView, pid: string, d: number) {
  if (b.readonly) return;
  put(b, v.id, { [scoreKey(pid)]: R(scoreOf(v.props, pid) + d) || undefined });
}

export function setScore(b: Board, v: NodeView, pid: string, n: number) {
  if (b.readonly) return;
  put(b, v.id, { [scoreKey(pid)]: R(n) || undefined });
}

/** Убрать все поля с приставкой (очки, нажатия, слова, отметки дней). */
export function clearPatch(p: NodeProps, test: (key: string) => boolean): Patch {
  const patch: Patch = {};
  for (const k of Object.keys(p)) if (test(k)) patch[k] = undefined;
  return patch;
}
const clearAll = (b: Board, ids: string[], test: (key: string) => boolean) => {
  if (b.readonly) return;
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      return v ? [[id, clearPatch(v.props, test)] as [string, Patch]] : [];
    }),
  );
};
export const isScoreKey = (k: string) => k.startsWith("sc:");
export const isBuzzKey = (k: string) => k.startsWith("bq:");
export const isWordsKey = (k: string) => k.startsWith("w:");
export const isDayKey = (k: string) => /^k:\d{4}-\d{2}-\d{2}:/.test(k);

export function resetScores(b: Board, ids: string[]) {
  clearAll(b, ids, isScoreKey);
}

/** Строка очков — чтобы логика замечала любое изменение счёта. */
export const scoreSig = (p: NodeProps) => playersOf(p).map((x) => scoreOf(p, x.id)).join(",");

/** Лучший счёт (для логики и диаграмм). */
export function topScore(p: NodeProps): number {
  const list = playersOf(p).map((x) => scoreOf(p, x.id));
  return list.length ? Math.max(...list) : 0;
}

/** Чей ход сейчас (номер в списке). */
export const turnOf = (p: NodeProps) => Math.max(0, Math.min(playersOf(p).length - 1, p.cur ?? 0));

export function turnPatch(p: NodeProps, dir: 1 | -1): Patch {
  const n = playersOf(p).length;
  let next = turnOf(p) + dir;
  let rn = Math.max(1, p.rn ?? 1);
  if (next >= n) {
    next = 0;
    rn++;
  } else if (next < 0) {
    next = n - 1;
    rn = Math.max(1, rn - 1);
  }
  return { cur: next, rn };
}

export function nextTurn(b: Board, ids: string[], dir: 1 | -1 = 1) {
  if (b.readonly) return;
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      return v?.type === "turns" ? [[id, turnPatch(v.props, dir)] as [string, Patch]] : [];
    }),
  );
}

export function resetTurns(b: Board, ids: string[]) {
  putMany(b, ids.map((id) => [id, { cur: 0, rn: 1 }] as [string, Patch]));
}

/* ------------------------------ кто первый ------------------------------ */

export interface Buzz {
  u: string;
  t: number;
  n: string;
  c: string;
}

export function buzzesOf(p: NodeProps): Buzz[] {
  const out: Buzz[] = [];
  for (const [k, x] of Object.entries(raw(p))) {
    if (!k.startsWith("bq:") || !x || typeof x !== "object") continue;
    const z = x as Partial<Buzz>;
    if (typeof z.t === "number") out.push({ u: k.slice(3), t: z.t, n: String(z.n ?? ""), c: String(z.c ?? "") });
  }
  return out.sort((a, c) => a.t - c.t);
}

export function buzz(b: Board, v: NodeView): boolean {
  if (b.readonly) return false;
  const k = buzzKey(b.me.id);
  if (raw(v.props)[k]) return false;
  put(b, v.id, { [k]: { t: Date.now(), ...by(b) } });
  return true;
}

export function resetBuzz(b: Board, ids: string[]) {
  clearAll(b, ids, isBuzzKey);
}

/* -------------------------------- чек-лист -------------------------------- */

export const itemsOf = (p: NodeProps) => (Array.isArray(p.cl) ? p.cl : []);
export const isChecked = (p: NodeProps, id: string) => !!raw(p)[checkKey(id)];

export function checklistCount(p: NodeProps): [number, number] {
  const items = itemsOf(p);
  return [items.filter((x) => isChecked(p, x.id)).length, items.length];
}

export function checkItem(b: Board, v: NodeView, id: string, on?: boolean) {
  if (b.readonly) return;
  const next = on ?? !isChecked(v.props, id);
  put(b, v.id, { [checkKey(id)]: next || undefined });
}

/** Логика и меню: отметить следующий, снять последний, очистить. */
export function checklistPatch(v: NodeView, how: "next" | "last" | "clear" | "all"): Patch {
  const p = v.props;
  const items = itemsOf(p);
  const patch: Patch = {};
  if (how === "clear") for (const x of items) patch[checkKey(x.id)] = undefined;
  else if (how === "all") for (const x of items) patch[checkKey(x.id)] = true;
  else if (how === "next") {
    const x = items.find((it) => !isChecked(p, it.id));
    if (x) patch[checkKey(x.id)] = true;
  } else {
    const x = [...items].reverse().find((it) => isChecked(p, it.id));
    if (x) patch[checkKey(x.id)] = undefined;
  }
  return patch;
}

/* -------------------------------- календарь -------------------------------- */

export const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Показанный месяц: свой («2025-07») или текущий. */
export function monthOf(p: NodeProps, now = new Date()): { y: number; m: number } {
  const mm = /^(\d{4})-(\d{2})$/.exec(p.ym ?? "");
  if (mm) return { y: Number(mm[1]), m: Math.max(0, Math.min(11, Number(mm[2]) - 1)) };
  return { y: now.getFullYear(), m: now.getMonth() };
}

export const shiftMonth = (y: number, m: number, d: number) => {
  const t = new Date(y, m + d, 1);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
};

export interface DayMark {
  u: string;
  c: string;
  n: string;
}

/** Отметки дня: у каждого участника своя (поле k:<дата>:<id>). */
export function dayMarks(p: NodeProps, iso: string): DayMark[] {
  const pre = `${dayKey(iso)}:`;
  const out: DayMark[] = [];
  for (const [k, x] of Object.entries(raw(p))) {
    if (!k.startsWith(pre) || !x || typeof x !== "object") continue;
    const z = x as Partial<DayMark>;
    out.push({ u: k.slice(pre.length), c: String(z.c ?? ""), n: String(z.n ?? "") });
  }
  return out;
}

export function markedDays(p: NodeProps): number {
  const days = new Set<string>();
  for (const [k, x] of Object.entries(raw(p))) if (x && isDayKey(k)) days.add(k.slice(2, 12));
  return days.size;
}

/** Сегодня — для логики «отметить сегодняшний день». */
export function todayIso(now = new Date()) {
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function toggleDay(b: Board, v: NodeView, iso: string) {
  if (b.readonly) return;
  const k = `${dayKey(iso)}:${b.me.id}`;
  put(b, v.id, { [k]: raw(v.props)[k] ? undefined : { ...by(b) } });
}

export function clearDays(b: Board, ids: string[]) {
  clearAll(b, ids, isDayKey);
}

/* ------------------------------- облако слов ------------------------------- */

export function myWords(p: NodeProps, me: string): string[] {
  const x = raw(p)[wordsKey(me)];
  return Array.isArray(x) ? x.filter((w): w is string => typeof w === "string") : [];
}

/** Слова всех участников: частота, без учёта регистра. */
export function wordCloud(p: NodeProps): { t: string; n: number }[] {
  const map = new Map<string, { t: string; n: number }>();
  for (const [k, x] of Object.entries(raw(p))) {
    if (!k.startsWith("w:") || !Array.isArray(x)) continue;
    for (const w of x) {
      if (typeof w !== "string" || !w.trim()) continue;
      const key = w.trim().toLowerCase();
      const e = map.get(key);
      if (e) e.n++;
      else map.set(key, { t: w.trim(), n: 1 });
    }
  }
  return [...map.values()].sort((a, c) => c.n - a.n || a.t.localeCompare(c.t, "ru"));
}

export const wordsCount = (p: NodeProps) => wordCloud(p).reduce((a, w) => a + w.n, 0);

export function addWord(b: Board, v: NodeView, word: string): boolean {
  const w = word.trim().replace(/\s+/g, " ").slice(0, 40);
  if (b.readonly || !w) return false;
  const max = Math.max(1, Math.min(20, v.props.max ?? 3));
  const mine = myWords(v.props, b.me.id);
  put(b, v.id, { [wordsKey(b.me.id)]: [...mine, w].slice(-max) });
  return true;
}

export function removeWord(b: Board, v: NodeView, i: number) {
  const mine = myWords(v.props, b.me.id);
  mine.splice(i, 1);
  put(b, v.id, { [wordsKey(b.me.id)]: mine.length ? mine : undefined });
}

export function clearWords(b: Board, ids: string[]) {
  clearAll(b, ids, isWordsKey);
}

/* -------------------------------- сюрприз -------------------------------- */

export function revealAll(b: Board, ids: string[], on: boolean | "toggle" = "toggle") {
  if (b.readonly) return;
  putMany(
    b,
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "spoiler") return [];
      const next = on === "toggle" ? !v.props.on : on;
      return [[id, { on: next || undefined }] as [string, Patch]];
    }),
  );
}

export { playSound };
