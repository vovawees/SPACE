/* Значения объектов для логики, вычислений, диаграмм и логических блоков:
   число (сколько), доля выполненного (0..1) и «включено ли». Всё считается
   из полей узла — ничего не хранится отдельно. */
import { TYPE_LABELS, markKey, type CalcOp, type GateMode, type NodeProps } from "../model.ts";
import type { BoardStore, NodeView } from "../store.svelte.ts";
import { counterValue } from "./games.ts";
import { votesOf } from "./poll.ts";
import { timerLeft } from "./timer.ts";

const R = (n: number) => Math.round(n * 1000) / 1000;

export const DEFAULT_STATUSES = [
  { t: "Не начато", c: "gray" },
  { t: "В работе", c: "blue" },
  { t: "На проверке", c: "orange" },
  { t: "Готово", c: "green" },
];

export function statusesOf(p: NodeProps): { t: string; c: string }[] {
  return Array.isArray(p.sts) && p.sts.length ? p.sts : DEFAULT_STATUSES;
}

export function ratingsOf(p: NodeProps): number[] {
  const out: number[] = [];
  for (const [k, x] of Object.entries(p as Record<string, unknown>)) if (k.startsWith("rt:") && typeof x === "number" && x > 0) out.push(x);
  return out;
}

export function ratingAvg(p: NodeProps): number {
  const r = ratingsOf(p);
  return r.length ? R(r.reduce((a, b) => a + b, 0) / r.length) : 0;
}

export function marksOf(p: NodeProps): number {
  const n = Math.max(1, Math.min(60, p.cells ?? 7));
  let k = 0;
  for (let i = 0; i < n; i++) if ((p as Record<string, unknown>)[markKey(i)]) k++;
  return k;
}

/** Пункты списка дел в Markdown: [выполнено, всего]. */
export function checklistOf(text: string): [number, number] {
  let done = 0;
  let all = 0;
  for (const m of text.matchAll(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/gm)) {
    all++;
    if (m[1] !== " ") done++;
  }
  return [done, all];
}

const NUM_RE = /^\s*([-+]?\d[\d\s]*(?:[.,]\d+)?)\s*([%₽$€]|[a-zа-яё]{0,6})\s*$/i;

/** Число, записанное текстом («42», «3,5 кг»). */
export function textNumber(t: string): number | null {
  const m = NUM_RE.exec(t.replace(/\*\*|__|^#+\s*/g, ""));
  if (!m) return null;
  const n = Number(m[1]!.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const NUMERIC = new Set(["counter", "progress", "slider", "rating", "switch", "gate", "task", "dice", "poll", "tracker", "calc", "status", "timer", "note", "text", "shape", "button", "countdown"]);

/** Можно ли показать узел числом (для вычислений и диаграмм). */
export const hasNumber = (v: NodeView) => NUMERIC.has(v.type);

/** Число узла; null — у узла нет осмысленного числа. */
export function numValue(s: BoardStore, v: NodeView, depth = 0): number | null {
  const p = v.props;
  switch (v.type) {
    case "counter":
      return counterValue(p);
    case "progress":
      return Math.max(0, Math.min(100, p.pv ?? 0));
    case "slider":
      return p.sv ?? 0;
    case "rating":
      return ratingAvg(p);
    case "switch":
    case "gate":
      return p.on ? 1 : 0;
    case "task":
      return p.done ? 1 : 0;
    case "dice":
      return (p.roll?.v ?? []).reduce((a, b) => a + b, 0);
    case "poll":
      return votesOf(v).size;
    case "tracker":
      return marksOf(p);
    case "status":
      return p.st ?? 0;
    case "button":
      return p.press?.s ?? 0;
    case "timer":
      return Math.round(timerLeft(p) / 1000);
    case "countdown":
      return typeof p.at === "number" ? Math.max(0, Math.ceil((p.at - Date.now()) / 86_400_000)) : null;
    case "calc":
      return depth > 6 ? null : calcValue(s, v, depth + 1);
    case "note":
    case "text":
    case "shape": {
      const t = v.textValue;
      const n = textNumber(t);
      if (n !== null) return n;
      const [d, all] = checklistOf(t);
      return all ? d : null;
    }
  }
  return null;
}

/** Доля выполненного 0..1 (галочка, заполненность, отметки); null — неприменимо. */
export function doneShare(s: BoardStore, v: NodeView, goal?: number, depth = 0): number | null {
  const p = v.props;
  switch (v.type) {
    case "task":
      return p.done ? 1 : 0;
    case "switch":
    case "gate":
      return p.on ? 1 : 0;
    case "progress":
      return Math.max(0, Math.min(100, p.pv ?? 0)) / 100;
    case "slider": {
      const lo = p.min ?? 0;
      const hi = p.max ?? 100;
      return hi > lo ? Math.max(0, Math.min(1, ((p.sv ?? 0) - lo) / (hi - lo))) : 0;
    }
    case "tracker":
      return marksOf(p) / Math.max(1, Math.min(60, p.cells ?? 7));
    case "rating":
      return ratingAvg(p) / Math.max(1, p.max ?? 5);
    case "status": {
      const n = statusesOf(p).length;
      return n > 1 ? Math.max(0, Math.min(1, (p.st ?? 0) / (n - 1))) : 0;
    }
    case "counter":
    case "dice":
    case "calc":
    case "poll":
    case "button": {
      const n = numValue(s, v, depth);
      if (n === null) return null;
      return goal && goal > 0 ? Math.max(0, Math.min(1, n / goal)) : n > 0 ? 1 : 0;
    }
    case "note":
    case "text":
    case "shape": {
      const [d, all] = checklistOf(v.textValue);
      if (all) return d / all;
      const n = textNumber(v.textValue);
      return n === null ? null : goal && goal > 0 ? Math.max(0, Math.min(1, n / goal)) : n > 0 ? 1 : 0;
    }
  }
  return null;
}

export const isOn = (s: BoardStore, v: NodeView, goal?: number) => (doneShare(s, v, goal) ?? 0) >= 0.9999;

/** Подпись узла в диаграммах и логике. */
export function nodeTitle(v: NodeView): string {
  const p = v.props;
  const t = (p.title || p.name || "").trim();
  if (t) return t;
  if (v.text) {
    const first = v.textValue
      .split("\n")
      .map((l) => l.replace(/^#+\s*|^\s*[-*+]\s+(\[.\]\s*)?|\*\*/g, "").trim())
      .find(Boolean);
    if (first) return first.length > 40 ? first.slice(0, 39) + "…" : first;
  }
  return TYPE_LABELS[v.type];
}

/* ------------------------------- входы ------------------------------- */

/** Узлы, от которых к этому идут стрелки (по порядку на доске: сверху вниз, слева направо). */
export function inputsOf(s: BoardStore, target: NodeView): NodeView[] {
  void s.bindRev;
  const out: NodeView[] = [];
  const seen = new Set<string>();
  for (const pid of s.bindings.get(target.id) ?? []) {
    const p = s.get(pid);
    if (!p || p.props.b1?.id !== target.id || !p.props.b0) continue;
    const src = s.get(p.props.b0.id);
    if (!src || src.id === target.id || seen.has(src.id)) continue;
    seen.add(src.id);
    out.push(src);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Стрелки, выходящие из узла. */
export function outputsOf(s: BoardStore, source: NodeView): NodeView[] {
  void s.bindRev;
  const out: NodeView[] = [];
  for (const pid of s.bindings.get(source.id) ?? []) {
    const p = s.get(pid);
    if (p && p.props.b0?.id === source.id && p.props.b1 && p.props.b1.id !== source.id) out.push(p);
  }
  return out;
}

export function calcValue(s: BoardStore, v: NodeView, depth = 0): number | null {
  const op: CalcOp = v.props.op ?? "sum";
  const ins = inputsOf(s, v);
  if (op === "count") return ins.filter((x) => (doneShare(s, x, undefined, depth) ?? 0) >= 0.9999).length;
  const nums = ins.map((x) => numValue(s, x, depth)).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  switch (op) {
    case "sum":
      return R(nums.reduce((a, b) => a + b, 0));
    case "avg":
      return R(nums.reduce((a, b) => a + b, 0) / nums.length);
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    case "mul":
      return R(nums.reduce((a, b) => a * b, 1));
    case "diff":
      return R(nums.slice(1).reduce((a, b) => a - b, nums[0]!));
  }
  return null;
}

export function gateValue(s: BoardStore, v: NodeView): boolean {
  const mode: GateMode = v.props.gm ?? "and";
  const ins = inputsOf(s, v);
  const on = ins.filter((x) => isOn(s, x)).length;
  switch (mode) {
    case "and":
      return ins.length > 0 && on === ins.length;
    case "or":
      return on > 0;
    case "not":
      return on === 0;
    case "xor":
      return on === 1;
  }
}

export function fmtNum(n: number, dec?: number): string {
  if (typeof dec === "number") return n.toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return Number.isInteger(n) ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}
