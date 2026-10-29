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
import { colorKey, dayKey, scoreKey, type LogicRule, type NodeData, type NodeProps, type NodeType } from "./model.ts";
import { counterAddPatch, counterSetPatch, counterValue, rollDice } from "./nodes/games.ts";
import {
  COIN_MS,
  RANDOM_MS,
  buzzesOf,
  checklistPatch,
  clearPatch,
  coinPatch,
  drawPatch,
  isBuzzKey,
  isDayKey,
  isScoreKey,
  isWordsKey,
  playersOf,
  randomPatch,
  scoreOf,
  scoreSig,
  shufflePatch,
  swPatch,
  swRunning,
  todayIso,
  turnPatch,
  wordsCount,
} from "./nodes/play.ts";
import { DAY, loopEnd, timerLeft, timerPatch } from "./nodes/timer.ts";
import {
  LOOT_MS,
  addCardPatch,
  clearDonePatch,
  kanbanDone,
  kanbanSig,
  lootDrop,
  lootItems,
  lootPatch,
  pokerResetPatch,
  pokerSig,
  pokerVotes,
  restorePatch,
  sigVal,
  statClamp,
  statsOf,
  statsSig,
} from "./nodes/design.ts";
import { doneShare, gateValue, inputNumber, inputsOf, isOn, marksOf, numValue, outputsOf, statusesOf, nodeTitle, calcValue } from "./nodes/values.ts";
import { SPIN_MS, fxPatch, markPatch, spinWheel, wheelOptions, wheelResult } from "./nodes/widgets.ts";
import { LOGIC, LOGIC_SYNC, QUIET, type BoardStore, type NodeView } from "./store.svelte.ts";

/* ------------------------------ словарь ------------------------------ */

export interface TrigDef {
  id: string;
  label: string;
  /** Нужен порог (число). */
  n?: string;
  /** Нужен выбор: статус, вариант колеса или предмет добычи, шкала персонажа. */
  x?: "state" | "option" | "player";
  /** Обратное событие — для «отменять при обратном». */
  inv?: string;
  /** Действие — после анимации (кубик, колесо). */
  delay?: number;
}

export interface ActDef {
  id: string;
  label: string;
  n?: { label: string; def: number; unit?: string };
  x?: "color" | "fx" | "text" | "state" | "player";
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
    case "stopwatch":
      return [
        { id: "start", label: "запустили", inv: "stop" },
        { id: "stop", label: "остановили", inv: "start" },
        { id: "lap", label: "отметили круг" },
        { id: "reset", label: "сбросили" },
      ];
    case "coin":
      return [
        { id: "flip", label: "подбросили", delay: COIN_MS + 100 },
        { id: "side0", label: "выпала первая сторона (орёл)", delay: COIN_MS + 100 },
        { id: "side1", label: "выпала вторая сторона (решка)", delay: COIN_MS + 100 },
      ];
    case "flipcard":
      return [
        { id: "on", label: "перевернули на ответ", inv: "off" },
        { id: "off", label: "вернули на вопрос", inv: "on" },
        { id: "change", label: "перевернули" },
      ];
    case "spoiler":
      return [
        { id: "on", label: "открыли", inv: "off" },
        { id: "off", label: "снова спрятали", inv: "on" },
      ];
    case "deck":
      return [
        { id: "draw", label: "вытянули карту", delay: 450 },
        { id: "empty", label: "кончились карты", inv: "refill" },
        { id: "shuffle", label: "перемешали" },
      ];
    case "random":
      return [
        { id: "pick", label: "выбрал", delay: RANDOM_MS },
        { id: "pickhi", label: "выпало число не меньше", n: "Число", delay: RANDOM_MS },
      ];
    case "score":
      return [
        { id: "change", label: "изменился счёт" },
        { id: "reach", label: "кто-то набрал", n: "Очки", inv: "unreach" },
      ];
    case "turns":
      return [
        { id: "next", label: "ход перешёл" },
        { id: "round", label: "начался новый раунд" },
      ];
    case "buzzer":
      return [
        { id: "first", label: "кто-то нажал первым", inv: "cleared" },
        { id: "press", label: "нажали" },
      ];
    case "checklist":
      return [
        { id: "mark", label: "отметили пункт", inv: "unmark" },
        { id: "unmark", label: "сняли отметку", inv: "mark" },
        { id: "complete", label: "отмечены все пункты", inv: "uncomplete" },
        { id: "change", label: "изменился" },
      ];
    case "input":
      return [
        { id: "change", label: "изменили" },
        { id: "filled", label: "заполнили", inv: "emptied" },
        { id: "reach", label: "число достигло", n: "Значение", inv: "unreach" },
      ];
    case "calendar":
      return [
        { id: "mark", label: "отметили день", inv: "unmark" },
        { id: "change", label: "изменились отметки" },
      ];
    case "words":
      return [
        { id: "add", label: "добавили слово" },
        { id: "change", label: "изменилось" },
      ];
    case "kanban":
      return [
        { id: "done", label: "карточку перенесли в последнюю колонку", inv: "undone" },
        { id: "undone", label: "карточка ушла из последней колонки", inv: "done" },
        { id: "complete", label: "готовы все карточки", inv: "uncomplete" },
        { id: "add", label: "добавили карточку" },
        { id: "change", label: "карточки переложили" },
      ];
    case "roadmap":
      return [
        { id: "complete", label: "все этапы готовы", inv: "uncomplete" },
        { id: "reach", label: "готовность достигла", n: "Процент", inv: "unreach" },
        { id: "change", label: "изменилась готовность" },
      ];
    case "stats":
      return [
        { id: "change", label: "изменилась шкала…", x: "player" },
        { id: "dec", label: "шкала уменьшилась…", x: "player" },
        { id: "inc", label: "шкала выросла…", x: "player" },
        { id: "zero", label: "шкала опустилась до нуля…", x: "player", inv: "unzero" },
        { id: "reach", label: "шкала достигла значения…", n: "Значение", x: "player", inv: "unreach" },
      ];
    case "loot":
      return [
        { id: "drop", label: "выпала добыча", delay: LOOT_MS + 100 },
        { id: "dropx", label: "выпал предмет…", x: "option", delay: LOOT_MS + 100 },
      ];
    case "estimate":
      return [
        { id: "reveal", label: "открыли карты", inv: "conceal" },
        { id: "consensus", label: "открыли, и все согласны" },
        { id: "vote", label: "кто-то выбрал карту" },
        { id: "conceal", label: "начали новый раунд", inv: "reveal" },
      ];
    case "curve":
      return [
        { id: "change", label: "значение изменилось" },
        { id: "inc", label: "значение выросло" },
        { id: "dec", label: "значение уменьшилось" },
        { id: "reach", label: "значение достигло", n: "Значение", inv: "unreach" },
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
    case "stopwatch":
      return [
        { id: "start", label: "запустить", inv: "stop" },
        { id: "stop", label: "остановить", inv: "start" },
        { id: "toggle", label: "запустить или остановить" },
        { id: "lap", label: "отметить круг" },
        { id: "reset", label: "сбросить" },
        ...COMMON,
      ];
    case "coin":
      return [{ id: "flip", label: "подбросить" }, ...COMMON];
    case "flipcard":
      return [
        { id: "on", label: "показать ответ", inv: "off" },
        { id: "off", label: "показать вопрос", inv: "on" },
        { id: "toggle", label: "перевернуть" },
        { id: "mirror", label: "повторять за источником" },
        ...COMMON,
      ];
    case "spoiler":
      return [
        { id: "on", label: "открыть", inv: "off" },
        { id: "off", label: "спрятать снова", inv: "on" },
        { id: "toggle", label: "открыть или спрятать" },
        { id: "mirror", label: "повторять за источником" },
        ...COMMON,
      ];
    case "deck":
      return [{ id: "draw", label: "вытянуть карту" }, { id: "shuffle", label: "перемешать" }, ...COMMON];
    case "random":
      return [{ id: "pick", label: "выбрать случайно" }, ...COMMON];
    case "score":
      return [
        { id: "add", label: "прибавить очки", n: { label: "Сколько", def: 1 }, x: "player", inv: "sub" },
        { id: "sub", label: "отнять очки", n: { label: "Сколько", def: 1 }, x: "player", inv: "add" },
        { id: "set", label: "установить очки", n: { label: "Значение", def: 0 }, x: "player" },
        { id: "addsrc", label: "прибавить число источника", x: "player", inv: "subsrc" },
        { id: "reset", label: "обнулить счёт" },
        ...COMMON,
      ];
    case "turns":
      return [{ id: "next", label: "передать ход", inv: "prev" }, { id: "prev", label: "вернуть ход назад", inv: "next" }, { id: "restart", label: "начать сначала" }, ...COMMON];
    case "buzzer":
      return [{ id: "clear", label: "сбросить нажатия" }, ...COMMON];
    case "checklist":
      return [
        { id: "mark", label: "отметить следующий пункт", inv: "unmark" },
        { id: "unmark", label: "снять последнюю отметку", inv: "mark" },
        { id: "markall", label: "отметить все пункты", inv: "clear" },
        { id: "clear", label: "снять все отметки" },
        ...COMMON,
      ];
    case "input":
      return [{ id: "settext", label: "вписать текст", x: "text", inv: "clear" }, ...NUM_ACTS(), { id: "clear", label: "очистить" }, ...COMMON];
    case "calendar":
      return [{ id: "markday", label: "отметить сегодня (за себя)" }, { id: "clear", label: "убрать все отметки" }, ...COMMON];
    case "words":
      return [{ id: "clear", label: "очистить облако" }, ...COMMON];
    case "kanban":
      return [{ id: "addcard", label: "добавить карточку", x: "text" }, { id: "clear", label: "убрать готовые карточки" }, ...COMMON];
    case "stats":
      return [
        { id: "add", label: "прибавить к шкале", n: { label: "Сколько", def: 1 }, x: "player", inv: "sub" },
        { id: "sub", label: "отнять от шкалы", n: { label: "Сколько", def: 1 }, x: "player", inv: "add" },
        { id: "set", label: "установить шкалу", n: { label: "Значение", def: 0 }, x: "player" },
        { id: "addsrc", label: "прибавить число источника", x: "player", inv: "subsrc" },
        { id: "subsrc", label: "отнять число источника", x: "player", inv: "addsrc" },
        { id: "reset", label: "восстановить шкалы до максимума" },
        ...COMMON,
      ];
    case "loot":
      return [{ id: "open", label: "открыть (разыграть добычу)" }, ...COMMON];
    case "estimate":
      return [{ id: "reveal", label: "открыть карты", inv: "conceal" }, { id: "conceal", label: "закрыть карты", inv: "reveal" }, { id: "round", label: "начать новый раунд" }, ...COMMON];
    case "gate":
    case "calc":
    case "chart":
    case "curve":
      return [];
    case "path":
    case "comment":
      return [];
  }
  return COMMON;
}

/** Цели, которые сами считают входы: им правило не нужно. */
export const AUTO_INPUT = new Set<NodeType>(["gate", "calc", "chart", "curve"]);
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
    const pref = tgt === "stopwatch" || tgt === "flipcard" || tgt === "spoiler" ? "toggle" : ["add", "roll", "spin", "flip", "draw", "pick", "open", "reveal", "start", "toggle", "next", "mark", "press"].find(has) ?? "fx";
    return { on: "press", do: pref, n: pref === "add" ? (tgt === "progress" ? 10 : 1) : undefined, x: pref === "fx" ? "confetti" : undefined };
  }
  if ((src === "dice" || src === "random") && (tgt === "counter" || tgt === "score")) return { on: src === "dice" ? "roll" : "pick", do: "addsrc" };
  if (src === "coin" || src === "deck" || src === "random" || src === "buzzer" || src === "turns" || src === "words" || src === "loot") {
    const on = src === "coin" ? "flip" : src === "deck" ? "draw" : src === "random" ? "pick" : src === "buzzer" ? "first" : src === "turns" ? "next" : src === "loot" ? "drop" : "add";
    const pref = ["add", "roll", "spin", "flip", "draw", "pick", "open", "next", "mark", "toggle", "on"].find(has);
    if (pref) return { on, do: pref, n: pref === "add" ? (tgt === "progress" ? 10 : 1) : undefined };
    return { on, do: "fx", x: src === "buzzer" ? "ding" : "confetti", rev: false };
  }
  if (src === "stopwatch" && tgt === "timer") return { on: "start", do: "start" };
  if (src === "wheel") return { on: "result", do: has("add") ? "add" : "fx", n: has("add") ? 1 : undefined, x: has("add") ? undefined : "confetti" };
  if (src === "timer") {
    const pref = ["check", "on", "reveal"].find(has);
    return { on: "end", do: pref ?? "fx", x: pref ? undefined : "ding" };
  }
  if (src === "estimate") return has("share") ? { on: "change", do: "share" } : { on: "reveal", do: has("check") ? "check" : has("on") ? "on" : "fx", x: has("check") || has("on") ? undefined : "confetti", rev: has("check") || has("on") ? undefined : false };
  if (src === "stats" && tgt !== "progress" && tgt !== "slider") return { on: "zero", do: has("check") ? "check" : has("on") ? "on" : "fx", x: has("check") || has("on") ? undefined : "stars", rev: has("check") || has("on") ? undefined : false };
  if (src === "kanban" && !has("share") && !has("count")) return { on: "complete", do: "fx", x: "confetti", rev: false };
  if (src === "roadmap" && !has("share")) return { on: "complete", do: "fx", x: "fanfare", rev: false };
  if (has("share")) return { on: "change", do: "share", n: src === "counter" || src === "calc" || src === "dice" ? 10 : undefined };
  if (has("count")) return { on: "change", do: "count" };
  if ((src === "switch" || src === "gate") && has("mirror")) return { on: "change", do: "mirror" };
  if (has("all")) return { on: "change", do: "all" };
  if (src === "progress") return { on: "full", do: "fx", x: "confetti", rev: false };
  if (src === "tracker" || src === "checklist" || src === "note" || src === "text") return { on: "complete", do: "fx", x: "confetti", rev: false };
  if (src === "flipcard" || src === "spoiler") return { on: "on", do: has("on") ? "on" : has("show") ? "show" : acts[0]!.id, rev: true };
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
  reset: "🔄",
  check: "✓",
  uncheck: "⬜",
  on: "вкл",
  off: "выкл",
  toggle: "⇄",
  next: "→",
  setst: "→",
  press: "👆",
  mark: "✓",
  unmark: "↩️",
  clear: "🧹",
  addsrc: "+n",
  subsrc: "−n",
  lap: "⏱",
  flip: "🪙",
  draw: "🃏",
  shuffle: "🔀",
  pick: "🎰",
  prev: "←",
  restart: "⏮",
  markall: "✓✓",
  settext: "✎",
  markday: "📅",
  addcard: "+🗂",
  open: "🎁",
  reveal: "🃏",
  conceal: "🂠",
  round: "🔁",
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
    case "stopwatch":
      k = p.laps?.length ?? 0;
      x = swRunning(p) || (p.acc ?? 0) > 0 ? "run" : "zero";
      break;
    case "coin":
      k = p.coin?.s ?? 0;
      x = String(p.coin?.v ?? "");
      break;
    case "deck":
      k = p.top?.s ?? 0;
      x = String(p.shf ?? 0);
      break;
    case "random":
      k = p.rnd?.s ?? 0;
      x = p.rnd?.v ?? "";
      break;
    case "score":
      x = scoreSig(p);
      break;
    case "turns":
      k = Math.max(1, p.rn ?? 1);
      x = String(p.cur ?? 0);
      break;
    case "buzzer":
      k = buzzesOf(p).length;
      break;
    case "input":
      x = p.iv ?? "";
      break;
    case "calendar":
      k = Object.entries(p as Record<string, unknown>).filter(([key, val]) => val && isDayKey(key)).length;
      break;
    case "words":
      k = wordsCount(p);
      break;
    case "kanban":
      k = kanbanDone(p)[1];
      x = kanbanSig(p);
      break;
    case "stats":
      x = statsSig(p);
      break;
    case "loot":
      k = p.drop?.s ?? 0;
      x = lootDrop(p)
        .map((it) => it.t)
        .join("\u0001");
      break;
    case "estimate":
      k = pokerVotes(p).length;
      x = pokerSig(p);
      break;
  }
  const on =
    v.type === "switch" || v.type === "gate" || v.type === "flipcard" || v.type === "spoiler" || v.type === "estimate"
      ? !!p.on
      : v.type === "task"
        ? !!p.done
        : v.type === "stopwatch"
          ? swRunning(p)
          : v.type === "kanban"
            ? k > 0 && (sh ?? 0) >= 0.9999
            : (sh ?? 0) >= 0.9999;
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
    case "stopwatch":
      if (o.on !== c.on) ev.add(c.on ? "start" : "stop");
      if (c.k > o.k) ev.add("lap");
      if (o.x === "run" && c.x === "zero") ev.add("reset");
      break;
    case "coin":
      if (c.k !== o.k && c.k > 0) {
        ev.add("flip");
        if (c.x === "0") ev.add("side0");
        if (c.x === "1") ev.add("side1");
      }
      break;
    case "flipcard":
    case "spoiler":
      if (o.on !== c.on) ev.add(c.on ? "on" : "off").add("change");
      break;
    case "deck":
      if (c.k !== o.k && c.k > 0) ev.add("draw");
      if (num(o.n) > 0 && num(c.n) === 0) ev.add("empty");
      if (num(o.n) === 0 && num(c.n) > 0) ev.add("refill");
      if (c.x !== o.x) ev.add("shuffle");
      break;
    case "random":
      if (c.k !== o.k && c.k > 0) {
        ev.add("pick");
        if (!Number.isNaN(N) && c.n !== null && c.n >= N) ev.add("pickhi");
      }
      break;
    case "score":
      if (c.x !== o.x) ev.add("change");
      if (!Number.isNaN(N)) {
        if (num(o.n) < N && num(c.n) >= N) ev.add("reach");
        if (num(o.n) >= N && num(c.n) < N) ev.add("unreach");
      }
      break;
    case "turns":
      if (c.x !== o.x || c.k !== o.k) ev.add("next");
      if (c.k > o.k) ev.add("round");
      break;
    case "buzzer":
      if (c.k > o.k) ev.add("press");
      if (o.k === 0 && c.k > 0) ev.add("first");
      if (o.k > 0 && c.k === 0) ev.add("cleared");
      break;
    case "checklist":
      if (num(c.n) > num(o.n)) ev.add("mark");
      if (num(c.n) < num(o.n)) ev.add("unmark");
      if (o.on !== c.on) ev.add(c.on ? "complete" : "uncomplete");
      if (num(c.n) !== num(o.n) || o.sh !== c.sh) ev.add("change");
      break;
    case "input":
      if (c.x !== o.x) {
        ev.add("change");
        if (!o.x.trim() && c.x.trim()) ev.add("filled");
        if (o.x.trim() && !c.x.trim()) ev.add("emptied");
        if (!Number.isNaN(N)) {
          if (num(o.n) < N && num(c.n) >= N) ev.add("reach");
          if (num(o.n) >= N && num(c.n) < N) ev.add("unreach");
        }
      }
      break;
    case "calendar":
      if (c.k > o.k) ev.add("mark");
      if (c.k < o.k) ev.add("unmark");
      if (c.k !== o.k) ev.add("change");
      break;
    case "words":
      if (c.k > o.k) ev.add("add");
      if (c.k !== o.k) ev.add("change");
      break;
    case "kanban":
      if (num(c.n) > num(o.n)) ev.add("done");
      if (num(c.n) < num(o.n)) ev.add("undone");
      if (o.on !== c.on) ev.add(c.on ? "complete" : "uncomplete");
      if (c.k > o.k) ev.add("add");
      if (c.x !== o.x) ev.add("change");
      break;
    case "roadmap":
      if (num(o.n) !== num(c.n)) {
        ev.add("change");
        if (!Number.isNaN(N)) {
          if (num(o.n) < N && num(c.n) >= N) ev.add("reach");
          if (num(o.n) >= N && num(c.n) < N) ev.add("unreach");
        }
      }
      if (o.on !== c.on) ev.add(c.on ? "complete" : "uncomplete");
      break;
    case "stats": {
      const a = sigVal(o.x, r.tx);
      const z = sigVal(c.x, r.tx);
      if (a === z) break;
      ev.add("change").add(z > a ? "inc" : "dec");
      if (a > 0 && z <= 0) ev.add("zero");
      if (a <= 0 && z > 0) ev.add("unzero");
      if (!Number.isNaN(N)) {
        if (a < N && z >= N) ev.add("reach");
        if (a >= N && z < N) ev.add("unreach");
      }
      break;
    }
    case "loot":
      if (c.k !== o.k && c.k > 0) {
        ev.add("drop");
        if (r.tx && c.x.split("\u0001").includes(r.tx)) ev.add("dropx");
      }
      break;
    case "estimate":
      if (!o.on && c.on) {
        ev.add("reveal");
        if (c.x.endsWith("|=")) ev.add("consensus");
      }
      if (o.on && !c.on) ev.add("conceal");
      if (c.x !== o.x && c.k > 0 && c.k >= o.k) ev.add("vote");
      break;
    case "curve":
      if (num(o.n) !== num(c.n)) {
        ev.add("change").add(num(c.n) > num(o.n) ? "inc" : "dec");
        if (!Number.isNaN(N)) {
          if (num(o.n) < N && num(c.n) >= N) ev.add("reach");
          if (num(o.n) >= N && num(c.n) < N) ev.add("unreach");
        }
      }
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
          if (t && (t.type === "calc" || t.type === "gate" || t.type === "curve") && !touched.has(t.id)) {
            touched.add(t.id);
            if (t.type !== "gate") next.push(t.id);
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
    /** Свойства цели с учётом уже назначенных в этой пачке правок. */
    const merged = () => ({ ...t.props, ...(patches.get(t.id) ?? {}) }) as NodeProps;
    const mergedView = () => ({ ...t, id: t.id, type: t.type, props: merged() }) as unknown as NodeView;
    const who = () => ({ n: this.b.me.name, c: this.b.me.color });
    switch (what) {
      case "add":
      case "sub":
      case "set":
      case "addsrc":
      case "subsrc": {
        const delta = what === "add" ? n : what === "sub" ? -n : what === "addsrc" ? (numValue(s, src) ?? 0) : what === "subsrc" ? -(numValue(s, src) ?? 0) : 0;
        const mp = merged();
        if (t.type === "counter") {
          const patch = what === "set" ? counterSetPatch(mp, n) : counterAddPatch(mp, this.b.me.id, delta);
          if (patch) this.put(patches, t.id, patch);
        } else if (t.type === "score") {
          const pl = playersOf(mp);
          const pid = pl.find((x) => x.id === r.x)?.id ?? pl[0]?.id;
          if (!pid) break;
          const val = Math.round((what === "set" ? n : scoreOf(mp, pid) + delta) * 1000) / 1000;
          this.put(patches, t.id, { [scoreKey(pid)]: val || undefined });
        } else if (t.type === "stats") {
          const pl = statsOf(mp);
          const st = pl.find((x) => x.id === r.x) ?? pl[0];
          if (!st) break;
          const val = statClamp(st, Math.round((what === "set" ? n : scoreOf(mp, st.id) + delta) * 1000) / 1000);
          this.put(patches, t.id, { [scoreKey(st.id)]: val });
        } else if (t.type === "input") {
          const val = Math.round((what === "set" ? n : (inputNumber(mp) ?? 0) + delta) * 1000) / 1000;
          this.put(patches, t.id, { iv: String(val) });
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
        if (t.type === "stopwatch") {
          if (what === "toggle") this.put(patches, t.id, swPatch(merged(), "toggle"));
          break;
        }
        const key = t.type === "task" ? "done" : "on";
        const curOn = !!this.cur(patches, t, key);
        const next = what === "check" || what === "on" ? true : what === "uncheck" || what === "off" ? false : what === "toggle" ? !curOn : isOn(s, src);
        if (t.type === "task" || t.type === "switch" || t.type === "flipcard" || t.type === "spoiler") this.put(patches, t.id, { [key]: next || undefined });
        break;
      }
      case "lap":
        if (t.type === "stopwatch") this.put(patches, t.id, swPatch(merged(), "lap"));
        break;
      case "flip":
        if (t.type === "coin") this.put(patches, t.id, coinPatch(merged(), who()));
        break;
      case "draw": {
        const patch = t.type === "deck" ? drawPatch(merged(), who()) : null;
        if (patch) this.put(patches, t.id, patch);
        break;
      }
      case "shuffle":
        if (t.type === "deck") this.put(patches, t.id, shufflePatch(merged()));
        break;
      case "pick": {
        const patch = t.type === "random" ? randomPatch(this.b, mergedView(), who()) : null;
        if (patch) this.put(patches, t.id, patch);
        break;
      }
      case "prev":
      case "restart":
        if (t.type !== "turns") break;
        this.put(patches, t.id, what === "prev" ? turnPatch(merged(), -1) : { cur: 0, rn: 1 });
        break;
      case "markall":
        if (t.type === "checklist") this.put(patches, t.id, checklistPatch(mergedView(), "all"));
        break;
      case "settext":
        if (t.type === "input") this.put(patches, t.id, { iv: (r.x ?? "").slice(0, 500) || undefined });
        break;
      case "markday":
        if (t.type === "calendar") this.put(patches, t.id, { [`${dayKey(todayIso())}:${this.b.me.id}`]: who() });
        break;
      case "roll":
        side.roll.push(t.id);
        break;
      case "spin":
        side.spin.push(t.id);
        break;
      case "start":
      case "stop":
      case "reset": {
        if (t.type === "stopwatch") {
          this.put(patches, t.id, swPatch(merged(), what as "start" | "stop" | "reset"));
          break;
        }
        if (t.type === "score" && what === "reset") {
          this.put(patches, t.id, clearPatch(merged(), isScoreKey));
          break;
        }
        if (t.type === "stats" && what === "reset") {
          this.put(patches, t.id, restorePatch(merged()));
          break;
        }
        if (t.type !== "timer") break;
        const now = Date.now();
        const running = typeof t.props.end === "number" && timerLeft(t.props, now) > 0;
        if (what === "reset") this.put(patches, t.id, timerPatch(t.props, "reset", now) as Record<string, unknown>);
        else if ((what === "start") !== running) this.put(patches, t.id, timerPatch(t.props, "toggle", now) as Record<string, unknown>);
        break;
      }
      case "next":
      case "setst": {
        if (t.type === "turns") {
          if (what === "next") this.put(patches, t.id, turnPatch(merged(), 1));
          break;
        }
        const list = statusesOf(t.props);
        const cur = num("st", 0);
        const idx = what === "next" ? (cur + 1) % list.length : Math.max(0, Math.min(list.length - 1, Number(r.x ?? 0) || 0));
        this.put(patches, t.id, { st: idx });
        break;
      }
      case "mark":
      case "unmark":
      case "clear": {
        if (t.type === "checklist") {
          this.put(patches, t.id, checklistPatch(mergedView(), what === "mark" ? "next" : what === "unmark" ? "last" : "clear"));
          break;
        }
        if (what === "clear" && (t.type === "buzzer" || t.type === "calendar" || t.type === "words")) {
          this.put(patches, t.id, clearPatch(merged(), t.type === "buzzer" ? isBuzzKey : t.type === "calendar" ? isDayKey : isWordsKey));
          break;
        }
        if (what === "clear" && t.type === "input") {
          this.put(patches, t.id, { iv: undefined });
          break;
        }
        if (what === "clear" && t.type === "kanban") {
          this.put(patches, t.id, clearDonePatch(merged()));
          break;
        }
        if (t.type !== "tracker") break;
        // учитываем уже назначенные в этой пачке отметки
        this.put(patches, t.id, markPatch(mergedView(), what === "mark" ? "next" : what === "unmark" ? "last" : "clear"));
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
      case "addcard":
        if (t.type === "kanban") this.put(patches, t.id, addCardPatch(merged(), (r.x ?? "").trim() || "Новая карточка")[1]);
        break;
      case "open": {
        const patch = t.type === "loot" ? lootPatch(merged(), who()) : null;
        if (patch) this.put(patches, t.id, patch);
        break;
      }
      case "reveal":
      case "conceal":
        if (t.type === "estimate") this.put(patches, t.id, { on: what === "reveal" || undefined });
        break;
      case "round":
        if (t.type === "estimate") this.put(patches, t.id, pokerResetPatch(merged()));
        break;
      case "color":
        if (r.x) this.put(patches, t.id, { color: colorKey(r.x) });
        break;
      case "fx":
        this.put(patches, t.id, fxPatch(mergedView(), r.x || "confetti"));
        break;
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
      const want = counterSetPatch(t.props, count);
      if (counterValue(t.props) !== counterValue({ ...t.props, ...want } as NodeProps)) this.put(patches, id, want);
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

  /** Сигнал «время вышло» для стрелок таймера. Долгие таймеры (дни) ждут
      частями — setTimeout не умеет больше ~24 суток; «по кругу» — заново
      после каждого круга. */
  private scheduleTimer(v: NodeView) {
    clearTimeout(this.timers.get(v.id));
    this.timers.delete(v.id);
    const end = v.props.end;
    if (typeof end !== "number") return;
    const s = this.s;
    if (!outputsOf(s, v).some((a) => a.props.lg?.on === "end")) return;
    const now = Date.now();
    const at = end > now ? end : loopEnd(v.props, now);
    if (at === null) return;
    const fire = () => {
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
      if (cur.props.loop) this.scheduleTimer(cur);
    };
    const arm = () => {
      const ms = at - Date.now();
      this.timers.set(v.id, ms > DAY ? setTimeout(arm, DAY) : setTimeout(fire, Math.max(0, ms) + 60));
    };
    arm();
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

/** Варианты для «выпал вариант…»: колесо — его варианты, добыча — предметы. */
export function optionsOf(v: NodeView): string[] {
  const list = v.type === "loot" ? lootItems(v.props).map((x) => x.t) : wheelOptions(v).map((o) => o.t);
  return [...new Set(list.filter((t) => t.trim()))];
}

export { calcValue, inputsOf, marksOf, wheelOptions };
