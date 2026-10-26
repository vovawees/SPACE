/* Действия новых типов (задача, таблица, опрос, таймер, стикер, аудио) —
   одни и те же для панели над выделением и для контекстного меню. */
import Calendar from "@lucide/svelte/icons/calendar";
import CalendarX from "@lucide/svelte/icons/calendar-x";
import Check from "@lucide/svelte/icons/check";
import Columns3 from "@lucide/svelte/icons/columns-3";
import Copy from "@lucide/svelte/icons/copy";
import Download from "@lucide/svelte/icons/download";
import Rows3 from "@lucide/svelte/icons/rows-3";
import Smile from "@lucide/svelte/icons/smile";
import Table2 from "@lucide/svelte/icons/table-2";
import Timer from "@lucide/svelte/icons/timer";
import Trash from "@lucide/svelte/icons/trash";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import UserRound from "@lucide/svelte/icons/user-round";
import UserX from "@lucide/svelte/icons/user-x";
import ListChecks from "@lucide/svelte/icons/list-checks";
import Flag from "@lucide/svelte/icons/flag";
import Dices from "@lucide/svelte/icons/dices";
import Gauge from "@lucide/svelte/icons/gauge";
import Hash from "@lucide/svelte/icons/hash";
import Pencil from "@lucide/svelte/icons/pencil";
import { api } from "../../lib/api.ts";
import { toasts } from "../../lib/toast.svelte.ts";
import { copyText, download } from "../../lib/util.ts";
import { ask } from "../../ui/confirm.svelte.ts";
import type { MenuEntry } from "../../ui/menu.svelte.ts";
import type { Board } from "../board.svelte.ts";
import { fileUrl } from "../files.ts";
import { PRIORITY_LABELS, type Assignee, type NodeData, type Priority } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";
import { clearVotes, votesOf } from "./poll.ts";
import { cellOf, colsOf, insertCol, insertRow, removeCol, removeRow, rowsOf, tableCursor, tableText } from "./table.svelte.ts";
import { isoDay } from "./task.ts";
import { COUNTER_STEPS, DICE_SIDES, counterSet, counterValue, rollDice } from "./games.ts";
import { clock, timerLeft, timerPatch } from "./timer.ts";

const dot = (css: string) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="${css}"/></svg>`;

/* ------------------------------ задачи ------------------------------ */

export const PRIO_CSS: Record<Priority, string> = { high: "var(--c-red)", mid: "var(--c-orange)", low: "var(--c-blue)" };

const members = new Map<string, { at: number; list: Assignee[] }>();

/** Участники доски (для выбора исполнителя) — подгружаются заранее и кешируются. */
export async function loadMembers(b: Board): Promise<void> {
  const hit = members.get(b.id);
  if (hit && Date.now() - hit.at < 60_000) return;
  members.set(b.id, { at: Date.now(), list: hit?.list ?? [] });
  try {
    const list = await api.get<{ id: string; name: string; color: string }[]>(`/api/boards/${b.id}/members`);
    members.set(b.id, { at: Date.now(), list: list.map((m) => ({ id: m.id, name: m.name, color: m.color })) });
  } catch {
    /* без списка — только те, кто онлайн */
  }
}

/** Кого можно назначить: я, кто сейчас на доске, участники, прежние исполнители. */
export function candidates(b: Board): Assignee[] {
  const out = new Map<string, Assignee>();
  const add = (a: Assignee | null | undefined) => {
    if (a && a.id && !out.has(a.id)) out.set(a.id, { id: a.id, name: a.name, color: a.color });
  };
  add(b.me);
  for (const p of b.people) add(p.user);
  for (const m of members.get(b.id)?.list ?? []) add(m);
  for (const v of b.view.order) if (v.type === "task") add(v.props.who);
  return [...out.values()].slice(0, 30);
}

export function assigneeItems(b: Board, views: NodeView[]): MenuEntry[] {
  const set = (who: Assignee | null) => b.view.updateMany(views.map((v) => [v.id, { who: who ?? undefined }]));
  const cur = new Set(views.map((v) => v.props.who?.id ?? ""));
  const one = cur.size === 1 ? [...cur][0]! : null;
  return [
    { heading: "Исполнитель" },
    ...candidates(b).map((a) => ({
      label: a.id === b.me.id ? `${a.name} (я)` : a.name,
      glyph: dot(a.color),
      checked: one === a.id,
      run: () => set(a),
    })),
    "-",
    { label: "Не назначено", icon: UserX, checked: one === "", run: () => set(null) },
  ];
}

let dateInput: HTMLInputElement | null = null;

/** Системный выбор даты у точки экрана. */
export function pickDate(cur: string | null | undefined, at: { x: number; y: number }, done: (iso: string | null) => void) {
  dateInput?.remove();
  const el = (dateInput = document.createElement("input"));
  el.type = "date";
  el.value = cur ?? "";
  el.tabIndex = -1;
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, { position: "fixed", left: `${at.x}px`, top: `${at.y}px`, width: "1px", height: "1px", opacity: "0", border: "0", padding: "0", pointerEvents: "none" });
  document.body.append(el);
  el.addEventListener("change", () => {
    done(el.value || null);
    el.remove();
  });
  try {
    el.showPicker();
  } catch {
    el.focus();
  }
}

export function dueItems(b: Board, views: NodeView[], at: { x: number; y: number }): MenuEntry[] {
  const set = (due: string | null) => b.view.updateMany(views.map((v) => [v.id, { due: due ?? undefined }]));
  const cur = views.length === 1 ? views[0]!.props.due : null;
  const nextMonday = (() => {
    const d = new Date().getDay();
    return ((8 - d) % 7) || 7;
  })();
  return [
    { heading: "Срок" },
    { label: "Сегодня", checked: cur === isoDay(0), run: () => set(isoDay(0)) },
    { label: "Завтра", checked: cur === isoDay(1), run: () => set(isoDay(1)) },
    { label: "В понедельник", checked: cur === isoDay(nextMonday), run: () => set(isoDay(nextMonday)) },
    { label: "Через неделю", checked: cur === isoDay(7), run: () => set(isoDay(7)) },
    { label: "Выбрать дату…", run: () => pickDate(cur, at, (d) => d && set(d)) },
    "-",
    { label: "Без срока", icon: CalendarX, disabled: views.every((v) => !v.props.due), run: () => set(null) },
  ];
}

export function prioItems(b: Board, views: NodeView[]): MenuEntry[] {
  const set = (prio: Priority | null) => b.view.updateMany(views.map((v) => [v.id, { prio: prio ?? undefined }]));
  const cur = new Set(views.map((v) => v.props.prio ?? ""));
  const one = cur.size === 1 ? [...cur][0]! : null;
  return [
    { heading: "Приоритет" },
    ...(["high", "mid", "low"] as Priority[]).map((p) => ({ label: PRIORITY_LABELS[p], glyph: dot(PRIO_CSS[p]), checked: one === p, run: () => set(p) })),
    "-",
    { label: "Без приоритета", checked: one === "", run: () => set(null) },
  ];
}

export function toggleDone(b: Board, views: NodeView[]) {
  const all = views.every((v) => v.props.done);
  b.view.updateMany(views.filter((v) => v.type === "task").map((v) => [v.id, { done: all ? undefined : true }]));
}

export function taskItems(b: Board, v: NodeView, at: { x: number; y: number }): MenuEntry[] {
  return [
    { label: v.props.done ? "Вернуть в работу" : "Готово", icon: Check, run: () => toggleDone(b, [v]) },
    { label: "Исполнитель", icon: UserRound, items: assigneeItems(b, [v]) },
    { label: "Срок", icon: Calendar, items: dueItems(b, [v], at) },
    { label: "Приоритет", icon: Flag, items: prioItems(b, [v]) },
  ];
}

/* ------------------------------ таблицы ------------------------------ */

/** Строка и столбец под курсором правки (или последние). */
function cursorOf(b: Board, v: NodeView): { r: number; c: number; on: boolean } {
  const on = tableCursor.id === v.id && b.view.editing === v.id;
  return on ? { r: tableCursor.r, c: tableCursor.c, on } : { r: rowsOf(v).length - 1, c: colsOf(v).length - 1, on };
}

function csv(v: NodeView): string {
  const esc = (t: string) => (/[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  return rowsOf(v)
    .map((r) => colsOf(v).map((c) => esc(cellOf(v, r, c))).join(","))
    .join("\n");
}

export function tableItems(b: Board, v: NodeView): MenuEntry[] {
  const ro = b.readonly;
  const k = cursorOf(b, v);
  const nR = rowsOf(v).length;
  const nC = colsOf(v).length;
  const out: MenuEntry[] = [];
  if (!ro)
    out.push(
      {
        label: "Строки",
        icon: Rows3,
        items: [
          { label: k.on ? "Вставить строку выше" : "Добавить строку в начало", run: () => void insertRow(b, v, k.on ? k.r : 0) },
          { label: k.on ? "Вставить строку ниже" : "Добавить строку в конец", run: () => void insertRow(b, v, k.on ? k.r + 1 : nR) },
          "-",
          { label: k.on ? "Удалить эту строку" : "Удалить последнюю строку", icon: Trash, danger: true, disabled: nR <= 1, run: () => removeRow(b, v, k.r) },
        ],
      },
      {
        label: "Столбцы",
        icon: Columns3,
        items: [
          { label: k.on ? "Вставить столбец слева" : "Добавить столбец в начало", run: () => void insertCol(b, v, k.on ? k.c : 0) },
          { label: k.on ? "Вставить столбец справа" : "Добавить столбец в конец", run: () => void insertCol(b, v, k.on ? k.c + 1 : nC) },
          "-",
          { label: k.on ? "Удалить этот столбец" : "Удалить последний столбец", icon: Trash, danger: true, disabled: nC <= 1, run: () => removeCol(b, v, k.c) },
          { label: "Выровнять ширину", disabled: !v.props.cw, run: () => b.view.update(v.id, { cw: undefined }) },
        ],
      },
      { label: "Первая строка — шапка", icon: Table2, checked: v.props.head !== false, run: () => b.view.update(v.id, { head: v.props.head === false ? undefined : false }) },
    );
  out.push(
    {
      label: "Скопировать для Excel / Таблиц",
      icon: Copy,
      run: async () => (await copyText(tableText(v))) && toasts.show("Таблица скопирована — вставьте в любую таблицу", { kind: "ok" }),
    },
    { label: "Скачать CSV", icon: Download, run: () => download(new Blob(["\ufeff" + csv(v)], { type: "text/csv" }), `${v.props.title || "table"}.csv`) },
  );
  return out;
}

/* ------------------------------ опросы ------------------------------ */

export function pollItems(b: Board, v: NodeView): MenuEntry[] {
  if (b.readonly) return [];
  const n = votesOf(v).size;
  return [
    { label: "Несколько ответов", icon: ListChecks, checked: !!v.props.multi, run: () => b.view.update(v.id, { multi: v.props.multi ? undefined : true }) },
    { label: "Сбросить голоса", icon: RotateCcw, disabled: !n, run: () => void resetVotes(b, v) },
  ];
}

export async function resetVotes(b: Board, v: NodeView) {
  if (!votesOf(v).size) return;
  if (await ask({ title: "Сбросить все голоса?", text: "Голоса всех участников пропадут — опрос начнётся заново.", ok: "Сбросить", danger: true })) clearVotes(b, v);
}

/* ------------------------------ таймер ------------------------------ */

export const TIMER_PRESETS = [1, 3, 5, 10, 15, 25, 45, 60];

export function timerItems(b: Board, views: NodeView[]): MenuEntry[] {
  const cur = views.length === 1 ? (views[0]!.props.dur ?? 300_000) : 0;
  const set = (min: number) =>
    b.view.updateMany(views.filter((v) => v.type === "timer").map((v) => [v.id, timerPatch(v.props, "set", Date.now(), min * 60_000) as Partial<NodeData>]));
  return [{ heading: "Длительность" }, ...TIMER_PRESETS.map((m) => ({ label: `${m} мин`, icon: m === 5 ? Timer : undefined, checked: cur === m * 60_000, run: () => set(m) }))];
}

export const timerShort = (v: NodeView) => clock(Math.max(1000, v.props.dur ?? 300_000)).replace(/^0(\d):00$/, "$1 мин").replace(/^(\d\d):00$/, "$1 мин");
export const timerRunning = (v: NodeView) => typeof v.props.end === "number" && timerLeft(v.props) > 0;

/* ------------------------------ прочее ------------------------------ */

export const stickerIcon = Smile;

export function audioItems(v: NodeView): MenuEntry[] {
  const p = v.props;
  return p.src ? [{ label: "Скачать", icon: Download, run: () => download(fileUrl(p.src, { dl: true, name: p.name }), p.name || "audio") }] : [];
}

/* ------------------------------ счётчик ------------------------------ */

export function counterItems(b: Board, views: NodeView[], rename?: () => void): MenuEntry[] {
  const cs = views.filter((v) => v.type === "counter");
  if (!cs.length || b.readonly) return [];
  const step = cs.length === 1 ? (cs[0]!.props.step ?? 1) : null;
  const out: MenuEntry[] = [
    {
      label: "Шаг",
      icon: Hash,
      items: COUNTER_STEPS.map((n) => ({
        label: n === 0.5 ? "0,5" : String(n),
        checked: step === n,
        run: () => b.view.updateMany(cs.map((v) => [v.id, { step: n === 1 ? undefined : n }])),
      })),
    },
    { label: "Сбросить на 0", icon: RotateCcw, disabled: cs.every((v) => counterValue(v.props) === 0), run: () => counterSet(b, cs.map((v) => v.id), 0) },
  ];
  if (rename && cs.length === 1) out.push({ label: "Переименовать", icon: Pencil, keys: "Enter", run: rename });
  return out;
}

/* ------------------------------- кубики ------------------------------- */

export function diceItems(b: Board, views: NodeView[]): MenuEntry[] {
  const ds = views.filter((v) => v.type === "dice");
  if (!ds.length || b.readonly) return [];
  const one = ds.length === 1 ? ds[0]!.props : null;
  const set = (patch: Partial<NodeData>) => b.view.updateMany(ds.map((v) => [v.id, { ...patch, roll: null }]));
  return [
    { label: "Бросить", icon: Dices, keys: "Enter", run: () => rollDice(b, ds.map((v) => v.id)) },
    { label: "Граней", items: DICE_SIDES.map((n) => ({ label: `d${n}`, checked: one?.sides === n || (!one?.sides && n === 6 && !!one), run: () => set({ sides: n }) })) },
    { label: "Сколько кубиков", items: [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), checked: (one?.count ?? 1) === n && !!one, run: () => set({ count: n }) })) },
  ];
}

/* ------------------------------ прогресс ------------------------------ */

export function progressItems(b: Board, views: NodeView[], rename?: () => void): MenuEntry[] {
  const ps = views.filter((v) => v.type === "progress");
  if (!ps.length || b.readonly) return [];
  const one = ps.length === 1 ? ps[0]!.props : null;
  const set = (patch: Partial<NodeData>) => b.view.updateMany(ps.map((v) => [v.id, patch]));
  const out: MenuEntry[] = [
    { label: "Значение", icon: Gauge, items: [0, 25, 50, 75, 100].map((n) => ({ label: n === 100 ? "100 % — готово" : `${n} %`, checked: one?.pv === n, run: () => set({ pv: n }) })) },
    {
      label: "Этапы",
      items: [0, 3, 4, 5, 10].map((n) => ({ label: n ? `${n} этапов`.replace("3 этапов", "3 этапа").replace("4 этапов", "4 этапа") : "Без этапов", checked: (one?.steps ?? 0) === n && !!one, run: () => set({ steps: n || undefined }) })),
    },
  ];
  if (rename && ps.length === 1) out.push({ label: "Переименовать", icon: Pencil, keys: "Enter", run: rename });
  return out;
}
