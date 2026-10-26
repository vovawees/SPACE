/* Логика доски. Стрелка между объектами может нести правило: «когда у
   источника (начало стрелки) случилось событие — сделать действие с целью
   (конец стрелки)». Например: отметили задачу → прогресс показывает долю
   выполненного; нажали кнопку → счётчик +1; прогресс дошёл до 100 % → салют.

   Правило выполняет только тот, чьё действие его вызвало, — у остальных
   результат просто приходит вместе с документом. Итоги, которые
   полностью определяются источниками («доля выполненного», «все готовы»,
   логические блоки), досчитывает любой участник — запись при этом
   одинаковая, так что расхождений не бывает. Действия логики попадают в
   ту же отмену (Ctrl+Z), что и вызвавшее их действие человека. */
import { SvelteMap } from "svelte/reactivity";
import * as Y from "yjs";
import type { Board } from "./board.svelte.ts";
import { colorKey, type LogicRule, type NodeData, type NodeType } from "./model.ts";
import { counterValue, deltaKey, rollDice } from "./nodes/games.ts";
import { timerLeft, timerPatch } from "./nodes/timer.ts";
import { doneShare, gateValue, inputsOf, isOn, marksOf, numValue, outputsOf, statusesOf, nodeTitle, calcValue } from "./nodes/values.ts";
import { SPIN_MS, fxPatch, markPatch, spinWheel, wheelOptions, wheelResult } from "./nodes/widgets.ts";
import { LOGIC, LOGIC_SYNC, QUIET, type BoardStore, type NodeView } from "./store.svelte.ts";

/* ------------------------------ словарь ------------------------------ */

export interface TrigDef {
  id: string;
  label: string;
  /** Нужен порог (число). */
  n?: string;
  /** Нужен выбор: статус или вариант колеса. */
  x?: "state" | "option";
  /** Обратное событие — для «отменять при обратном». */
  inv?: string;
  /** Действие — после анимации (кубик, колесо). */
  delay?: number;
}

export interface ActDef {
  id: string;
  label: string;
  n?: { label: string; def: number; unit?: string };
  x?: "color" | "fx" | "text" | "state";
  inv?: string;
}

export function triggersFor(t: NodeType): TrigDef[] {
  switch (t) {
    case "task":
      return [
        { id: "done", label: "выполнена", inv: "undone" },
        { id: "undone", label: "снова не выполнена", inv: "done" },
        { id: "change", label: "отметили или сняли отметку" },
      ];
    case "switch":
    case "gate":
      return [
        { id: "on", label: "включился", inv: "off" },
        { id: "off", label: "выключился", inv: "on" },
        { id: "change", label: "переключился" },
      ];
    case "button":
      return [{ id: "press", label: "нажали" }];
    case "counter":
    case "slider":
    case "calc":
      return [
        { id: "change", label: "изменился" },
        { id: "inc", label: "вырос" },
        { id: "dec", label: "уменьшился" },
        { id: "reach", label: "достиг значения", n: "Значение", inv: "unreach" },
      ];
    case "progress":
      return [
        { id: "full", label: "заполнился до 100 %", inv: "unfull" },
        { id: "reach", label: "достиг процента", n: "Процент", inv: "unreach" },
        { id: "change", label: "изменился" },
      ];
    case "rating":
      return [
        { id: "change", label: "поставили оценку" },
        { id: "reach", label: "средняя оценка достигла", n: "Оценка", inv: "unreach" },
      ];
    case "dice":
      return [
        { id: "roll", label: "бросили", delay: 750 },
        { id: "rollhi", label: "выпало не меньше", n: "Сумма", delay: 750 },
      ];
    case "wheel":
      return [
        { id: "result", label: "остановилось", delay: SPIN_MS + 150 },
        { id: "resultx", label: "выпал вариант…", x: "option", delay: SPIN_MS + 150 },
      ];
    case "status":
      return [
        { id: "state", label: "статус стал…", x: "state" },
        { id: "change", label: "статус сменился" },
      ];
    case "tracker":
      return [
        { id: "mark", label: "отметили клетку", inv: "unmark" },
        { id: "complete", label: "заполнен целиком", inv: "uncomplete" },
        { id: "change", label: "изменился" },
      ];
    case "poll":
      return [{ id: "vote", label: "проголосовали" }];
    case "timer":
      return [
        { id: "end", label: "время вышло" },
        { id: "start", label: "запустили" },
      ];
    case "note":
    case "text":
    case "shape":
      return [
        { id: "complete", label: "выполнены все пункты списка", inv: "uncomplete" },
        { id: "change", label: "изменили пункты или текст" },
      ];
  }
  return [];
}

const COMMON: ActDef[] = [
  { id: "fx", label: "эффект", x: "fx" },
  { id: "show", label: "показать", inv: "hide" },
  { id: "hide", label: "спрятать", inv: "show" },
  { id: "togglevis", label: "показать или спрятать" },
  { id: "color", label: "перекрасить", x: "color" },
  { id: "go", label: "показать на экране (камера)" },
  { id: "say", label: "написать в чат", x: "text" },
];

const NUM_ACTS = (unit = "", def = 1): ActDef[] => [
  { id: "add", label: "прибавить", n: { label: "Сколько", def, unit }, inv: "sub" },
  { id: "sub", label: "отнять", n: { label: "Сколько", def, unit }, inv: "add" },
  { id: "set", label: "установить", n: { label: "Значение", def: 0, unit } },
];

export function actionsFor(t: NodeType): ActDef[] {
  switch (t) {
    case "counter":
      return [{ id: "count", label: "считать выполненные источники" }, ...NUM_ACTS(), { id: "addsrc", label: "прибавить число источника", inv: "subsrc" }, ...COMMON];
    case "progress":
      return [{ id: "share", label: "показывать долю выполненного" }, ...NUM_ACTS("%", 10), ...COMMON];
    case "slider":
      return [{ id: "share", label: "показывать долю выполненного" }, ...NUM_ACTS("", 10), ...COMMON];
    case "task":
      return [
        { id: "check", label: "отметить выполненной", inv: "uncheck" },
        { id: "uncheck", label: "снять отметку", inv: "check" },
        { id: "toggle", label: "переключить" },
        { id: "mirror", label: "повторять за источником" },
        { id: "all", label: "отметить, когда готовы все источники" },
        ...COMMON,
      ];
    case "switch":
      return [
        { id: "on", label: "включить", inv: "off" },
        { id: "off", label: "выключить", inv: "on" },
        { id: "toggle", label: "переключить" },
        { id: "mirror", label: "повторять за источником" },
        { id: "all", label: "включить, когда готовы все источники" },
        ...COMMON,
      ];
    case "dice":
      return [{ id: "roll", label: "бросить" }, ...COMMON];
    case "wheel":
      return [{ id: "spin", label: "крутить" }, ...COMMON];
    case "timer":
      return [{ id: "start", label: "запустить", inv: "stop" }, { id: "stop", label: "поставить на паузу", inv: "start" }, { id: "reset", label: "сбросить" }, ...COMMON];
    case "status":
      return [{ id: "next", label: "следующий статус" }, { id: "setst", label: "поставить статус…", x: "state" }, ...COMMON];
    case "tracker":
      return [{ id: "mark", label: "отметить следующую клетку", inv: "unmark" }, { id: "unmark", label: "снять последнюю отметку", inv: "mark" }, { id: "clear", label: "очистить" }, ...COMMON];
    case "button":
      return [{ id: "press", label: "нажать" }, ...COMMON];
    case "gate":
    case "calc":
    case "chart":
      return [];
    case "path":
    case "comment":
      return [];
  }
  return COMMON;
}

/** Цели, которые сами считают входы: им правило не нужно. */
export const AUTO_INPUT = new Set<NodeType>(["gate", "calc", "chart"]);
/** Действия-итоги: значение цели целиком выводится из источников. */
const DERIVED = new Set(["share", "count", "all"]);

export function trigDef(t: NodeType, id: string): TrigDef | undefined {
  return triggersFor(t).find((d) => d.id === id);
}
export function actDef(t: NodeType, id: string): ActDef | undefined {
  return actionsFor(t).find((d) => d.id === id);
}

/** Удачное правило по умолчанию для пары «источник → цель». */
export function suggestRule(src: NodeType, tgt: NodeType): LogicRule | null {
  const trs = triggersFor(src);
  const acts = actionsFor(tgt);
  if (!trs.length || !acts.length) return null;
  const has = (id: string) => acts.some((a) => a.id === id);
  const first = trs[0]!.id;
  if (src === "button") {
    const pref = ["add", "roll", "spin", "start", "toggle", "next", "mark", "press"].find(has) ?? "fx";
    return { on: "press", do: pref, n: pref === "add" ? (tgt === "progress" ? 10 : 1) : undefined, x: pref === "fx" ? "confetti" : undefined };
  }
  if (src === "dice" && tgt === "counter") return { on: "roll", do: "addsrc" };
  if (src === "wheel") return { on: "result", do: has("add") ? "add" : "fx", n: has("add") ? 1 : undefined, x: has("add") ? undefined : "confetti" };
  if (src === "timer") return { on: "end", do: has("check") ? "check" : has("on") ? "on" : "fx", x: has("check") || has("on") ? undefined : "ding" };
  if (has("share")) return { on: "change", do: "share", n: src === "counter" || src === "calc" || src === "dice" ? 10 : undefined };
  if (has("count")) return { on: "change", do: "count" };
  if ((src === "switch" || src === "gate") && has("mirror")) return { on: "change", do: "mirror" };
  if (has("all")) return { on: "change", do: "all" };
  if (src === "progress") return { on: "full", do: "fx", x: "confetti", rev: false };
  if (src === "tracker" || src === "note" || src === "text") return { on: "complete", do: "fx", x: "confetti", rev: false };
  if (src === "switch" || src === "gate") return { on: "on", do: "show", rev: true };
  if (src === "task") return { on: "done", do: "fx", x: "confetti", rev: false };
  return { on: first, do: acts[0]!.id, n: acts[0]!.n?.def };
}

/** Коротко о правиле — подпись на стрелке. */
export function ruleSummary(s: BoardStore, arrow: NodeView): string {
  const r = arrow.props.lg;
  const tgt = s.get(arrow.props.b1?.id);
  if (!r || !tgt) return "";
  const a = actDef(tgt.type, r.do);
  if (!a) return "⚡";
  const n = typeof r.n === "number" ? r.n : a.n?.def;
  switch (r.do) {
    case "add":
      return `⚡ +${n}${a.n?.unit ?? ""}`;
    case "sub":
      return `⚡ −${n}${a.n?.unit ?? ""}`;
    case "set":
      return `⚡ =${n}${a.n?.unit ?? ""}`;
    case "share":
      return "⚡ доля";
    case "count":
      return "⚡ счёт";
    case "all":
      return "⚡ все";
    case "mirror":
      return "⚡ как у";
    case "fx":
      return "⚡ " + (r.x === "confetti" ? "🎉" : r.x === "hearts" ? "💖" : r.x === "stars" ? "⭐" : r.x === "ding" || r.x === "fanfare" ? "🔔" : "✨");
    default:
      return SUMMARY[r.do] ? `⚡ ${SUMMARY[r.do]}` : "⚡";
  }
}

/** Значки остальных действий для подписи на стрелке. */
const SUMMARY: Record<string, string> = {
  show: "👁",
  hide: "🙈",
  togglevis: "👁⇄",
  color: "🎨",
  go: "🎥",
  say: "💬",
  roll: "🎲",
  spin: "🎡",
  start: "▶",
  stop: "⏸",
  reset: "↺",
  check: "✓",
  uncheck: "☐",
  on: "вкл",
  off: "выкл",
  toggle: "⇄",
  next: "→",
  setst: "→",
  press: "👆",
  mark: "✓",
  unmark: "↶",
  clear: "⌫",
  addsrc: "+n",
  subsrc: "−n",
};

/** Стрелка годится для логики: оба конца привязаны к разным объектам. */
export function logicEnds(s: BoardStore, arrow: NodeView): { src: NodeView; tgt: NodeView } | null {
  if (arrow.type !== "path") return null;
  const src = s.get(arrow.props.b0?.id);
  const tgt = s.get(arrow.props.b1?.id);
  if (!src || !tgt || src.id === tgt.id) return null;
  return { src, tgt };
}

export function canLogic(s: BoardStore, arrow: NodeView): boolean {
  const e = logicEnds(s, arrow);
  return !!e && triggersFor(e.src.type).length > 0 && (actionsFor(e.tgt.type).length > 0 || AUTO_INPUT.has(e.tgt.type));
}

/* ------------------------------- снимки ------------------------------- */

interface Snap {
  n: number | null;
  sh: number | null;
  on: boolean;
  /** Номер события (нажатие, бросок, запуск). */
  k: number;
  /** Строковое состояние (статус, вариант колеса, голоса). */
  x: string;
}

function snapOf(s: BoardStore, v: NodeView): Snap {
  const p = v.props;
  const sh = doneShare(s, v);
  let k = 0;
  let x = "";
  switch (v.type) {
    case "button":
      k = p.press?.s ?? 0;
      break;
    case "dice":
      k = p.roll?.s ?? 0;
      break;
    case "wheel":
      k = p.spin?.s ?? 0;
      x = wheelResult(v)?.t ?? "";
      break;
    case "status":
      x = String(p.st ?? 0);
      break;
    case "timer":
      k = typeof p.end === "number" ? p.end : 0;
      break;
    case "poll":
      x = JSON.stringify(Object.entries(p).filter(([key]) => key.startsWith("vote:")));
      break;
  }
  const on = v.type === "switch" || v.type === "gate" ? !!p.on : v.type === "task" ? !!p.done : (sh ?? 0) >= 0.9999;
  return { n: numValue(s, v), sh, on, k, x };
}

const same = (a: Snap, b: Snap) => a.n === b.n && a.sh === b.sh && a.on === b.on && a.k === b.k && a.x === b.x;

/** Какие события случились с источником для этого правила. */
function eventsFor(type: NodeType, o: Snap, c: Snap, r: LogicRule): Set<string> {
  const ev = new Set<string>();
  const N = typeof r.tn === "number" ? r.tn : NaN;
  const num = (a: number | null) => a ?? 0;
  switch (type) {
    case "task":
      if (o.on !== c.on) ev.add(c.on ? "done" : "undone").add("change");
      break;
    case "switch":
    case "gate":
      if (o.on !== c.on) ev.add(c.on ? "on" : "off").add("change");
      break;
    case "button":
      if (c.k > o.k) ev.add("press");
      break;
    case "counter":
    case "slider":
    case "calc":
    case "rating":
    case "progress":
      if (num(o.n) !== num(c.n)) {
        ev.add("change").add(num(c.n) > num(o.n) ? "inc" : "dec");
        if (!Number.isNaN(N)) {
          if (num(o.n) < N && num(c.n) >= N) ev.add("reach");
          if (num(o.n) >= N && num(c.n) < N) ev.add("unreach");
        }
        if (type === "progress") {
          if (num(o.n) < 100 && num(c.n) >= 100) ev.add("full");
          if (num(o.n) >= 100 && num(c.n) < 100) ev.add("unfull");
        }
      }
      break;
    case "dice":
      if (c.k !== o.k && c.k > 0) {
        ev.add("roll");
        if (!Number.isNaN(N) && num(c.n) >= N) ev.add("rollhi");
      }
      break;
    case "wheel":
      if (c.k !== o.k && c.k > 0) {
        ev.add("result");
        if (r.tx && c.x === r.tx) ev.add("resultx");
      }
      break;
    case "status":
      if (c.x !== o.x) {
        ev.add("change");
        if (r.tx !== undefined && c.x === r.tx) ev.add("state");
      }
      break;
    case "tracker":
      if (num(c.n) > num(o.n)) ev.add("mark");
      if (num(c.n) < num(o.n)) ev.add("unmark");
      if (o.on !== c.on) ev.add(c.on ? "complete" : "uncomplete");
      if (num(c.n) !== num(o.n)) ev.add("change");
      break;
    case "poll":
      if (c.x !== o.x) ev.add("vote");
      break;
    case "timer":
      if (c.k && c.k !== o.k) ev.add("start");
      break;
    case "note":
    case "text":
    case "shape":
      if (o.sh !== c.sh || o.n !== c.n) ev.add("change");
      if (o.on !== c.on) ev.add(c.on ? "complete" : "uncomplete");
      break;
  }
  return ev;
}

/* -------------------------------- движок -------------------------------- */

const MAX_DEPTH = 12;

type Patches = Map<string, Record<string, unknown>>;
interface Side {
  say: { text: string; ref: string }[];
  go: string | null;
  roll: string[];
  spin: string[];
}

export class Logic {
  private readonly b: Board;
  private readonly snaps = new Map<string, Snap>();
  /** Куда смотрела каждая стрелка — чтобы пересчитать прежнюю цель, если её отвязали. */
  private readonly arrowTo = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly syncQueue = new Set<string>();
  /** Стрелки, по которым только что прошёл сигнал (для подсветки). */
  readonly pulses = new SvelteMap<string, number>();
  private pulseSeq = 0;

  constructor(b: Board) {
    this.b = b;
    const s = b.store;
    for (const v of s.views.values()) {
      this.snaps.set(v.id, snapOf(s, v));
      if (v.type === "path" && v.props.b1) this.arrowTo.set(v.id, v.props.b1.id);
    }
    s.nodes.observeDeep(this.onDeep);
  }

  destroy() {
    this.b.store.nodes.unobserveDeep(this.onDeep);
    for (const t of this.timers.values()) clearTimeout(t);
    clearTimeout(this.syncTimer);
  }

  private get s(): BoardStore {
    return this.b.store;
  }

  private onDeep = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
    const s = this.s;
    const changed = new Set<string>();
    const added = new Set<string>();
    const arrows = new Set<string>();
    const oldTargets = new Set<string>();
    for (const e of events) {
      if (e.target === s.nodes) {
        for (const [key, ch] of e.changes.keys) {
          if (ch.action === "delete") {
            this.snaps.delete(key);
            const was = this.arrowTo.get(key);
            if (was) {
              this.arrowTo.delete(key);
              oldTargets.add(was);
            }
          } else added.add(key);
        }
        continue;
      }
      const id = e.path[0];
      if (typeof id !== "string") continue;
      const v = s.get(id);
      if (!v) continue;
      if (v.type === "path") {
        if (e.target === v.ymap && [...e.changes.keys.keys()].some((k) => k === "lg" || k === "b0" || k === "b1")) arrows.add(id);
        continue;
      }
      changed.add(id);
    }
    for (const id of added) {
      const v = s.get(id);
      if (!v) continue;
      this.snaps.set(id, snapOf(s, v));
      if (v.type === "path") arrows.add(id);
    }
    if (!changed.size && !arrows.size && !oldTargets.size) return;

    const origin = tr.origin;
    const user = tr.local && origin !== QUIET && origin !== LOGIC_SYNC && !(origin instanceof Y.UndoManager) && !this.b.readonly && !this.b.preview;
    const depth = origin === LOGIC ? ((tr.meta.get("lgd") as number | undefined) ?? 1) : 0;

    // зависимые вычисления и логические блоки тоже могли «сдвинуться»
    const touched = new Set(changed);
    let frontier = [...changed];
    for (let hop = 0; hop < 6 && frontier.length; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        const v = s.get(id);
        if (!v) continue;
        for (const a of outputsOf(s, v)) {
          const t = s.get(a.props.b1?.id);
          if (t && (t.type === "calc" || t.type === "gate") && !touched.has(t.id)) {
            touched.add(t.id);
            if (t.type === "calc") next.push(t.id);
          }
        }
      }
      frontier = next;
    }

    const fired: { id: string; o: Snap; c: Snap }[] = [];
    for (const id of touched) {
      const v = s.get(id);
      if (!v) continue;
      const o = this.snaps.get(id);
      const c = snapOf(s, v);
      this.snaps.set(id, c);
      if (o && !same(o, c)) fired.push({ id, o, c });
    }

    // итоги, которые надо досчитать: цели «доли» и логические блоки
    const derived = new Set<string>();
    for (const aid of arrows) {
      const a = s.get(aid);
      const was = this.arrowTo.get(aid);
      const now = a?.props.b1?.id;
      if (was && was !== now) oldTargets.add(was);
      if (now) this.arrowTo.set(aid, now);
      else this.arrowTo.delete(aid);
    }
    for (const id of oldTargets) if (s.get(id)) derived.add(id);
    for (const f of fired) {
      const v = s.get(f.id);
      if (!v) continue;
      for (const a of outputsOf(s, v)) {
        const t = s.get(a.props.b1?.id);
        if (!t) continue;
        if (t.type === "gate" || (a.props.lg && DERIVED.has(a.props.lg.do))) derived.add(t.id);
      }
    }
    for (const aid of arrows) {
      const a = s.get(aid);
      const t = a ? s.get(a.props.b1?.id) : undefined;
      if (t && (t.type === "gate" || (a!.props.lg && DERIVED.has(a!.props.lg.do)))) derived.add(t.id);
    }

    if (!user) {
      // чужая правка: досчитать итоги без событий (тихо и с задержкой)
      if (!this.b.readonly && derived.size) {
        for (const id of derived) this.syncQueue.add(id);
        clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => this.flushSync(), 350);
      }
      return;
    }
    if (depth > MAX_DEPTH) return;

    const patches: Patches = new Map();
    const side: Side = { say: [], go: null, roll: [], spin: [] };
    const later: { delay: number; arrow: string; src: string; tgt: string; r: LogicRule }[] = [];

    for (const f of fired) {
      const v = s.get(f.id);
      if (!v) continue;
      if (v.type === "timer") this.scheduleTimer(v);
      for (const a of outputsOf(s, v)) {
        const r = a.props.lg;
        const tgt = s.get(a.props.b1?.id);
        if (!r || !tgt || DERIVED.has(r.do)) continue;
        const ev = eventsFor(v.type, f.o, f.c, r);
        const def = trigDef(v.type, r.on);
        let sign: 0 | 1 | -1 = 0;
        if (r.do === "mirror") sign = f.o.on !== f.c.on ? 1 : 0;
        else if (ev.has(r.on)) sign = 1;
        else if (def?.inv && ev.has(def.inv) && r.rev !== false) sign = -1;
        if (!sign) continue;
        if (def?.delay && sign > 0) later.push({ delay: def.delay, arrow: a.id, src: v.id, tgt: tgt.id, r });
        else this.act(a, r, v, tgt, sign, patches, side);
      }
    }
    for (const id of derived) this.derive(id, patches);
    this.commit(patches, side, depth + 1);

    // после анимации (кубик, колесо) — отдельной правкой
    for (const l of later) {
      setTimeout(() => {
        const a = s.get(l.arrow);
        const src = s.get(l.src);
        const tgt = s.get(l.tgt);
        if (this.b.readonly || !a || !src || !tgt) return;
        const p: Patches = new Map();
        const sd: Side = { say: [], go: null, roll: [], spin: [] };
        this.act(a, l.r, src, tgt, 1, p, sd);
        this.commit(p, sd, depth + 1);
      }, l.delay);
    }
  };

  /* ------------------------------ действия ------------------------------ */

  private cur(patches: Patches, v: NodeView, key: string): unknown {
    const p = patches.get(v.id);
    if (p && key in p) return p[key];
    return (v.props as Record<string, unknown>)[key];
  }

  private put(patches: Patches, id: string, patch: Record<string, unknown>) {
    const p = patches.get(id) ?? {};
    Object.assign(p, patch);
    patches.set(id, p);
  }

  private act(arrow: NodeView, r: LogicRule, src: NodeView, t: NodeView, sign: 1 | -1, patches: Patches, side: Side) {
    const s = this.s;
    let what = r.do;
    if (sign < 0) {
      const inv = actDef(t.type, r.do)?.inv;
      if (!inv) return;
      what = inv;
    }
    const ad = actDef(t.type, r.do);
    const n = typeof r.n === "number" && Number.isFinite(r.n) ? r.n : (ad?.n?.def ?? 1);
    this.pulse(arrow.id);
    const num = (key: string, d: number) => {
      const x = this.cur(patches, t, key);
      return (typeof x === "number" ? x : d);
    };
    switch (what) {
      case "add":
      case "sub":
      case "set":
      case "addsrc":
      case "subsrc": {
        const delta = what === "add" ? n : what === "sub" ? -n : what === "addsrc" ? (numValue(s, src) ?? 0) : what === "subsrc" ? -(numValue(s, src) ?? 0) : 0;
        if (t.type === "counter") {
          if (what === "set") {
            let deltas = 0;
            for (const [k, x] of Object.entries(t.props as Record<string, unknown>)) if (k.startsWith("d:") && typeof x === "number") deltas += x;
            this.put(patches, t.id, { n0: Math.round((n - deltas) * 1000) / 1000 });
          } else {
            const k = deltaKey(this.b.me.id);
            this.put(patches, t.id, { [k]: Math.round((num(k, 0) + delta) * 1000) / 1000 });
          }
        } else if (t.type === "progress") {
          const v0 = num("pv", 0);
          this.put(patches, t.id, { pv: Math.round(Math.max(0, Math.min(100, what === "set" ? n : v0 + delta))) });
        } else if (t.type === "slider") {
          const lo = t.props.min ?? 0;
          const hi = t.props.max ?? 100;
          const v0 = num("sv", lo);
          this.put(patches, t.id, { sv: Math.round(Math.max(lo, Math.min(hi, what === "set" ? n : v0 + delta)) * 1000) / 1000 });
        }
        break;
      }
      case "check":
      case "uncheck":
      case "toggle":
      case "mirror":
      case "on":
      case "off": {
        const key = t.type === "task" ? "done" : "on";
        const curOn = !!this.cur(patches, t, key);
        const next = what === "check" || what === "on" ? true : what === "uncheck" || what === "off" ? false : what === "toggle" ? !curOn : isOn(s, src);
        if (t.type === "task" || t.type === "switch") this.put(patches, t.id, { [key]: next || undefined });
        else if (t.type === "timer") {
          /* таймер: on — запустить */
        }
        break;
      }
      case "roll":
        side.roll.push(t.id);
        break;
      case "spin":
        side.spin.push(t.id);
        break;
      case "start":
      case "stop":
      case "reset": {
        if (t.type !== "timer") break;
        const now = Date.now();
        const running = typeof t.props.end === "number" && timerLeft(t.props, now) > 0;
        if (what === "reset") this.put(patches, t.id, timerPatch(t.props, "reset", now) as Record<string, unknown>);
        else if ((what === "start") !== running) this.put(patches, t.id, timerPatch(t.props, "toggle", now) as Record<string, unknown>);
        break;
      }
      case "next":
      case "setst": {
        const list = statusesOf(t.props);
        const cur = num("st", 0);
        const idx = what === "next" ? (cur + 1) % list.length : Math.max(0, Math.min(list.length - 1, Number(r.x ?? 0) || 0));
        this.put(patches, t.id, { st: idx });
        break;
      }
      case "mark":
      case "unmark":
      case "clear": {
        if (t.type !== "tracker") break;
        // учитываем уже назначенные в этой пачке отметки
        const merged = { ...t, props: { ...t.props, ...(patches.get(t.id) ?? {}) } } as unknown as NodeView;
        this.put(patches, t.id, markPatch(merged, what === "mark" ? "next" : what === "unmark" ? "last" : "clear"));
        break;
      }
      case "press": {
        const me = this.b.me;
        const pr = this.cur(patches, t, "press") as { s?: number } | undefined;
        this.put(patches, t.id, { press: { s: (pr?.s ?? 0) + 1, n: me.name, c: me.color } });
        break;
      }
      case "show":
      case "hide":
      case "togglevis": {
        const hid = !!this.cur(patches, t, "hid");
        const next = what === "show" ? false : what === "hide" ? true : !hid;
        this.put(patches, t.id, { hid: next || undefined });
        break;
      }
      case "color":
        if (r.x) this.put(patches, t.id, { color: colorKey(r.x) });
        break;
      case "fx": {
        const merged = { props: { ...t.props, ...(patches.get(t.id) ?? {}) } } as unknown as NodeView;
        this.put(patches, t.id, fxPatch(merged, r.x || "confetti"));
        break;
      }
      case "say":
        if (r.x?.trim()) side.say.push({ text: r.x.trim(), ref: t.id });
        break;
      case "go":
        side.go = t.id;
        break;
    }
  }

  /** Досчитать итог цели по всем её источникам. */
  private derive(id: string, patches: Patches) {
    const s = this.s;
    const t = s.get(id);
    if (!t) return;
    if (t.type === "gate") {
      const on = gateValue(s, t);
      if (!!t.props.on !== on) this.put(patches, id, { on: on || undefined });
      return;
    }
    const rules: { r: LogicRule; src: NodeView }[] = [];
    for (const pid of s.bindings.get(id) ?? []) {
      const a = s.get(pid);
      if (!a || a.props.b1?.id !== id || !a.props.lg || !DERIVED.has(a.props.lg.do)) continue;
      const src = s.get(a.props.b0?.id);
      if (src && src.id !== id) rules.push({ r: a.props.lg, src });
    }
    if (!rules.length) return;
    const kind = rules[0]!.r.do;
    const shares = rules.map(({ r, src }) => doneShare(s, src, r.n)).filter((x): x is number => x !== null);
    const avg = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
    const allOn = rules.every(({ r, src }) => (doneShare(s, src, r.n) ?? 0) >= 0.9999);
    const count = rules.filter(({ r, src }) => (doneShare(s, src, r.n) ?? 0) >= 0.9999).length;
    if (t.type === "progress" && kind === "share") {
      const pv = Math.round(avg * 100);
      if ((t.props.pv ?? 0) !== pv) this.put(patches, id, { pv });
    } else if (t.type === "slider" && kind === "share") {
      const lo = t.props.min ?? 0;
      const hi = t.props.max ?? 100;
      const sv = Math.round((lo + avg * (hi - lo)) * 100) / 100;
      if ((t.props.sv ?? 0) !== sv) this.put(patches, id, { sv });
    } else if (t.type === "counter" && kind === "count") {
      if (counterValue(t.props) !== count) {
        let deltas = 0;
        for (const [k, x] of Object.entries(t.props as Record<string, unknown>)) if (k.startsWith("d:") && typeof x === "number") deltas += x;
        this.put(patches, id, { n0: count - deltas });
      }
    } else if ((t.type === "task" || t.type === "switch") && kind === "all") {
      const key = t.type === "task" ? "done" : "on";
      if (!!(t.props as Record<string, unknown>)[key] !== allOn) this.put(patches, id, { [key]: allOn || undefined });
    }
  }

  private commit(patches: Patches, side: Side, depth: number) {
    const s = this.s;
    if (this.b.readonly) return;
    if (patches.size) {
      s.doc.transact((tr) => {
        tr.meta.set("lgd", depth);
        for (const [id, p] of patches) s.update(id, p as Partial<NodeData>, LOGIC);
      }, LOGIC);
    }
    if (side.roll.length) rollDice(this.b, side.roll);
    if (side.spin.length) spinWheel(this.b, side.spin);
    for (const m of side.say) this.b.social.send(`⚡ ${m.text}`, [m.ref]);
    if (side.go) {
      const t = s.get(side.go);
      if (t) this.b.camera.fit(s.bounds(t), { maxZoom: 1.2, animate: true });
    }
  }

  /** Досчитать итоги после чужих правок (без событий и без отмены). */
  private flushSync() {
    if (this.b.readonly) return this.syncQueue.clear();
    const patches: Patches = new Map();
    for (const id of this.syncQueue) this.derive(id, patches);
    this.syncQueue.clear();
    if (!patches.size) return;
    const s = this.s;
    s.doc.transact(() => {
      for (const [id, p] of patches) s.update(id, p as Partial<NodeData>, LOGIC_SYNC);
    }, LOGIC_SYNC);
  }

  /** Пересчитать цель сразу (правило только что задали). */
  refresh(targetId: string) {
    if (this.b.readonly) return;
    const patches: Patches = new Map();
    this.derive(targetId, patches);
    this.commit(patches, { say: [], go: null, roll: [], spin: [] }, 1);
  }

  /* ------------------------------ таймеры ------------------------------ */

  private scheduleTimer(v: NodeView) {
    clearTimeout(this.timers.get(v.id));
    this.timers.delete(v.id);
    const end = v.props.end;
    if (typeof end !== "number") return;
    const ms = end - Date.now();
    if (ms < 0 || ms > 24 * 3600_000) return;
    const s = this.s;
    if (!outputsOf(s, v).some((a) => a.props.lg?.on === "end")) return;
    this.timers.set(
      v.id,
      setTimeout(() => {
        this.timers.delete(v.id);
        const cur = s.get(v.id);
        if (!cur || cur.props.end !== end || this.b.readonly) return;
        const patches: Patches = new Map();
        const side: Side = { say: [], go: null, roll: [], spin: [] };
        for (const a of outputsOf(s, cur)) {
          const r = a.props.lg;
          const tgt = s.get(a.props.b1?.id);
          if (r?.on === "end" && tgt && !DERIVED.has(r.do)) this.act(a, r, cur, tgt, 1, patches, side);
        }
        this.commit(patches, side, 1);
      }, ms + 60),
    );
  }

  private pulse(arrowId: string) {
    const seq = ++this.pulseSeq;
    this.pulses.set(arrowId, seq);
    setTimeout(() => {
      if (this.pulses.get(arrowId) === seq) this.pulses.delete(arrowId);
    }, 1200);
  }
}

/* ------------------------------ подсказки ------------------------------ */

export function describeSource(v: NodeView): string {
  return `${nodeTitle(v)}`;
}

export { calcValue, inputsOf, marksOf, wheelOptions };
