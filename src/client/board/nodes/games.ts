/* Счётчик, кубик и прогресс — общие для всех участников.
   Счётчик: база n0 + поправки участников d:<id>. Каждый пишет только своё
   поле, поэтому одновременные нажатия «+» не теряются. */
import type { Board } from "../board.svelte.ts";
import type { NodeData, NodeProps } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";

export const deltaKey = (uid: string) => `d:${uid}`;

const round = (n: number) => Math.round(n * 1000) / 1000;

function deltas(p: NodeProps): number {
  let n = 0;
  for (const [k, x] of Object.entries(p as Record<string, unknown>)) if (k.startsWith("d:") && typeof x === "number" && Number.isFinite(x)) n += x;
  return n;
}

/** Границы счётчика из настроек; без них — без ограничений. */
export function counterBounds(p: NodeProps): [number, number] {
  const lo = typeof p.min === "number" && Number.isFinite(p.min) ? p.min : -Infinity;
  const hi = typeof p.max === "number" && Number.isFinite(p.max) ? p.max : Infinity;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

const clampTo = (p: NodeProps, n: number) => {
  const [lo, hi] = counterBounds(p);
  return Math.max(lo, Math.min(hi, n));
};

const rawValue = (p: NodeProps) => (typeof p.n0 === "number" ? p.n0 : 0) + deltas(p);

export function counterValue(p: NodeProps): number {
  return round(clampTo(p, rawValue(p)));
}

/** Прибавить своё. Упёрлись в границу — ничего не меняется (false).
    Если сумма вышла за край из‑за одновременных нажатий, поправка
    возвращает её ровно туда, куда показано. */
export function counterAddPatch(p: NodeProps, uid: string, d: number): Record<string, unknown> | null {
  const raw = rawValue(p);
  const next = clampTo(p, clampTo(p, raw) + d);
  const delta = round(next - raw);
  if (delta === 0 || round(next) === counterValue(p)) return null;
  const k = deltaKey(uid);
  const cur = (p as Record<string, unknown>)[k];
  return { [k]: round((typeof cur === "number" ? cur : 0) + delta) };
}

export function counterAdd(b: Board, v: NodeView, d: number): boolean {
  const patch = counterAddPatch(v.props, b.me.id, d);
  if (patch) b.view.update(v.id, patch as Partial<NodeData>);
  return !!patch;
}

/** Задать значение: база подбирается так, чтобы сумма стала нужной. */
export const counterSetPatch = (p: NodeProps, value: number): Record<string, unknown> => ({ n0: round(clampTo(p, value) - deltas(p)) });

export function counterSet(b: Board, ids: string[], value: number) {
  b.view.updateMany(
    ids.flatMap((id) => {
      const v = b.view.get(id);
      return v?.type === "counter" ? [[id, counterSetPatch(v.props, value) as Partial<NodeData>] as [string, Partial<NodeData>]] : [];
    }),
  );
}

/** Значение сброса из настроек (по умолчанию 0). */
export const counterReset = (p: NodeProps) => (typeof p.rst === "number" && Number.isFinite(p.rst) ? p.rst : 0);

export const COUNTER_STEPS = [1, 2, 5, 10, 25, 100, 0.5];

/* -------------------------------- кубик -------------------------------- */

export const DICE_SIDES = [2, 4, 6, 8, 10, 12, 20, 100];
export const DICE_MAX = 10;
export const SIDES_MAX = 1000;

export interface Roll {
  v: number[];
  n: string;
  c: string;
  /** Номер броска — у всех запускает анимацию. */
  s: number;
}

export const diceCount = (p: NodeProps) => Math.max(1, Math.min(DICE_MAX, Math.round(p.count ?? 1)));

/** Свои грани (текст, эмодзи, числа) — если их хотя бы две. */
export function diceFaces(p: NodeProps): string[] | null {
  if (!Array.isArray(p.faces)) return null;
  const f = p.faces.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 100);
  return f.length >= 2 ? f : null;
}

export function diceSides(p: NodeProps): number {
  const f = diceFaces(p);
  return f ? f.length : Math.max(2, Math.min(SIDES_MAX, Math.round(p.sides ?? 6)));
}

/** Что написано на грани с номером n (1..граней). */
export function faceLabel(p: NodeProps, n: number): string {
  const f = diceFaces(p);
  return f ? (f[n - 1] ?? "?") : String(n);
}

/** Число грани: для своих граней — если на ней число, иначе её номер. */
function faceValue(p: NodeProps, n: number): number {
  const f = diceFaces(p);
  if (!f) return n;
  const x = Number(String(f[n - 1] ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : n;
}

/** Кубики, которые идут в счёт: все, лучший или худший. */
export function keptDice(p: NodeProps, vals: number[]): Set<number> {
  const keep = p.keep ?? "all";
  if (keep === "all" || vals.length < 2) return new Set(vals.map((_, i) => i));
  let best = 0;
  for (let i = 1; i < vals.length; i++) {
    const a = faceValue(p, vals[i]!);
    const c = faceValue(p, vals[best]!);
    if (keep === "hi" ? a > c : a < c) best = i;
  }
  return new Set([best]);
}

/** Итог броска: сумма учтённых кубиков плюс прибавка. */
export function diceTotal(p: NodeProps, vals: number[] = (p.roll as Roll | null | undefined)?.v ?? []): number {
  if (!vals.length) return 0;
  const kept = keptDice(p, vals);
  let sum = 0;
  vals.forEach((x, i) => kept.has(i) && (sum += faceValue(p, x)));
  return round(sum + (typeof p.mod === "number" ? p.mod : 0));
}

/** Как записать бросок: «2d6+1», «d20, лучший из 2», «3 своих». */
export function diceFormula(p: NodeProps): string {
  const n = diceCount(p);
  const f = diceFaces(p);
  const base = f ? `${n > 1 ? `${n} × ` : ""}кубик на ${f.length}` : `${n > 1 ? n : ""}d${diceSides(p)}`;
  const mod = typeof p.mod === "number" && p.mod ? (p.mod > 0 ? `+${p.mod}` : `−${-p.mod}`) : "";
  const keep = n > 1 && p.keep === "hi" ? " · лучший" : n > 1 && p.keep === "lo" ? " · худший" : "";
  return base + mod + keep;
}

/** Честный бросок: crypto + отбрасывание, без перекоса по модулю. */
export function randInt(sides: number): number {
  const buf = new Uint32Array(1);
  const lim = Math.floor(0x1_0000_0000 / sides) * sides;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < lim) return (buf[0]! % sides) + 1;
  }
}

export function rollDice(b: Board, ids: string[]) {
  if (b.readonly) return;
  const me = b.me;
  b.view.updateMany(
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "dice") return [];
      const sides = diceSides(v.props);
      const count = diceCount(v.props);
      const roll: Roll = { v: Array.from({ length: count }, () => randInt(sides)), n: me.name, c: me.color, s: ((v.props.roll as Roll | null)?.s ?? 0) + 1 };
      const patch: Partial<NodeData> = { roll };
      if (v.props.hist) patch.rh = [...(v.props.rh ?? []), { v: roll.v, n: roll.n, c: roll.c, t: Date.now() }].slice(-8);
      return [[id, patch] as [string, Partial<NodeData>]];
    }),
  );
}

/** Точки на грани d6: позиции в сетке 3×3 (0..8). */
export const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
