/* Меню новых объектов — одни и те же для «⋯», правой кнопки и панели
   над выделением. */
import Pencil from "@lucide/svelte/icons/pencil";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Play from "@lucide/svelte/icons/play";
import ListChecks from "@lucide/svelte/icons/list-checks";
import Link2 from "@lucide/svelte/icons/link-2";
import Copy from "@lucide/svelte/icons/copy";
import Download from "@lucide/svelte/icons/download";
import Users from "@lucide/svelte/icons/users";
import Smile from "@lucide/svelte/icons/smile";
import { toasts } from "../../lib/toast.svelte.ts";
import { copyText, download } from "../../lib/util.ts";
import { ask, promptText } from "../../ui/confirm.svelte.ts";
import type { MenuEntry } from "../../ui/menu.svelte.ts";
import type { Board } from "../board.svelte.ts";
import { CALC_LABELS, GATE_LABELS, colorCss, type CalcOp, type GateMode, type NodeData, type NodeType } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";
import { candidates, loadMembers } from "./actions.ts";
import { DEFAULT_STATUSES, statusesOf } from "./values.ts";
import { TIMEZONES, clearRatings, markPatch, pressButton, setStatus, setSwitch, spinWheel, wheelOptions } from "./widgets.ts";
import {
  RANDOM_MODES,
  buzzesOf,
  checklistPatch,
  clearDays,
  clearWords,
  deckDraw,
  deckShuffle,
  flipCard,
  flipCoin,
  genRandom,
  nextTurn,
  resetBuzz,
  resetScores,
  resetTurns,
  revealAll,
  swPatch,
  swRunning,
} from "./play.ts";
import Coins from "@lucide/svelte/icons/coins";
import Dices from "@lucide/svelte/icons/dices";
import Flag from "@lucide/svelte/icons/flag";
import Pause from "@lucide/svelte/icons/pause";
import Rotate3d from "@lucide/svelte/icons/rotate-3d";
import Shuffle from "@lucide/svelte/icons/shuffle";
import SkipBack from "@lucide/svelte/icons/skip-back";
import SkipForward from "@lucide/svelte/icons/skip-forward";
import Spade from "@lucide/svelte/icons/spade";
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import Eraser from "@lucide/svelte/icons/eraser";
import Gift from "@lucide/svelte/icons/gift";
import {
  PERIOD_UNITS,
  POKER_KINDS,
  clearDone,
  clearMapPatch,
  islandPatch,
  kanbanDone,
  mapSize,
  paletteText,
  pokerReset,
  pokerReveal,
  pokerVotes,
  rollLoot,
  statsOf,
} from "./design.ts";

type Entry = MenuEntry;
const dot = (css: string) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="${css}"/></svg>`;
const num = (raw: string | null): number | null => {
  if (raw === null) return null;
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() && Number.isFinite(n) ? n : null;
};

const BUTTON_EMOJI = ["⚡", "👍", "➕", "🎲", "🎉", "🔔", "🚀", "⭐", "❤️", "🔥", "✅", "▶️", "🎯", "🏆", "💡", "🧨"];

/** Главное действие объекта — для панели над выделением. */
export function primaryAction(b: Board, views: NodeView[]): { label: string; run: () => void } | null {
  const t = views[0]?.type;
  if (!t || views.some((v) => v.type !== t)) return null;
  const ids = views.map((v) => v.id);
  switch (t) {
    case "button":
      return views.length === 1 ? { label: "Нажать", run: () => pressButton(b, views[0]!) } : null;
    case "switch": {
      const on = views.every((v) => v.props.on);
      return { label: on ? "Выключить" : "Включить", run: () => setSwitch(b, ids, !on) };
    }
    case "wheel":
      return { label: "Крутить", run: () => spinWheel(b, ids) };
    case "status":
      return { label: "Следующий", run: () => setStatus(b, ids, "next") };
    case "stopwatch": {
      const run = views.some((v) => swRunning(v.props));
      return { label: run ? "Стоп" : "Старт", run: () => b.view.updateMany(views.map((v) => [v.id, swPatch(v.props, run ? "stop" : "start") as Partial<NodeData>])) };
    }
    case "coin":
      return { label: "Подбросить", run: () => flipCoin(b, ids) };
    case "flipcard":
      return views.some((v) => v.props.self) ? null : { label: "Перевернуть", run: () => flipCard(b, ids) };
    case "deck":
      return { label: "Тянуть карту", run: () => void (deckDraw(b, ids) || toasts.show("Колода пуста — перемешайте")) };
    case "random":
      return { label: "Выбрать", run: () => void genRandom(b, ids) };
    case "turns":
      return { label: "Следующий ход", run: () => nextTurn(b, ids, 1) };
    case "buzzer":
      return views.some((v) => buzzesOf(v.props).length) ? { label: "Сбросить", run: () => resetBuzz(b, ids) } : null;
    case "spoiler": {
      if (views.some((v) => v.props.sm === "self")) return null;
      const on = views.every((v) => v.props.on);
      return { label: on ? "Спрятать" : "Открыть", run: () => revealAll(b, ids, !on) };
    }
    case "loot":
      return { label: "Открыть", run: () => void rollLoot(b, ids) };
    case "estimate": {
      const on = views.every((v) => v.props.on);
      if (on) return { label: "Новый раунд", run: () => pokerReset(b, ids) };
      return views.some((v) => pokerVotes(v.props).length) ? { label: "Открыть карты", run: () => pokerReveal(b, ids, true) } : null;
    }
  }
  return null;
}

export function widgetItems(b: Board, views: NodeView[]): Entry[] {
  if (!views.length) return [];
  const t: NodeType = views[0]!.type;
  if (views.some((v) => v.type !== t)) return [];
  const ro = b.readonly;
  const one = views.length === 1 ? views[0]! : null;
  const p = one?.props;
  const ids = views.map((v) => v.id);
  const set = (patch: Partial<NodeData>) => b.view.updateMany(ids.map((id) => [id, patch]));
  const rename: Entry | false = !!one && !ro && { label: "Переименовать", icon: Pencil, keys: "Enter", run: () => (b.ix.renaming = one.id) };
  const out: (Entry | false | null | undefined)[] = [];
  if (ro) {
    if (t === "qr" && p?.url) out.push({ label: "Скопировать содержимое", icon: Copy, run: async () => (await copyText(p.url!)) && toasts.show("Скопировано", { kind: "ok" }) });
    return out.filter(Boolean) as Entry[];
  }

  switch (t) {
    case "button":
      if (one) out.push({ label: "Нажать", icon: Play, run: () => pressButton(b, one) });
      out.push({ label: "Вид", items: (["solid", "soft", "outline"] as const).map((x) => ({ label: { solid: "Заливка", soft: "Мягкий", outline: "Контур" }[x], checked: (p?.bv ?? "solid") === x, run: () => set({ bv: x === "solid" ? undefined : x }) })) });
      out.push({
        label: "Значок",
        icon: Smile,
        items: [{ label: "Значок", custom: "emoji", emojis: BUTTON_EMOJI, current: p?.emoji, pick: (e: string) => set({ emoji: e }) }, "-", { label: "Без значка", run: () => set({ emoji: undefined }) }],
      });
      out.push({
        label: p?.href ? "Ссылка: изменить…" : "Ведёт на адрес…",
        icon: Link2,
        run: async () => {
          const v = await promptText({ title: "Куда ведёт кнопка", text: "Адрес сайта (https://…) — откроется в новой вкладке. Пусто — без перехода.", ok: "Готово", input: { type: "url", value: p?.href ?? "", placeholder: "https://…" } });
          if (v === null) return;
          const href = v.trim();
          if (href && !/^https?:\/\//i.test(href) && !href.startsWith("#")) return toasts.show("Нужен адрес вида https://…");
          set({ href: href || undefined });
        },
      });
      if (p?.press?.s) out.push({ label: "Сбросить счёт нажатий", icon: RotateCcw, run: () => set({ press: null }) });
      out.push(rename);
      break;

    case "switch":
      out.push({ label: views.every((v) => v.props.on) ? "Выключить" : "Включить", run: () => setSwitch(b, ids, "toggle") });
      out.push(rename);
      break;

    case "slider": {
      out.push({
        label: "Пределы…",
        run: async () => {
          const v = await promptText({ title: "Пределы ползунка", text: "Два числа через тире, например 0–100 или −10–10.", ok: "Готово", input: { value: `${p?.min ?? 0}–${p?.max ?? 100}` } });
          const m = v?.match(/^\s*(-?[\d.,]+)\s*[–—-]\s*(-?[\d.,]+)\s*$/);
          if (!m) return v === null ? undefined : toasts.show("Не похоже на два числа");
          const lo = num(m[1]!);
          const hi = num(m[2]!);
          if (lo === null || hi === null || hi <= lo) return toasts.show("Верхний предел должен быть больше нижнего");
          set({ min: lo || undefined, max: hi, sv: Math.max(lo, Math.min(hi, p?.sv ?? lo)) } as Partial<NodeData>);
        },
      });
      out.push({ label: "Шаг", items: [0.1, 0.5, 1, 5, 10, 25].map((n) => ({ label: String(n).replace(".", ","), checked: (p?.step ?? 1) === n && !!one, run: () => set({ step: n === 1 ? undefined : n }) })) });
      out.push({
        label: "Единица…",
        run: async () => {
          const v = await promptText({ title: "Единица измерения", text: "Например: %, ₽, кг, баллов. Пусто — без единицы.", ok: "Готово", input: { value: p?.unit ?? "" } });
          if (v !== null) set({ unit: v.trim().slice(0, 12) || undefined });
        },
      });
      out.push(rename);
      break;
    }

    case "rating":
      out.push({
        label: "Значок",
        items: (
          [
            ["star", "★ Звёзды"],
            ["heart", "♥ Сердечки"],
            ["fire", "🔥 Огоньки"],
            ["like", "👍 Лайки"],
          ] as const
        ).map(([x, l]) => ({ label: l, checked: (p?.ri ?? "star") === x && !!one, run: () => set({ ri: x === "star" ? undefined : x }) })),
      });
      out.push({ label: "Сколько", items: [3, 5, 7, 10].map((n) => ({ label: String(n), checked: (p?.max ?? 5) === n && !!one, run: () => set({ max: n }) })) });
      out.push({
        label: "Сбросить оценки",
        icon: RotateCcw,
        danger: true,
        run: async () => {
          if (await ask({ title: "Сбросить все оценки?", text: "Оценки всех участников пропадут.", ok: "Сбросить", danger: true })) for (const v of views) clearRatings(b, v);
        },
      });
      out.push(rename);
      break;

    case "clock":
      out.push({ label: "Город", items: TIMEZONES.map(([z, l]) => ({ label: l, checked: (p?.tz ?? "") === z && !!one, run: () => set({ tz: z || undefined }) })) });
      out.push({
        label: "Вид",
        items: [
          { label: "Цифры", checked: (p?.cv ?? "digital") === "digital" && !!one, run: () => set({ cv: undefined }) },
          { label: "Стрелки", checked: p?.cv === "analog", run: () => set({ cv: "analog" }) },
        ],
      });
      out.push({ label: "Секунды", checked: !!p?.sec, run: () => set({ sec: p?.sec ? undefined : true }) });
      out.push(rename);
      break;

    case "countdown": {
      const at = (ms: number) => () => set({ at: ms });
      const now = new Date();
      const ny = new Date(now.getFullYear() + 1, 0, 1).getTime();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9).getTime();
      out.push({
        label: "Когда",
        items: [
          { label: "Через 10 минут", run: at(Date.now() + 10 * 60_000) },
          { label: "Через час", run: at(Date.now() + 3_600_000) },
          { label: "Завтра в 9:00", run: at(tomorrow) },
          { label: "Через неделю", run: at(Date.now() + 7 * 86_400_000) },
          { label: "Новый год", run: at(ny) },
          "-",
          { label: "Без даты", run: () => set({ at: null }) },
        ],
      });
      out.push(rename);
      break;
    }

    case "chart":
      out.push({
        label: "Вид",
        items: (
          [
            ["bar", "Столбцы"],
            ["line", "Линия"],
            ["pie", "Круг"],
            ["donut", "Кольцо"],
          ] as const
        ).map(([x, l]) => ({ label: l, checked: (p?.ct ?? "bar") === x && !!one, run: () => set({ ct: x }) })),
      });
      if (one) out.push({ label: "Изменить значения", icon: Pencil, keys: "Enter", run: () => b.ix.edit(one.id, "end") });
      if (one && p?.data?.length) out.push({ label: "Убрать свои значения", icon: RotateCcw, run: () => set({ data: undefined }) });
      break;

    case "qr":
      if (one) out.push({ label: "Изменить содержимое", icon: Pencil, keys: "Enter", run: () => b.ix.edit(one.id, "end") });
      if (one) out.push({ label: "Ссылка на эту доску", icon: Link2, run: () => set({ url: location.origin + location.pathname }) });
      if (p?.url) {
        out.push({ label: "Скопировать содержимое", icon: Copy, run: async () => (await copyText(p.url!)) && toasts.show("Скопировано", { kind: "ok" }) });
        out.push({
          label: "Скачать картинкой",
          icon: Download,
          run: () => {
            const svg = document.querySelector<SVGSVGElement>(`[data-id="${one!.id}"] .qr-svg`);
            if (svg) download(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }), `${(p.title || "qr").replace(/[^\p{L}\d]+/gu, "-")}.svg`);
          },
        });
      }
      out.push({ label: "Подпись…", icon: Pencil, run: () => askTitle(b, views, "Подпись под кодом") });
      break;

    case "wheel":
      out.push({ label: "Крутить", icon: Play, run: () => spinWheel(b, ids) });
      if (one) out.push({ label: "Изменить варианты", icon: ListChecks, keys: "Enter", run: () => b.ix.edit(one.id, "end") });
      if (one)
        out.push({
          label: "Варианты — участники доски",
          icon: Users,
          run: async () => {
            await loadMembers(b);
            const names = candidates(b).map((a) => a.name);
            if (names.length < 2) return toasts.show("Пока на доске меньше двух участников");
            set({ opts: names.slice(0, 24).map((n, i) => ({ id: `p${i}`, t: n })), spin: null });
          },
        });
      if (one && p?.spin) out.push({ label: "Сбросить результат", icon: RotateCcw, run: () => set({ spin: null }) });
      out.push({ label: "Название…", icon: Pencil, run: () => askTitle(b, views, "Название колеса") });
      void wheelOptions;
      break;

    case "status": {
      const sts = one ? statusesOf(one.props) : DEFAULT_STATUSES;
      out.push({ heading: "Статус" });
      sts.forEach((x, i) => out.push({ label: x.t || `Статус ${i + 1}`, iconSvg: dot(colorCss(x.c)), checked: !!one && (one.props.st ?? 0) === i, run: () => setStatus(b, ids, i) }));
      out.push("-");
      if (one) out.push({ label: "Изменить варианты", icon: ListChecks, keys: "Enter", run: () => b.ix.edit(one.id, "end") });
      out.push({ label: one?.props.title ? "Переименовать" : "Добавить заголовок", icon: Pencil, run: () => askTitle(b, views, "Заголовок статуса") });
      break;
    }

    case "tracker":
      out.push({ label: "Клеток", items: [3, 5, 7, 10, 14, 21, 30].map((n) => ({ label: n === 7 ? "7 — дни недели" : String(n), checked: (p?.cells ?? 7) === n && !!one, run: () => set({ cells: n }) })) });
      out.push({ label: "Очистить отметки", icon: RotateCcw, run: () => b.view.updateMany(views.map((v) => [v.id, markPatch(v, "clear") as Partial<NodeData>])) });
      out.push(rename);
      break;

    case "calc":
      out.push({ label: "Действие", items: (Object.keys(CALC_LABELS) as CalcOp[]).map((op) => ({ label: CALC_LABELS[op], checked: (p?.op ?? "sum") === op && !!one, run: () => set({ op }) })) });
      out.push({ label: "Знаков после запятой", items: [-1, 0, 1, 2].map((n) => ({ label: n < 0 ? "Как получится" : String(n), checked: !!one && (p?.dec ?? -1) === n, run: () => set({ dec: n < 0 ? undefined : n }) })) });
      out.push({
        label: "Единица…",
        run: async () => {
          const v = await promptText({ title: "Единица измерения", text: "Например: ₽, ч, очков. Пусто — без единицы.", ok: "Готово", input: { value: p?.unit ?? "" } });
          if (v !== null) set({ unit: v.trim().slice(0, 12) || undefined });
        },
      });
      out.push(rename);
      break;

    case "stopwatch": {
      const run = views.some((v) => swRunning(v.props));
      const sw = (kind: "start" | "stop" | "reset" | "lap") => b.view.updateMany(views.map((v) => [v.id, swPatch(v.props, kind) as Partial<NodeData>]));
      out.push({ label: run ? "Остановить" : "Запустить", icon: run ? Pause : Play, run: () => sw(run ? "stop" : "start") });
      if (run) out.push({ label: "Отметить круг", icon: Flag, run: () => sw("lap") });
      out.push({ label: "Сбросить", icon: RotateCcw, run: () => sw("reset") });
      out.push({ label: "Показывать сотые", checked: !!one && !!p?.ms, run: () => set({ ms: !p?.ms || undefined }) });
      out.push(rename);
      break;
    }

    case "coin":
      out.push({ label: "Подбросить", icon: Coins, run: () => flipCoin(b, ids) });
      out.push({ label: "Сбросить счёт", icon: RotateCcw, run: () => set({ ch: undefined, coin: null }) });
      out.push(rename);
      break;

    case "flipcard":
      out.push({ label: "Перевернуть", icon: Rotate3d, disabled: views.some((v) => v.props.self), run: () => flipCard(b, ids) });
      out.push({ label: "У каждого своя", checked: !!one && !!p?.self, run: () => set({ self: !p?.self || undefined, on: undefined }) });
      break;

    case "spoiler": {
      const on = views.every((v) => v.props.on);
      out.push({ label: on ? "Спрятать у всех" : "Открыть у всех", icon: on ? EyeOff : Eye, disabled: views.some((v) => v.props.sm === "self"), run: () => revealAll(b, ids, !on) });
      out.push({ label: "У каждого своё", checked: !!one && p?.sm === "self", run: () => set({ sm: p?.sm === "self" ? undefined : "self", on: undefined }) });
      out.push(rename);
      break;
    }

    case "deck":
      out.push({ label: "Тянуть карту", icon: Spade, run: () => void (deckDraw(b, ids) || toasts.show("Колода пуста — перемешайте")) });
      out.push({ label: "Перемешать", icon: Shuffle, run: () => deckShuffle(b, ids) });
      out.push({
        label: "Колода",
        items: ([["36", "36 карт"], ["52", "52 карты"], ["custom", "Свои карты"]] as const).map(([k, label]) => ({
          label,
          checked: !!one && (p?.dk ?? "36") === k,
          run: () => {
            set({ dk: k === "36" ? undefined : k, pile: undefined, top: null, out: undefined });
            if (k === "custom") b.inspect("props");
          },
        })),
      });
      out.push(rename);
      break;

    case "random":
      out.push({ label: "Выбрать", icon: Dices, run: () => void genRandom(b, ids) });
      out.push({ label: "Режим", items: RANDOM_MODES.map(([k, label]) => ({ label, checked: !!one && (p?.rm ?? "num") === k, run: () => set({ rm: k === "num" ? undefined : k, used: undefined, rnd: null }) })) });
      out.push({ label: "Без повторов", checked: !!one && !!p?.uniq, run: () => set({ uniq: !p?.uniq || undefined, used: undefined }) });
      if (views.some((v) => v.props.used?.length)) out.push({ label: "Начать заново", icon: RotateCcw, run: () => set({ used: undefined, rnd: null }) });
      out.push(rename);
      break;

    case "score":
      out.push({
        label: "Обнулить счёт",
        icon: RotateCcw,
        run: async () => {
          if (await ask({ title: "Обнулить счёт?", text: "Очки всех игроков станут 0.", ok: "Обнулить", danger: true })) resetScores(b, ids);
        },
      });
      out.push(rename);
      break;

    case "turns":
      out.push({ label: "Следующий ход", icon: SkipForward, run: () => nextTurn(b, ids, 1) });
      out.push({ label: "Ход назад", icon: SkipBack, run: () => nextTurn(b, ids, -1) });
      out.push({ label: "Начать сначала", icon: RotateCcw, run: () => resetTurns(b, ids) });
      out.push(rename);
      break;

    case "buzzer":
      out.push({ label: "Сбросить нажатия", icon: RotateCcw, disabled: !views.some((v) => buzzesOf(v.props).length), run: () => resetBuzz(b, ids) });
      out.push(rename);
      break;

    case "checklist":
      out.push({ label: "Отметить все", icon: ListChecks, run: () => b.view.updateMany(views.map((v) => [v.id, checklistPatch(v, "all") as Partial<NodeData>])) });
      out.push({ label: "Снять все отметки", icon: RotateCcw, run: () => b.view.updateMany(views.map((v) => [v.id, checklistPatch(v, "clear") as Partial<NodeData>])) });
      out.push(rename);
      break;

    case "input":
      out.push({ label: "Тип", items: ([["text", "Текст"], ["num", "Число"]] as const).map(([k, label]) => ({ label, checked: !!one && (p?.it ?? "text") === k, run: () => set({ it: k }) })) });
      out.push({ label: "Очистить", icon: Eraser, run: () => set({ iv: undefined }) });
      out.push(rename);
      break;

    case "calendar":
      out.push({ label: "К текущему месяцу", run: () => set({ ym: undefined }) });
      out.push({
        label: "Убрать все отметки",
        icon: RotateCcw,
        run: async () => {
          if (await ask({ title: "Убрать отметки?", text: "Отметки всех участников во всех месяцах пропадут.", ok: "Убрать", danger: true })) clearDays(b, ids);
        },
      });
      out.push(rename);
      break;

    case "words":
      out.push({
        label: "Очистить облако",
        icon: RotateCcw,
        run: async () => {
          if (await ask({ title: "Очистить облако?", text: "Слова всех участников пропадут.", ok: "Очистить", danger: true })) clearWords(b, ids);
        },
      });
      out.push(rename);
      break;

    case "token":
      out.push({
        label: "Форма",
        items: ([["pawn", "Пешка"], ["circle", "Круг"], ["square", "Квадрат"], ["hex", "Шестигранник"], ["star", "Звезда"]] as const).map(([k, label]) => ({ label, checked: !!one && (p?.tk ?? "pawn") === k, run: () => set({ tk: k }) })),
      });
      break;

    case "kanban": {
      const done = views.reduce((a, v) => a + kanbanDone(v.props)[0], 0);
      out.push({
        label: "Убрать готовые",
        icon: RotateCcw,
        disabled: !done,
        run: async () => {
          if (await ask({ title: "Убрать готовые карточки?", text: "Карточки из последней колонки будут удалены.", ok: "Убрать", danger: true })) clearDone(b, ids);
        },
      });
      out.push(rename);
      break;
    }

    case "roadmap":
      out.push({ label: "Шкала", items: PERIOD_UNITS.map(([k, label]) => ({ label, checked: !!one && (p?.pu ?? "w") === k, run: () => set({ pu: k === "w" ? undefined : k, ps: undefined, cur: undefined }) })) });
      out.push(rename);
      break;

    case "stats":
      out.push({
        label: "Восстановить шкалы",
        icon: RotateCcw,
        run: () => b.view.updateMany(views.map((v) => [v.id, Object.fromEntries(statsOf(v.props).filter((st) => st.m).map((st) => [`sc:${st.id}`, st.m])) as Partial<NodeData>])),
      });
      out.push(rename);
      break;

    case "loot":
      out.push({ label: "Открыть", icon: Gift, run: () => void rollLoot(b, ids) });
      if (views.some((v) => v.props.drop)) out.push({ label: "Сбросить результат", icon: RotateCcw, run: () => set({ drop: null }) });
      out.push(rename);
      break;

    case "curve":
      out.push({ label: "Таблица значений", checked: !!one && !!p?.tb, run: () => set({ tb: !p?.tb || undefined }) });
      out.push({ label: "Шкала Y: логарифм", checked: !!one && p?.ys === "log", run: () => set({ ys: p?.ys === "log" ? undefined : "log" }) });
      out.push(rename);
      break;

    case "palette":
      if (one) {
        out.push({ label: "Копировать CSS-переменные", icon: Copy, run: async () => (await copyText(paletteText(one.props, "css"))) && toasts.show("CSS-переменные скопированы", { kind: "ok", ms: 1600 }) });
        out.push({ label: "Копировать HEX", icon: Copy, run: async () => (await copyText(paletteText(one.props, "hex"))) && toasts.show("Список HEX скопирован", { kind: "ok", ms: 1600 }) });
      }
      out.push({ label: "Вид", items: ([["strip", "Полосы"], ["chips", "Образцы"]] as const).map(([k, label]) => ({ label, checked: !!one && (p?.pm ?? "strip") === k, run: () => set({ pm: k === "strip" ? undefined : k }) })) });
      out.push(rename);
      break;

    case "tilemap":
      out.push({ label: "Нарисовать остров", run: () => b.view.updateMany(views.map((v) => [v.id, { ...clearMapPatch(v.props), ...islandPatch(...mapSize(v.props)) } as Partial<NodeData>])) });
      out.push({
        label: "Очистить карту",
        icon: Eraser,
        run: async () => {
          if (await ask({ title: "Очистить карту?", text: "Все клетки и предметы будут стёрты.", ok: "Очистить", danger: true })) b.view.updateMany(views.map((v) => [v.id, clearMapPatch(v.props) as Partial<NodeData>]));
        },
      });
      out.push({ label: "Легенда", checked: !!one && p?.leg !== false, run: () => set({ leg: p?.leg === false ? undefined : false }) });
      out.push(rename);
      break;

    case "estimate": {
      const on = views.every((v) => v.props.on);
      out.push({ label: on ? "Скрыть карты" : "Открыть карты", icon: on ? EyeOff : Eye, run: () => pokerReveal(b, ids, !on) });
      out.push({ label: "Новый раунд", icon: RotateCcw, run: () => pokerReset(b, ids) });
      out.push({ label: "Колода", items: POKER_KINDS.filter(([k]) => k !== "custom" || views.some((v) => v.props.faces?.length)).map(([k, label]) => ({ label, checked: !!one && (p?.pk ?? "fib") === k, run: () => set({ pk: k === "fib" ? undefined : k }) })) });
      out.push(rename);
      break;
    }

    case "gate":
      out.push({ heading: "Условие" });
      for (const gm of Object.keys(GATE_LABELS) as GateMode[])
        out.push({
          label: GATE_LABELS[gm],
          checked: (p?.gm ?? "and") === gm && !!one,
          run: () => {
            set({ gm });
            for (const id of ids) b.logic.refresh(id);
          },
        });
      out.push("-", { label: "Название…", icon: Pencil, run: () => askTitle(b, views, "Название блока") });
      break;
  }
  return out.filter(Boolean) as Entry[];
}

async function askTitle(b: Board, views: NodeView[], title: string) {
  const v = await promptText({ title, ok: "Готово", input: { value: views.length === 1 ? (views[0]!.props.title ?? "") : "" } });
  if (v !== null) b.view.updateMany(views.map((x) => [x.id, { title: v.trim() || undefined }]));
}
