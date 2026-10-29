/* Что показать в панели настроек для выделенного. Каждый тип объекта
   получает свои разделы; запись идёт сразу во все выделенные объекты
   этого типа и отменяется Ctrl+Z, как любая правка. */
import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
import ArrowDownToLine from "@lucide/svelte/icons/arrow-down-to-line";
import ArrowUpToLine from "@lucide/svelte/icons/arrow-up-to-line";
import Dices from "@lucide/svelte/icons/dices";
import Download from "@lucide/svelte/icons/download";
import ExternalLink from "@lucide/svelte/icons/external-link";
import Flag from "@lucide/svelte/icons/flag";
import Hand from "@lucide/svelte/icons/hand";
import Link2 from "@lucide/svelte/icons/link-2";
import Maximize2 from "@lucide/svelte/icons/maximize-2";
import Pause from "@lucide/svelte/icons/pause";
import Play from "@lucide/svelte/icons/play";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Scan from "@lucide/svelte/icons/scan";
import Shuffle from "@lucide/svelte/icons/shuffle";
import SkipBack from "@lucide/svelte/icons/skip-back";
import SkipForward from "@lucide/svelte/icons/skip-forward";
import UserRound from "@lucide/svelte/icons/user-round";
import Users from "@lucide/svelte/icons/users";
import { toasts } from "../../lib/toast.svelte.ts";
import { copyText, download } from "../../lib/util.ts";
import { ask } from "../../ui/confirm.svelte.ts";
import { menu } from "../../ui/menu.svelte.ts";
import type { Board } from "../board.svelte.ts";
import { downloadShelf, fileUrl } from "../files.ts";
import { DASHES, FILLS, HEAD_SIZES, SIZES, TEXT_SIZES, reversePath, setRoute } from "../menus.ts";
import {
  CALC_LABELS,
  CODE_LANGS,
  DEVICE_LABELS,
  DEVICE_SIZES,
  FONTS,
  FONT_TYPES,
  GATE_LABELS,
  HEADS,
  HEAD_LABELS,
  PREVIEW_LANGS,
  ROUTE_LABELS,
  SHAPE_KINDS,
  SHAPE_LABELS,
  WIDGET_TYPES,
  type NodeData,
  type NodeProps,
  type NodeType,
} from "../model.ts";
import { candidates, loadMembers, resetVotes } from "../nodes/actions.ts";
import { assigneeItems } from "../nodes/actions.ts";
import { DICE_MAX, DICE_SIDES, SIDES_MAX, counterReset, counterSet, counterValue, diceCount, diceSides, rollDice } from "../nodes/games.ts";
import {
  COIN_SIDES,
  PLAYER_COLORS,
  RANDOM_MODES,
  buzzesOf,
  checklistPatch,
  clearDays,
  clearWords,
  deckCards,
  deckDraw,
  deckLeft,
  deckShuffle,
  flipCard,
  flipCoin,
  genRandom,
  markedDays,
  nextTurn,
  playersOf,
  resetBuzz,
  resetScores,
  resetTurns,
  revealAll,
  swPatch,
  swRunning,
  wordsCount,
} from "../nodes/play.ts";
import { votesOf } from "../nodes/poll.ts";
import {
  MAP_MAX,
  PERIOD_UNITS,
  POKER_KINDS,
  RARITY,
  clearDone,
  clearMapPatch,
  curveSeries,
  islandPatch,
  isObjectTile,
  kanbanCols,
  kanbanDone,
  lootChances,
  lootItems,
  mapSize,
  paletteText,
  periodCount,
  pokerReset,
  pokerReveal,
  pokerVotes,
  roadShare,
  rollLoot,
  statsOf,
  swatchesOf,
  tilesOf,
} from "../nodes/design.ts";
import { colsOf, insertCol, insertRow, removeCol, removeRow, rowsOf, MAX_COLS, MAX_ROWS } from "../nodes/table.svelte.ts";
import { DAY, HOUR, MIN, SEC, TIMER_PRESETS_MS, TIMER_SOUNDS, timerDur, timerLeft, timerPatch, timerStep } from "../nodes/timer.ts";
import { statusesOf } from "../nodes/values.ts";
import { TIMEZONES, clearRatings, markPatch, pressButton, setStatus, setSwitch, spinWheel, wheelOptions } from "../nodes/widgets.ts";
import { duplicate, fitFrame } from "../ops.ts";
import type { NodeView } from "../store.svelte.ts";
import type { Btn, Field, Opt, Row, Section } from "./types.ts";

type Patch = Record<string, unknown>;
const rid = () => Math.random().toString(36).slice(2, 8);
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Типы, у которых есть цвет (как у кнопки «Цвет» на панели над выделением). */
const NO_COLOR = new Set<NodeType>(["image", "video", "sticker", "comment"]);
/** Объекты без поворота. */
const NO_TURN = new Set<NodeType>(["frame", "path", "comment"]);

const SOUND_OPTS: Opt[] = TIMER_SOUNDS.map(([v, l]) => [v, l]);
const TEXT_OPTS: Opt[] = TEXT_SIZES.map(([v, l]) => [v, l]);
const ALIGN_OPTS: Opt[] = [
  ["left", "Слева"],
  ["center", "По центру"],
  ["right", "Справа"],
];

interface Ctx {
  b: Board;
  views: NodeView[];
  v: NodeView;
  p: NodeProps;
  ids: string[];
  one: boolean;
  put: (patch: Patch) => void;
}

/* ------------------------------ конструкторы полей ------------------------------ */

function mk(c: Ctx) {
  const P = () => c.v.props as Record<string, unknown>;
  return {
    /** Текстовое поле: пусто — свойство убирается. */
    str(k: keyof NodeProps, label: string, o: { ph?: string; max?: number; lines?: number; hint?: string; key?: string } = {}): Field {
      return { k: "text", key: o.key ?? String(k), label, ph: o.ph, max: o.max ?? 200, lines: o.lines, hint: o.hint, get: () => String(P()[k] ?? ""), set: (s) => c.put({ [k]: s.trim() ? s.slice(0, o.max ?? 200) : undefined }) };
    },
    num(k: keyof NodeProps, label: string, o: Partial<Extract<Field, { k: "num" }>> & { def?: number } = {}): Field {
      return {
        k: "num",
        key: String(k),
        label,
        ...o,
        get: () => {
          const x = P()[k];
          return typeof x === "number" && Number.isFinite(x) ? x : (o.def ?? null);
        },
        set: (n) => c.put({ [k]: n === null || n === o.def ? undefined : n }),
      };
    },
    tog(k: keyof NodeProps, label: string, hint?: string, inv = false): Field {
      // inv — свойство включено по умолчанию: пишется только «выключено» (false)
      return { k: "toggle", key: String(k), label, hint, get: () => (inv ? P()[k] !== false : !!P()[k]), set: (on) => c.put({ [k]: inv ? (on ? undefined : false) : on || undefined }) };
    },
    /** Выбор из вариантов; значение по умолчанию не пишется. */
    seg(k: keyof NodeProps, label: string | undefined, opts: Opt[], def: string, kind: "seg" | "chips" | "select" = "seg"): Field {
      const get = () => String(P()[k] ?? def);
      const set = (val: string) => c.put({ [k]: val === def ? undefined : val });
      return kind === "chips" ? { k: "chips", key: String(k), label, opts, get, set } : { k: kind, key: String(k), label, opts, get, set };
    },
    btns(btns: (Btn | false | null | undefined)[], key = "btns"): Field {
      return { k: "btns", key, btns: btns.filter(Boolean) as Btn[] };
    },
    info(text: string, key = "info"): Field {
      return { k: "info", key, text };
    },
  };
}

/** Список {id, t} — варианты опроса, колеса, колоды, случайного выбора. */
function optList(c: Ctx, label: string, o: { add: string; ph: string; base: string; min?: number; max?: number; fallback?: () => Row[]; after?: Patch }): Field {
  return {
    k: "list",
    key: "opts",
    label,
    add: o.add,
    ph: o.ph,
    min: o.min ?? 1,
    max: o.max ?? 60,
    get: () => {
      const list = Array.isArray(c.v.props.opts) && c.v.props.opts.length ? c.v.props.opts : (o.fallback?.() ?? []);
      return list.map((x) => ({ id: x.id, t: x.t }));
    },
    set: (rows) => c.put({ opts: rows.map((r) => ({ id: r.id, t: r.t })), ...o.after }),
    make: (n) => ({ id: rid(), t: `${o.base} ${n + 1}` }),
  };
}

/** Игроки табло и очереди ходов. */
function playerList(c: Ctx, base: string): Field {
  return {
    k: "list",
    key: "pl",
    label: "Участники",
    add: "Добавить",
    ph: "Имя или команда",
    color: true,
    min: 1,
    max: 16,
    get: () => playersOf(c.v.props).map((x) => ({ id: x.id, t: x.t, c: x.c })),
    set: (rows) => c.put({ pl: rows.map((r) => ({ id: r.id, t: r.t, c: r.c ?? "blue" })) }),
    make: (n) => ({ id: rid(), t: `${base} ${n + 1}`, c: PLAYER_COLORS[n % PLAYER_COLORS.length]! }),
  };
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const d = a % 10;
  return a > 10 && a < 20 ? many : d === 1 ? one : d >= 2 && d <= 4 ? few : many;
};

/* --------------------------------- типы --------------------------------- */

function typeSections(c: Ctx, t: NodeType): Section[] {
  const { b, views, v, p, ids, one } = c;
  const f = mk(c);
  const S = (id: string, title: string | undefined, fields: (Field | false | null | undefined)[]): Section => ({ id, title, fields: fields.filter(Boolean) as Field[] });
  const of = (type: NodeType) => views.filter((x) => x.type === type);
  const title = (ph: string) => f.str("title", "Название", { ph, max: 80 });

  switch (t) {
    case "note":
    case "text":
      return [S("main", undefined, [f.tog("fit", "Высота по тексту", "Выключите, чтобы задать высоту вручную", true)])];

    case "code": {
      const langs: Opt[] = [["text", "Текст"], ...CODE_LANGS.filter((l) => l.id !== "text").map((l) => [l.id, l.label] as Opt)];
      return [
        S("main", undefined, [
          f.str("title", "Имя файла", { ph: "например, main.py", max: 80 }),
          f.seg("lang", "Язык", langs, "text", "select"),
          PREVIEW_LANGS.has(p.lang ?? "") && f.seg("view", "Показывать", [["code", "Код"], ["preview", "Результат"]], "code"),
          f.tog("wrap", "Переносить строки", undefined, true),
          f.tog("fit", "Высота по содержимому", undefined, true),
        ]),
      ];
    }

    case "image":
      return [
        S("main", undefined, [
          f.str("name", "Имя файла", { max: 120 }),
          f.btns([
            one && { label: "Открыть", icon: Maximize2, run: () => (b.ui.viewer = v.id) },
            !!p.src && one && { label: "Скачать", icon: Download, run: () => download(fileUrl(p.src, { dl: true, name: p.name }), p.name || "image") },
          ]),
        ]),
      ];

    case "video":
      return [
        S("main", undefined, [
          f.btns([
            one && (b.live.has(v.id) ? { label: "Закрыть плеер", icon: Pause, run: () => b.ix.deactivate(v.id) } : { label: "Смотреть", icon: Play, run: () => b.ix.activate(v.id) }),
            one && !!p.url && { label: "На сайте", icon: ExternalLink, run: () => window.open(p.url, "_blank", "noopener") },
          ]),
        ]),
      ];

    case "audio":
    case "file":
      return [
        S("main", undefined, [
          f.str("name", "Имя файла", { max: 120 }),
          one && !!p.src && f.btns([{ label: "Скачать", icon: Download, run: () => download(fileUrl(p.src, { dl: true, name: p.name }), p.name || "file") }]),
        ]),
      ];

    case "shelf":
      return [
        S("main", undefined, [
          f.str("name", "Название", { ph: "Полка", max: 80 }),
          f.info(`${(p.items ?? []).length} ${plural((p.items ?? []).length, "файл", "файла", "файлов")}`),
          one && f.btns([{ label: "Скачать всё", icon: Download, disabled: !(p.items ?? []).length, run: () => void downloadShelf(p.name || "Полка", p.items ?? []) }]),
        ]),
      ];

    case "link":
      return [
        S("main", undefined, [
          f.tog("live", "Живой просмотр", "Сайт или плеер прямо на доске"),
          one && !!p.url && f.btns([{ label: "Открыть ссылку", icon: ExternalLink, run: () => window.open(p.url, "_blank", "noopener") }]),
        ]),
      ];

    case "frame":
      return [
        S("main", undefined, [
          f.str("name", "Название", { ph: "Рамка", max: 80 }),
          {
            k: "select",
            key: "dev",
            label: "Вид",
            opts: [["", "Обычная рамка"], ...(Object.entries(DEVICE_LABELS) as Opt[])],
            get: () => p.dev ?? "",
            set: (dev) => {
              const size = dev ? DEVICE_SIZES[dev as keyof typeof DEVICE_SIZES] : undefined;
              // устройство — сразу своего размера (левый верхний угол на месте)
              b.view.updateMany(views.map((x) => [x.id, { dev: (dev || undefined) as NodeProps["dev"], ...(size && !x.props.dev ? { w: size[0], h: size[1] } : {}) } as Partial<NodeData>]));
            },
          },
          p.dev === "browser" && f.str("url", "Адрес в строке", { ph: "example.com", max: 200 }),
          one && f.btns([{ label: "Подогнать под содержимое", icon: Scan, run: () => fitFrame(b, v.id) }]),
        ]),
      ];

    case "shape":
      return [
        S("main", undefined, [
          {
            k: "select",
            key: "kind",
            label: "Форма",
            opts: [...SHAPE_KINDS, ...(p.kind === "poly" ? (["poly"] as const) : [])].map((k) => [k, SHAPE_LABELS[k]] as Opt),
            get: () => p.kind ?? "rect",
            set: (k) => c.put({ kind: k }),
          },
          f.seg("fill", "Заливка", FILLS.map(([x, l]) => [x, l.replace("Без заливки", "Нет").replace("Полупрозрачная", "Лёгкая")] as Opt), "tint"),
          f.seg("stroke", "Контур", SIZES.map(([x, l]) => [x, l.replace("Очень толстая", "Жирная")] as Opt), "m"),
          f.seg("dash", "Линия", DASHES, "solid"),
        ]),
      ];

    case "path": {
      const headOpts: Opt[] = HEADS.map((h) => [h, HEAD_LABELS[h]]);
      return [
        S("main", undefined, [
          { k: "seg", key: "route", label: "Маршрут", opts: (["straight", "curve", "elbow"] as const).map((r) => [r, ROUTE_LABELS[r].replace("Под прямым углом", "Углом")] as Opt), get: () => p.route ?? (p.curve ? "curve" : "straight"), set: (r) => setRoute(b, ids, r as "straight") },
          { k: "select", key: "head0", label: "Начало", half: true, opts: headOpts, get: () => p.head0 ?? "none", set: (h) => c.put({ head0: h, hb0: undefined }) },
          { k: "select", key: "head1", label: "Конец", half: true, opts: headOpts, get: () => p.head1 ?? "none", set: (h) => c.put({ head1: h, hb1: undefined }) },
          f.seg("hs", "Наконечники", HEAD_SIZES.map(([x, l]) => [x, l] as Opt), "m"),
          f.seg("stroke", "Толщина", SIZES.map(([x, l]) => [x, l.replace("Очень толстая", "Жирная")] as Opt), "m"),
          f.seg("dash", "Линия", DASHES, "solid"),
          one && f.btns([{ label: "Развернуть", icon: ArrowLeftRight, run: () => reversePath(b, v) }]),
        ]),
      ];
    }

    case "ink":
      return [S("main", undefined, [f.seg("stroke", "Толщина", SIZES.map(([x, l]) => [x, l.replace("Очень толстая", "Жирная")] as Opt), "m")])];

    case "sticker":
      return [S("main", undefined, [{ k: "emoji", key: "emoji", label: "Эмодзи", get: () => p.emoji, set: (e) => c.put({ emoji: e }) }])];

    case "table": {
      const nr = one ? rowsOf(v).length : 0;
      const nc = one ? colsOf(v).length : 0;
      return [
        S("main", undefined, [
          f.tog("head", "Первая строка — шапка", undefined, true),
          one && {
            k: "num",
            key: "rows",
            label: "Строк",
            half: true,
            int: true,
            stepper: true,
            min: 1,
            max: MAX_ROWS,
            get: () => rowsOf(v).length,
            set: (n) => {
              const want = clampN(Math.round(n ?? nr), 1, MAX_ROWS);
              for (let i = rowsOf(v).length; i < want; i++) insertRow(b, v, i);
              for (let i = rowsOf(v).length; i > want; i--) removeRow(b, v, i - 1);
            },
          },
          one && {
            k: "num",
            key: "cols",
            label: "Столбцов",
            half: true,
            int: true,
            stepper: true,
            min: 1,
            max: MAX_COLS,
            get: () => colsOf(v).length,
            set: (n) => {
              const want = clampN(Math.round(n ?? nc), 1, MAX_COLS);
              for (let i = colsOf(v).length; i < want; i++) insertCol(b, v, i);
              for (let i = colsOf(v).length; i > want; i--) removeCol(b, v, i - 1);
            },
          },
        ]),
      ];
    }

    case "task": {
      const who = p.who;
      return [
        S("main", undefined, [
          f.tog("done", "Готово"),
          f.btns(
            [
              {
                label: who ? who.name : "Назначить…",
                icon: UserRound,
                title: "Исполнитель",
                run: (e) => {
                  void loadMembers(b);
                  menu.dropdown(e.currentTarget as HTMLElement, assigneeItems(b, views), "bottom-start");
                },
              },
            ],
            "who",
          ),
          { k: "date", key: "due", label: "Срок", get: () => p.due ?? null, set: (d) => c.put({ due: d }) },
          f.seg("prio", "Приоритет", [["", "Нет"], ["low", "Низкий"], ["mid", "Средний"], ["high", "Высокий"]], ""),
        ]),
      ];
    }

    case "poll":
      return [
        S("main", undefined, [
          one && { k: "text", key: "q", label: "Вопрос", lines: 2, max: 300, get: () => v.textValue, set: (s) => b.view.update(v.id, { text: s }) },
          one && optList(c, "Варианты", { add: "Добавить вариант", ph: "Вариант ответа", base: "Вариант", min: 2, max: 20 }),
          f.tog("multi", "Несколько ответов"),
          one && f.info(`Проголосовали: ${votesOf(v).size}`),
          one && f.btns([{ label: "Сбросить голоса", icon: RotateCcw, disabled: !votesOf(v).size, run: () => void resetVotes(b, v) }]),
        ]),
      ];

    case "timer": {
      const ts = of("timer");
      const run = ts.some((x) => typeof x.props.end === "number" && timerLeft(x.props) > 0);
      const now = () => Date.now();
      const all = (kind: "toggle" | "reset") => b.view.updateMany(ts.map((x) => [x.id, timerPatch(x.props, kind, now()) as Partial<NodeData>]));
      return [
        S("main", undefined, [
          f.btns([
            { label: run ? "Пауза" : "Старт", icon: run ? Pause : Play, primary: true, run: () => all("toggle") },
            { label: "Сбросить", icon: RotateCcw, run: () => all("reset") },
          ]),
          title("Таймер"),
          { k: "dur", key: "dur", label: "Длительность", presets: TIMER_PRESETS_MS, get: () => timerDur(p), set: (ms) => b.view.updateMany(ts.map((x) => [x.id, timerPatch(x.props, "set", now(), ms) as Partial<NodeData>])) },
          { k: "dur", key: "tstep", label: "Шаг кнопок ±", presets: [10 * SEC, 30 * SEC, MIN, 5 * MIN, 10 * MIN, HOUR, DAY], get: () => timerStep(p), set: (ms) => c.put({ tstep: ms === MIN ? undefined : ms }) },
        ]),
        S("end", "Когда время вышло", [
          f.seg("snd", "Звук", SOUND_OPTS, "beep", "select"),
          f.str("endt", "Надпись", { ph: "Время вышло!", max: 60 }),
          f.tog("loop", "Начинать заново", "Таймер идёт по кругу, пока его не остановят"),
        ]),
        S("look", "Вид", [f.seg("tv", undefined, [["bar", "Полоса"], ["ring", "Кольцо"], ["none", "Только цифры"]], "bar")]),
      ];
    }

    case "counter": {
      const cs = of("counter");
      return [
        S("main", undefined, [
          title("Счёт"),
          one && { k: "num", key: "value", label: "Значение", stepper: true, step: p.step ?? 1, get: () => counterValue(p), set: (n) => n !== null && counterSet(b, ids, n) },
          f.num("step", "Шаг", { def: 1, half: true, min: 0.001, ph: "1" }),
          f.str("unit", "Единица", { ph: "очков", max: 12, key: "unit" }),
          f.num("min", "Не меньше", { half: true, empty: true, ph: "—" }),
          f.num("max", "Не больше", { half: true, empty: true, ph: "—" }),
          f.num("rst", "Сброс к", { half: true, def: 0, ph: "0" }),
          f.btns([{ label: "Сбросить", icon: RotateCcw, run: () => cs.forEach((x) => counterSet(b, [x.id], counterReset(x.props))) }]),
        ]),
      ];
    }

    case "dice": {
      const set = (patch: Patch) => c.put({ ...patch, roll: null });
      const custom = Array.isArray(p.faces) && p.faces.length > 0;
      return [
        S("main", undefined, [
          f.btns([{ label: "Бросить", icon: Dices, primary: true, run: () => rollDice(b, ids) }]),
          { k: "num", key: "count", label: "Кубиков", int: true, stepper: true, min: 1, max: DICE_MAX, half: true, get: () => diceCount(p), set: (n) => set({ count: clampN(Math.round(n ?? 1), 1, DICE_MAX) }) },
          f.num("mod", "Прибавка", { int: true, stepper: true, half: true, def: 0, min: -999, max: 999 }),
          !custom && {
            k: "chips",
            key: "sides",
            label: "Граней",
            opts: DICE_SIDES.map((n) => [String(n), `d${n}`] as Opt),
            get: () => String(diceSides(p)),
            set: (s) => set({ sides: Number(s), faces: undefined }),
          },
          !custom && { k: "num", key: "sidesN", label: "Своё число граней", int: true, min: 2, max: SIDES_MAX, ph: "например, 30", get: () => (DICE_SIDES.includes(diceSides(p)) ? null : diceSides(p)), set: (n) => n !== null && set({ sides: clampN(Math.round(n), 2, SIDES_MAX), faces: undefined }), empty: true },
          f.seg("keep", "Считать", [["all", "Все"], ["hi", "Лучший"], ["lo", "Худший"]], "all"),
          f.tog("hist", "Показывать прошлые броски"),
        ]),
        S("faces", "Свои грани", [
          {
            k: "list",
            key: "faces",
            label: custom ? undefined : "Текст или эмодзи вместо чисел",
            add: custom ? "Добавить грань" : "Задать свои грани",
            ph: "Грань",
            min: 0,
            max: 24,
            get: () => (p.faces ?? []).map((t, i) => ({ id: `f${i}`, t })),
            set: (rows) => set({ faces: rows.length ? rows.map((r) => r.t.slice(0, 24)) : undefined }),
            make: (n) => ({ id: rid(), t: n === 0 ? "😀" : String(n + 1) }),
          },
        ]),
        S("look", "Вид", [f.seg("ds", undefined, [["classic", "Белые"], ["color", "Цветные"], ["dark", "Тёмные"], ["glass", "Стекло"]], "classic")]),
      ];
    }

    case "progress": {
      const steps = p.steps && p.steps > 1 ? p.steps : 0;
      return [
        S("main", undefined, [
          title("Прогресс"),
          { k: "num", key: "pv", label: "Значение, %", slider: true, min: 0, max: 100, step: steps ? 100 / steps : 1, get: () => Math.round(p.pv ?? 0), set: (n) => c.put({ pv: clampN(n ?? 0, 0, 100) }) },
          f.num("steps", "Этапов", { int: true, stepper: true, half: true, min: 0, max: 100, def: 0, hint: "0 — без деления" }),
          f.seg("pf", "Подпись", [["pct", "42 %"], ["frac", "4 из 10"], ["none", "Нет"]], steps ? "frac" : "pct"),
          (p.pf ?? (steps ? "frac" : "pct")) === "frac" && !steps && f.num("max", "Сколько всего", { int: true, min: 1, max: 1e6, def: 100, half: true }),
          f.tog("pb", "Кнопки − и +"),
        ]),
      ];
    }

    case "button":
      return [
        S("main", undefined, [
          one && f.btns([{ label: "Нажать", icon: Play, primary: true, run: () => pressButton(b, v) }]),
          f.str("title", "Надпись", { ph: "Нажми меня", max: 60 }),
          { k: "emoji", key: "emoji", label: "Значок", get: () => p.emoji, set: (e) => c.put({ emoji: e || undefined }) },
          f.seg("bv", "Вид", [["solid", "Заливка"], ["soft", "Мягкий"], ["outline", "Контур"]], "solid"),
          f.str("href", "Ведёт на адрес", { ph: "https://…", max: 500, hint: "Пусто — без перехода" }),
          !!p.press?.s && f.info(`Нажали ${p.press.s} ${plural(p.press.s, "раз", "раза", "раз")}${p.press.n ? ` · последним — ${p.press.n}` : ""}`),
          !!p.press?.s && f.btns([{ label: "Сбросить счёт нажатий", icon: RotateCcw, run: () => c.put({ press: null }) }]),
        ]),
      ];

    case "switch":
      return [
        S("main", undefined, [
          { k: "toggle", key: "on", label: "Включён", get: () => views.every((x) => x.props.on), set: (on) => setSwitch(b, ids, on) },
          title("Переключатель"),
        ]),
      ];

    case "slider":
      return [
        S("main", undefined, [
          title("Ползунок"),
          { k: "num", key: "sv", label: "Значение", slider: true, min: p.min ?? 0, max: p.max ?? 100, step: p.step ?? 1, get: () => p.sv ?? p.min ?? 0, set: (n) => c.put({ sv: clampN(n ?? 0, p.min ?? 0, p.max ?? 100) }) },
          f.num("min", "От", { half: true, def: 0 }),
          f.num("max", "До", { half: true, def: 100 }),
          f.num("step", "Шаг", { half: true, def: 1, min: 0.001 }),
          f.str("unit", "Единица", { ph: "%", max: 12 }),
        ]),
      ];

    case "rating":
      return [
        S("main", undefined, [
          title("Оценка"),
          f.seg("ri", "Значок", [["star", "★"], ["heart", "♥"], ["fire", "🔥"], ["like", "👍"]], "star"),
          f.num("max", "Сколько значков", { int: true, stepper: true, min: 2, max: 10, def: 5 }),
          f.btns([
            {
              label: "Сбросить оценки",
              icon: RotateCcw,
              danger: true,
              run: async () => {
                if (await ask({ title: "Сбросить все оценки?", text: "Оценки всех участников пропадут.", ok: "Сбросить", danger: true })) for (const x of views) clearRatings(b, x);
              },
            },
          ]),
        ]),
      ];

    case "clock":
      return [
        S("main", undefined, [
          title("Часы"),
          f.seg("tz", "Город", TIMEZONES.map(([z, l]) => [z, l] as Opt), "", "select"),
          f.seg("cv", "Вид", [["digital", "Цифры"], ["analog", "Стрелки"]], "digital"),
          f.tog("sec", "Секунды"),
          f.tog("h12", "12-часовой формат"),
          p.cv !== "analog" && { k: "toggle", key: "date", label: "Дата", hint: p.date === undefined ? "Сама появляется, когда часы высокие" : undefined, get: () => p.date ?? v.h >= 104, set: (on) => c.put({ date: on }) },
        ]),
      ];

    case "countdown": {
      const now = new Date();
      return [
        S("main", undefined, [
          title("До события"),
          {
            k: "when",
            key: "at",
            label: "Когда",
            get: () => p.at ?? null,
            set: (ms) => c.put({ at: ms }),
            presets: [
              ["Через 10 мин", () => Date.now() + 10 * MIN],
              ["Через час", () => Date.now() + HOUR],
              ["Завтра 9:00", () => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9).getTime()],
              ["Через неделю", () => Date.now() + 7 * DAY],
              ["Новый год", () => new Date(now.getFullYear() + 1, 0, 1).getTime()],
            ],
          },
          f.str("endt", "Надпись в конце", { ph: "Наступило! 🎉", max: 60 }),
          f.seg("snd", "Звук", SOUND_OPTS, "none", "select"),
        ]),
      ];
    }

    case "chart":
      return [
        S("main", undefined, [
          title("Диаграмма"),
          f.seg("ct", "Вид", [["bar", "Столбцы"], ["line", "Линия"], ["pie", "Круг"], ["donut", "Кольцо"]], "bar"),
          one && {
            k: "list",
            key: "data",
            label: "Значения",
            hint: "Пусто — значения берутся из входящих стрелок",
            color: true,
            num: "Число",
            add: "Добавить значение",
            ph: "Подпись",
            min: 0,
            max: 40,
            get: () => (p.data ?? []).map((d, i) => ({ id: `d${i}`, t: d.l, v: d.v, c: d.c })),
            set: (rows) => c.put({ data: rows.length ? rows.map((r) => ({ l: r.t, v: r.v ?? 0, ...(r.c ? { c: r.c } : {}) })) : undefined }),
            make: (n) => ({ id: rid(), t: `Пункт ${n + 1}`, v: 10 * (n + 1) }),
          },
        ]),
      ];

    case "qr":
      return [
        S("main", undefined, [
          f.str("url", "Содержимое", { ph: "Адрес или любой текст", max: 1000, lines: 2 }),
          f.str("title", "Подпись", { ph: "Без подписи", max: 80 }),
          one && f.btns([{ label: "Ссылка на эту доску", icon: Link2, run: () => c.put({ url: location.origin + location.pathname }) }]),
        ]),
      ];

    case "wheel":
      return [
        S("main", undefined, [
          f.btns([{ label: "Крутить", icon: Play, primary: true, run: () => spinWheel(b, ids) }]),
          title("Колесо"),
          one && optList(c, "Варианты", { add: "Добавить вариант", ph: "Вариант", base: "Вариант", min: 2, max: 24, fallback: () => wheelOptions(v), after: { spin: null } }),
          one &&
            f.btns(
              [
                {
                  label: "Участники доски",
                  icon: Users,
                  run: async () => {
                    await loadMembers(b);
                    const names = candidates(b).map((a) => a.name);
                    if (names.length < 2) return toasts.show("Пока на доске меньше двух участников");
                    c.put({ opts: names.slice(0, 24).map((n, i) => ({ id: `p${i}`, t: n })), spin: null });
                  },
                },
                !!p.spin && { label: "Сбросить результат", icon: RotateCcw, run: () => c.put({ spin: null }) },
              ],
              "wheel-more",
            ),
        ]),
      ];

    case "status": {
      const sts = statusesOf(p);
      return [
        S("main", undefined, [
          { k: "select", key: "st", label: "Сейчас", opts: sts.map((x, i) => [String(i), x.t || `Статус ${i + 1}`] as Opt), get: () => String(p.st ?? 0), set: (s) => setStatus(b, ids, Number(s)) },
          f.str("title", "Заголовок", { ph: "Без заголовка", max: 80 }),
          one && {
            k: "list",
            key: "sts",
            label: "Варианты",
            color: true,
            add: "Добавить статус",
            ph: "Статус",
            min: 1,
            max: 12,
            get: () => sts.map((x, i) => ({ id: `s${i}`, t: x.t, c: x.c })),
            set: (rows) => c.put({ sts: rows.map((r) => ({ t: r.t, c: r.c ?? "gray" })), st: clampN(p.st ?? 0, 0, Math.max(0, rows.length - 1)) || undefined }),
            make: (n) => ({ id: rid(), t: `Статус ${n + 1}`, c: PLAYER_COLORS[n % PLAYER_COLORS.length]! }),
          },
        ]),
      ];
    }

    case "tracker":
      return [
        S("main", undefined, [
          title("Трекер"),
          f.num("cells", "Клеток", { int: true, stepper: true, min: 1, max: 60, def: 7, hint: "7 — дни недели" }),
          f.btns([{ label: "Очистить отметки", icon: RotateCcw, run: () => b.view.updateMany(views.map((x) => [x.id, markPatch(x, "clear") as Partial<NodeData>])) }]),
        ]),
      ];

    case "calc":
      return [
        S("main", undefined, [
          title("Вычисление"),
          f.seg("op", "Действие", Object.entries(CALC_LABELS) as Opt[], "sum", "select"),
          { k: "seg", key: "dec", label: "Знаков после запятой", opts: [["-1", "Авто"], ["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"]], get: () => String(p.dec ?? -1), set: (x) => c.put({ dec: x === "-1" ? undefined : Number(x) }) },
          f.str("unit", "Единица", { ph: "₽, ч, очков", max: 12 }),
          f.info("Значения приходят по стрелкам от счётчиков, ползунков, кубиков и других объектов."),
        ]),
      ];

    case "gate":
      return [
        S("main", undefined, [
          title("Логический блок"),
          {
            k: "select",
            key: "gm",
            label: "Условие",
            opts: Object.entries(GATE_LABELS) as Opt[],
            get: () => p.gm ?? "and",
            set: (gm) => {
              c.put({ gm });
              for (const id of ids) b.logic.refresh(id);
            },
          },
          f.info("Включается, когда входящие стрелки выполняют условие. Его выход можно вести дальше."),
        ]),
      ];

    /* ------------------------------ новые 1.2 ------------------------------ */

    case "stopwatch": {
      const sw = of("stopwatch");
      const run = sw.some((x) => swRunning(x.props));
      const act = (k: "toggle" | "reset" | "lap") => b.view.updateMany(sw.map((x) => [x.id, swPatch(x.props, k) as Partial<NodeData>]));
      return [
        S("main", undefined, [
          f.btns([
            { label: run ? "Стоп" : "Старт", icon: run ? Pause : Play, primary: true, run: () => act("toggle") },
            { label: "Круг", icon: Flag, disabled: !run, run: () => act("lap") },
            { label: "Сбросить", icon: RotateCcw, run: () => act("reset") },
          ]),
          title("Секундомер"),
          f.tog("ms", "Сотые доли секунды"),
        ]),
      ];
    }

    case "coin": {
      const ch = p.ch ?? [0, 0];
      return [
        S("main", undefined, [
          f.btns([{ label: "Подбросить", icon: RotateCcw, primary: true, run: () => flipCoin(b, ids) }]),
          f.str("title", "Подпись", { ph: "Без подписи", max: 60 }),
          { k: "text", key: "cf0", label: "Первая сторона", half: true, ph: COIN_SIDES[0], max: 24, get: () => p.cf?.[0] ?? "", set: (s) => c.put({ cf: [s.trim(), p.cf?.[1] ?? ""].some(Boolean) ? [s.trim(), p.cf?.[1] ?? ""] : undefined }) },
          { k: "text", key: "cf1", label: "Вторая сторона", half: true, ph: COIN_SIDES[1], max: 24, get: () => p.cf?.[1] ?? "", set: (s) => c.put({ cf: [p.cf?.[0] ?? "", s.trim()].some(Boolean) ? [p.cf?.[0] ?? "", s.trim()] : undefined }) },
          f.tog("hist", "Показывать счёт"),
          one && (ch[0]! > 0 || ch[1]! > 0) && f.info(`Бросков: ${ch[0]! + ch[1]!} · ${p.cf?.[0] || COIN_SIDES[0]} ${ch[0]} · ${p.cf?.[1] || COIN_SIDES[1]} ${ch[1]}`),
          one && (ch[0]! > 0 || ch[1]! > 0) && f.btns([{ label: "Сбросить счёт", icon: RotateCcw, run: () => c.put({ ch: undefined, coin: null }) }]),
        ]),
      ];
    }

    case "flipcard":
      return [
        S("main", undefined, [
          f.btns([{ label: "Перевернуть", icon: RotateCcw, primary: true, run: () => flipCard(b, ids) }]),
          f.str("ft", "Лицевая сторона", { ph: "Вопрос", lines: 3, max: 600 }),
          f.str("bt", "Оборот", { ph: "Ответ", lines: 3, max: 600 }),
          f.tog("self", "Каждый переворачивает у себя", "Ответ не виден остальным, пока они сами не перевернут"),
        ]),
      ];

    case "deck": {
      const left = one ? deckLeft(p) : 0;
      const total = one ? deckCards(p).length : 0;
      return [
        S("main", undefined, [
          f.btns([
            { label: "Вытянуть", icon: Hand, primary: true, disabled: one && left === 0, run: () => void deckDraw(b, ids) },
            { label: "Перетасовать", icon: Shuffle, run: () => deckShuffle(b, ids) },
          ]),
          one && f.info(`В колоде ${left} из ${total}`),
          f.str("title", "Название", { ph: "Колода", max: 60 }),
          { k: "seg", key: "dk", label: "Набор", opts: [["36", "36 карт"], ["52", "52 карты"], ["custom", "Свои"]], get: () => p.dk ?? "36", set: (dk) => c.put({ dk, pile: undefined, top: null, out: undefined }) },
          one && p.dk === "custom" && optList(c, "Карты", { add: "Добавить карту", ph: "Текст карты", base: "Карта", min: 1, max: 200, fallback: () => deckCards(p).map((x, i) => ({ id: `c${i}`, t: x.t })), after: { pile: undefined, top: null, out: undefined } }),
        ]),
      ];
    }

    case "random": {
      const mode = p.rm ?? "num";
      return [
        S("main", undefined, [
          f.btns([
            { label: "Выбрать", icon: Shuffle, primary: true, run: () => void genRandom(b, ids) },
            !!p.uniq && !!p.used?.length && { label: "Начать заново", icon: RotateCcw, run: () => c.put({ used: undefined, rnd: null }) },
          ]),
          title("Случайный выбор"),
          { k: "seg", key: "rm", label: "Что выбирать", opts: RANDOM_MODES.map(([x, l]) => [x, l] as Opt), get: () => mode, set: (rm) => c.put({ rm, used: undefined, rnd: null }) },
          mode === "num" && f.num("min", "От", { half: true, def: 1, int: true }),
          mode === "num" && f.num("max", "До", { half: true, def: 100, int: true }),
          one && mode === "list" && optList(c, "Варианты", { add: "Добавить вариант", ph: "Вариант", base: "Вариант", min: 1, max: 200, after: { used: undefined } }),
          mode === "people" && f.info("Выбирает одного из участников доски."),
          f.tog("uniq", "Без повторов", "Каждый вариант выпадает один раз, потом — заново"),
          !!p.uniq && one && !!p.used?.length && f.info(`Уже выпало: ${p.used.length}`),
        ]),
      ];
    }

    case "score":
      return [
        S("main", undefined, [
          title("Счёт"),
          one && playerList(c, "Команда"),
          f.num("step", "Шаг", { def: 1, half: true, min: 0.001 }),
          f.tog("sort", "Сортировать по очкам"),
          f.btns([
            {
              label: "Обнулить счёт",
              icon: RotateCcw,
              danger: true,
              run: async () => {
                if (await ask({ title: "Обнулить счёт?", text: "Очки всех участников станут нулевыми.", ok: "Обнулить", danger: true })) resetScores(b, ids);
              },
            },
          ]),
        ]),
      ];

    case "turns": {
      const pl = playersOf(p);
      return [
        S("main", undefined, [
          f.btns([
            { label: "Назад", icon: SkipBack, run: () => nextTurn(b, ids, -1) },
            { label: "Следующий ход", icon: SkipForward, primary: true, run: () => nextTurn(b, ids, 1) },
          ]),
          title("Очередь ходов"),
          one && { k: "select", key: "cur", label: "Сейчас ходит", opts: pl.map((x, i) => [String(i), x.t || `Игрок ${i + 1}`] as Opt), get: () => String(clampN(p.cur ?? 0, 0, pl.length - 1)), set: (s) => c.put({ cur: Number(s) }) },
          f.num("rn", "Раунд", { int: true, stepper: true, min: 1, max: 9999, def: 1, half: true }),
          one && playerList(c, "Игрок"),
          f.btns([
            { label: "Перемешать порядок", icon: Shuffle, run: () => c.put({ pl: [...pl].sort(() => Math.random() - 0.5), cur: 0 }) },
            { label: "Сначала", icon: RotateCcw, run: () => resetTurns(b, ids) },
          ]),
        ]),
      ];
    }

    case "buzzer":
      return [
        S("main", undefined, [
          f.btns([{ label: "Новый раунд", icon: RotateCcw, primary: true, run: () => resetBuzz(b, ids) }]),
          f.str("title", "Вопрос или надпись", { ph: "Кто первый?", max: 120 }),
          f.seg("snd", "Звук нажатия", [["buzz", "Гудок"], ["bell", "Звонок"], ["pop", "Щелчок"], ["none", "Нет"]], "buzz"),
          one && f.info(buzzesOf(p).length ? `Нажали: ${buzzesOf(p).map((x) => x.n).join(", ")}` : "Пока никто не нажал"),
        ]),
      ];

    case "checklist":
      return [
        S("main", undefined, [
          title("Чек-лист"),
          one && {
            k: "list",
            key: "cl",
            label: "Пункты",
            add: "Добавить пункт",
            ph: "Что сделать",
            min: 0,
            max: 100,
            get: () => (p.cl ?? []).map((x) => ({ id: x.id, t: x.t })),
            set: (rows) => c.put({ cl: rows.map((r) => ({ id: r.id, t: r.t })) }),
            make: () => ({ id: rid(), t: "" }),
          },
          f.tog("hd", "Прятать выполненные"),
          f.btns([
            { label: "Отметить все", run: () => b.view.updateMany(views.map((x) => [x.id, checklistPatch(x, "all") as Partial<NodeData>])) },
            { label: "Снять отметки", icon: RotateCcw, run: () => b.view.updateMany(views.map((x) => [x.id, checklistPatch(x, "clear") as Partial<NodeData>])) },
          ]),
        ]),
      ];

    case "input":
      return [
        S("main", undefined, [
          f.str("title", "Подпись", { ph: "Поле ввода", max: 80 }),
          f.seg("it", "Тип", [["text", "Текст"], ["num", "Число"]], "text"),
          f.str("ph", "Подсказка в пустом поле", { ph: "Введите…", max: 80 }),
          p.it === "num" && f.str("unit", "Единица", { ph: "₽, кг", max: 12 }),
          f.str("iv", "Значение", { max: 500 }),
        ]),
      ];

    case "calendar":
      return [
        S("main", undefined, [
          f.str("title", "Название", { ph: "Без названия", max: 60 }),
          {
            k: "text",
            key: "ym",
            label: "Месяц",
            ph: "Текущий",
            hint: "Например, 2025-09. Пусто — всегда текущий месяц",
            max: 7,
            get: () => p.ym ?? "",
            set: (s) => {
              const m = /^(\d{4})-(\d{1,2})$/.exec(s.trim());
              if (s.trim() && !m) return toasts.show("Нужен месяц вида 2025-09");
              c.put({ ym: m ? `${m[1]}-${m[2]!.padStart(2, "0")}` : undefined });
            },
          },
          one && f.info(`Отмечено дней: ${markedDays(p)}`),
          f.btns([{ label: "Очистить отметки", icon: RotateCcw, run: () => clearDays(b, ids) }]),
        ]),
      ];

    case "icon":
      return [
        S("main", undefined, [
          { k: "icon", key: "ic", label: "Значок", get: () => p.ic, set: (ic) => c.put({ ic }) },
          { k: "seg", key: "isw", label: "Линии", opts: [["1.5", "Тонкие"], ["2", "Обычные"], ["2.6", "Жирные"]], get: () => String(p.isw ?? 2), set: (x) => c.put({ isw: x === "2" ? undefined : Number(x) }) },
          f.str("title", "Подпись", { ph: "Без подписи", max: 40 }),
        ]),
      ];

    case "token":
      return [
        S("main", undefined, [
          f.seg("tk", "Форма", [["pawn", "Пешка"], ["circle", "Круг"], ["square", "Квадрат"], ["hex", "Шестигранник"], ["star", "Звезда"]], "pawn", "chips"),
          f.str("title", "Надпись", { ph: "Буква, число или эмодзи", max: 4 }),
        ]),
      ];

    case "words": {
      const n = one ? wordsCount(p) : 0;
      return [
        S("main", undefined, [
          f.str("title", "Вопрос", { ph: "Одно слово о встрече", max: 120 }),
          f.num("max", "Слов от каждого", { int: true, stepper: true, min: 1, max: 20, def: 3 }),
          one && f.info(n ? `Всего слов: ${n}` : "Пока никто не ответил"),
          f.btns([{ label: "Очистить ответы", icon: RotateCcw, run: () => clearWords(b, ids) }]),
        ]),
      ];
    }

    case "spoiler":
      return [
        S("main", undefined, [
          f.btns([{ label: views.every((x) => x.props.on) ? "Спрятать" : "Открыть всем", icon: RotateCcw, primary: true, run: () => revealAll(b, ids) }]),
          f.str("title", "Надпись на обложке", { ph: "Нажмите, чтобы открыть", max: 120 }),
          f.str("bt", "Что внутри", { ph: "Сюрприз! 🎉", lines: 3, max: 600 }),
          f.seg("sm", "Открывается", [["all", "У всех сразу"], ["self", "У каждого своё"]], "all"),
        ]),
      ];

    /* --------------------------- разработка и дизайн (1.3) --------------------------- */

    case "kanban": {
      const [done, all] = kanbanDone(p);
      return [
        S("main", undefined, [
          title("Канбан"),
          one && {
            k: "list",
            key: "kb",
            label: "Колонки",
            add: "Добавить колонку",
            ph: "Название колонки",
            color: true,
            num: "Лимит",
            hint: "Лимит — сколько карточек можно держать в колонке (0 — без лимита). Последняя колонка считается «готово».",
            min: 1,
            max: 8,
            get: () => kanbanCols(p).map((x) => ({ id: x.id, t: x.t, c: x.c, v: x.lim ?? 0 })),
            set: (rows) => c.put({ kb: rows.map((r) => ({ id: r.id, t: r.t, ...(r.c ? { c: r.c } : {}), ...(r.v && r.v > 0 ? { lim: Math.round(r.v) } : {}) })) }),
            make: (n) => ({ id: rid(), t: `Колонка ${n + 1}`, c: PLAYER_COLORS[n % PLAYER_COLORS.length]!, v: 0 }),
          },
          one && f.info(all ? `Готово ${done} из ${all}` : "Пока нет карточек: «+» у колонки выделенного канбана"),
          f.btns([
            {
              label: "Убрать готовые",
              icon: RotateCcw,
              disabled: one && !done,
              run: async () => {
                if (await ask({ title: "Убрать готовые карточки?", text: "Карточки из последней колонки будут удалены.", ok: "Убрать", danger: true })) clearDone(b, ids);
              },
            },
          ]),
        ]),
      ];
    }

    case "roadmap":
      return [
        S("main", undefined, [
          title("Дорожная карта"),
          f.seg("pu", "Шкала", PERIOD_UNITS as Opt[], "w", "select"),
          f.num("pn", "Сколько периодов", { int: true, stepper: true, min: 2, max: 36, def: 8, half: true }),
          f.num("ps", p.pu === "m" ? "С месяца (0 — янв.)" : "Начать с номера", {
            int: true,
            stepper: true,
            min: p.pu === "m" ? 0 : -999,
            max: p.pu === "m" ? 11 : 9999,
            def: p.pu === "m" ? new Date().getMonth() : 1,
            half: true,
          }),
          f.num("cur", "Сейчас — период №", {
            int: true,
            stepper: true,
            min: 0,
            max: periodCount(p),
            empty: true,
            ph: p.pu === "m" ? "по календарю" : "не показывать",
            hint: p.pu === "m" ? "Для месяцев отметка «сейчас» ставится по календарю" : "Линия «сейчас» на этом периоде",
          }),
          one && f.info(`Этапов: ${Object.keys(p).filter((k) => k.startsWith("rb:")).length} · готово ${Math.round(roadShare(p) * 100)} %. Щелчок по этапу выделенной карты — цвет, готовность, веха.`),
        ]),
      ];

    case "stats":
      return [
        S("main", undefined, [
          { k: "emoji", key: "emoji", label: "Портрет", get: () => p.emoji, set: (e) => c.put({ emoji: e }) },
          f.str("title", "Имя", { ph: "Персонаж", max: 60 }),
          f.str("desc", "Класс или роль", { ph: "Маг 5 уровня", max: 80 }),
          one && {
            k: "list",
            key: "pl",
            label: "Характеристики",
            add: "Добавить",
            ph: "Здоровье, сила…",
            color: true,
            num: "Максимум",
            hint: "С максимумом — шкала (здоровье 80 / 100); 0 — просто число",
            min: 0,
            max: 12,
            get: () => statsOf(p).map((x) => ({ id: x.id, t: x.t, c: x.c, v: x.m ?? 0 })),
            set: (rows) => c.put({ pl: rows.map((r) => ({ id: r.id, t: r.t, c: r.c ?? "blue", ...(r.v && r.v > 0 ? { m: r.v } : {}) })) }),
            make: (n) => ({ id: rid(), t: "", c: PLAYER_COLORS[n % PLAYER_COLORS.length]!, v: 0 }),
          },
          f.str("bt", "Заметки", { ph: "Умения, снаряжение, история", lines: 3, max: 1000 }),
          f.btns([
            {
              label: "Восстановить шкалы",
              icon: RotateCcw,
              title: "Значения со шкалой — до максимума",
              run: () => b.view.updateMany(views.map((x) => [x.id, Object.fromEntries(statsOf(x.props).filter((st) => st.m).map((st) => [`sc:${st.id}`, st.m])) as Partial<NodeData>])),
            },
          ]),
        ]),
      ];

    case "loot": {
      const ch = lootChances(p);
      return [
        S("main", undefined, [
          f.btns([{ label: (p.count ?? 1) > 1 ? `Открыть ×${p.count}` : "Открыть", icon: Dices, primary: true, run: () => rollLoot(b, ids) }]),
          title("Таблица добычи"),
          one && {
            k: "list",
            key: "lo",
            label: "Предметы",
            add: "Добавить предмет",
            ph: "Предмет",
            color: true,
            num: "Вес",
            hint: "Шанс = вес предмета / сумма весов. Цвет — редкость.",
            min: 1,
            max: 30,
            get: () => lootItems(p).map((x) => ({ id: x.id, t: x.t, c: x.c, v: x.w })),
            set: (rows) => c.put({ lo: rows.map((r) => ({ id: r.id, t: r.t, w: Math.max(0, r.v ?? 1), ...(r.c ? { c: r.c } : {}) })), drop: null }),
            make: (n) => ({ id: rid(), t: "", c: RARITY[Math.min(n, RARITY.length - 1)]![0], v: Math.max(1, 50 - n * 10) }),
          },
          one && !!ch.length && f.info(lootItems(p).map((x, i) => `${x.t || "Предмет"} — ${Math.round((ch[i] ?? 0) * 1000) / 10} %`).join(" · ")),
          f.num("count", "Предметов за раз", { int: true, stepper: true, min: 1, max: 10, def: 1 }),
          !!p.drop && f.btns([{ label: "Сбросить результат", icon: RotateCcw, run: () => c.put({ drop: null }) }], "loot-reset"),
        ]),
      ];
    }

    case "curve":
      return [
        S("main", undefined, [
          title("Кривая баланса"),
          one && {
            k: "list",
            key: "fs",
            label: "Формулы от x",
            add: "Добавить кривую",
            ph: "100 * x^1.5",
            color: true,
            hint: "x — уровень (или значение со входящей стрелки). Можно: + − * / ^, скобки, round(), floor(), min(), max(), sqrt(), log(), if(условие; да; нет)",
            min: 1,
            max: 6,
            get: () => curveSeries(p).map((x) => ({ id: x.id, t: x.f, c: x.c })),
            set: (rows) => {
              const old = new Map(curveSeries(p).map((x) => [x.id, x]));
              c.put({ fs: rows.map((r) => ({ id: r.id, f: r.t, ...(old.get(r.id)?.t ? { t: old.get(r.id)!.t } : {}), ...(r.c ? { c: r.c } : {}) })) });
            },
            make: (n) => ({ id: rid(), t: n ? "50 * x + 100" : "100 * x^1.5", c: ["violet", "orange", "cyan", "green", "pink", "yellow"][n % 6] }),
          },
          one && {
            k: "list",
            key: "fs-names",
            label: "Названия кривых",
            hint: "Для подписей и таблицы: «Опыт», «Урон»",
            min: curveSeries(p).length,
            max: curveSeries(p).length,
            ph: "Без названия",
            get: () => curveSeries(p).map((x) => ({ id: x.id, t: x.t ?? "" })),
            set: (rows) => c.put({ fs: curveSeries(p).map((x) => ({ ...x, t: rows.find((r) => r.id === x.id)?.t.trim() || undefined })) }),
          },
          f.num("min", "x от", { half: true, def: 1 }),
          f.num("max", "x до", { half: true, def: 20 }),
          f.seg("ys", "Шкала Y", [["lin", "Обычная"], ["log", "Логарифм"]], "lin"),
          f.tog("tb", "Таблица значений"),
        ]),
      ];

    case "palette": {
      const sw = swatchesOf(p);
      return [
        S("main", undefined, [
          title("Палитра"),
          f.seg("pm", "Вид", [["strip", "Полосы"], ["chips", "Образцы"]], "strip"),
          one && {
            k: "list",
            key: "sw",
            label: "Цвета",
            add: "Добавить цвет",
            ph: "Название цвета",
            color: true,
            hint: "Кружок — сам цвет (можно свой HEX). Щелчок по цвету на доске копирует HEX.",
            min: 0,
            max: 24,
            get: () => sw.map((x) => ({ id: x.id, t: x.t ?? "", c: x.hex })),
            set: (rows) =>
              c.put({
                sw: rows.map((r) => ({ id: r.id, hex: /^#[\da-f]{6}$/i.test(r.c ?? "") ? r.c!.toLowerCase() : (sw.find((x) => x.id === r.id)?.hex ?? "#7c6cf2"), ...(r.t.trim() ? { t: r.t.trim() } : {}) })),
              }),
            make: (n) => ({ id: rid(), t: "", c: ["#7c6cf2", "#f97316", "#22c55e", "#06b6d4", "#ec4899", "#eab308"][n % 6] }),
          },
          one &&
            !!sw.length &&
            f.btns([
              { label: "Копировать CSS", run: () => void copyText(paletteText(p, "css")).then((ok) => ok && toasts.show("CSS-переменные скопированы", { kind: "ok", ms: 1600 })) },
              { label: "Копировать HEX", run: () => void copyText(paletteText(p, "hex")).then((ok) => ok && toasts.show("Список HEX скопирован", { kind: "ok", ms: 1600 })) },
            ]),
        ]),
      ];
    }

    case "tilemap": {
      const all = tilesOf(p);
      const ground = all.filter((x) => !isObjectTile(x));
      const things = all.filter((x) => isObjectTile(x));
      const [w, h] = mapSize(p);
      const emojiOf = (raw: string, prev?: string): [string, string] => {
        const t = raw.trim();
        const first = [...new Intl.Segmenter("ru", { granularity: "grapheme" }).segment(t)][0]?.segment ?? "";
        if (first && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first)) return [first, t.slice(first.length).trim()];
        return [prev ?? "⭐", t];
      };
      const resize = (gw: number | null, gh: number | null) => {
        const nw = clampN(Math.round(gw ?? w), 2, MAP_MAX);
        const nh = clampN(Math.round(gh ?? h), 2, MAP_MAX);
        // карта растёт вместе с объектом: клетка остаётся того же размера
        const cell = Math.min((v.w - 20) / w, (v.h - 76) / h);
        c.put({ gw: nw === 16 ? undefined : nw, gh: nh === 10 ? undefined : nh, ...(one && cell > 4 ? { w: Math.round(clampN(cell * nw + 20, 160, 4000)), h: Math.round(clampN(cell * nh + 76, 120, 4000)) } : {}) });
      };
      return [
        S("main", undefined, [
          title("Карта уровня"),
          { k: "num", key: "gw", label: "Ширина, клеток", half: true, int: true, stepper: true, min: 2, max: MAP_MAX, get: () => w, set: (n) => resize(n, null) },
          { k: "num", key: "gh", label: "Высота, клеток", half: true, int: true, stepper: true, min: 2, max: MAP_MAX, get: () => h, set: (n) => resize(null, n) },
          { k: "select", key: "gb", label: "Фон", opts: [["", "Пусто"], ...ground.map((x) => [x.id, x.t] as Opt)], get: () => p.gb ?? "", set: (gb) => c.put({ gb: gb || undefined }) },
          f.tog("leg", "Легенда под картой", undefined, true),
          one && {
            k: "list",
            key: "tiles-ground",
            label: "Местность",
            add: "Добавить",
            ph: "Трава, вода…",
            color: true,
            min: 0,
            max: 16,
            get: () => ground.map((x) => ({ id: x.id, t: x.t, c: x.c })),
            set: (rows) => c.put({ tiles: [...rows.map((r) => ({ id: r.id, t: r.t, c: r.c ?? "#888888", ...(ground.find((x) => x.id === r.id)?.e ? { e: ground.find((x) => x.id === r.id)!.e } : {}) })), ...things] }),
            make: () => ({ id: rid(), t: "", c: "#8b6b4a" }),
          },
          one && {
            k: "list",
            key: "tiles-things",
            label: "Предметы",
            hint: "Эмодзи в начале названия — значок на карте: «🗝️ Ключ»",
            add: "Добавить",
            ph: "🗝️ Ключ",
            min: 0,
            max: 24,
            get: () => things.map((x) => ({ id: x.id, t: `${x.e ?? ""} ${x.t}`.trim() })),
            set: (rows) =>
              c.put({
                tiles: [
                  ...ground,
                  ...rows.map((r) => {
                    const [e, t] = emojiOf(r.t, things.find((x) => x.id === r.id)?.e);
                    return { id: r.id, t: t || "Предмет", e };
                  }),
                ],
              }),
            make: () => ({ id: rid(), t: "⭐ " }),
          },
          f.btns([
            { label: "Остров", title: "Нарисовать остров заново", run: () => b.view.updateMany(views.map((x) => [x.id, { ...clearMapPatch(x.props), ...islandPatch(...mapSize(x.props)) } as Partial<NodeData>])) },
            {
              label: "Очистить",
              icon: RotateCcw,
              danger: true,
              run: async () => {
                if (await ask({ title: "Очистить карту?", text: "Все клетки и предметы будут стёрты.", ok: "Очистить", danger: true })) b.view.updateMany(views.map((x) => [x.id, clearMapPatch(x.props) as Partial<NodeData>]));
              },
            },
          ]),
          f.info("Выделите карту: снизу появятся кисть, заливка и ластик."),
        ]),
      ];
    }

    case "estimate": {
      const n = one ? pokerVotes(p).length : 0;
      const open = views.every((x) => x.props.on);
      return [
        S("main", undefined, [
          f.btns([
            { label: open ? "Скрыть карты" : "Открыть карты", primary: !open, run: () => pokerReveal(b, ids, !open) },
            { label: "Новый раунд", icon: RotateCcw, run: () => pokerReset(b, ids) },
          ]),
          f.str("title", "Что оцениваем", { ph: "Оценка задачи", max: 120 }),
          f.seg("pk", "Колода", POKER_KINDS as Opt[], "fib", "select"),
          p.pk === "custom" && {
            k: "text",
            key: "faces",
            label: "Свои карты",
            ph: "1, 2, 3, 5, 8, ?",
            hint: "Через запятую, до 24 карт",
            max: 300,
            get: () => (p.faces ?? []).join(", "),
            set: (t) => c.put({ faces: t.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 24) }),
          },
          one && f.info(n ? `Выбрали карту: ${n}` : "Пока никто не выбрал"),
        ]),
      ];
    }
  }
  return [];
}

/* --------------------------- общие разделы --------------------------- */

function textSection(c: Ctx): Section | null {
  const { views } = c;
  const f = mk(c);
  const fonts = views.every((x) => FONT_TYPES.has(x.type));
  const sized = views.every((x) => x.type === "note" || x.type === "text" || x.type === "shape" || (x.type === "path" && x.textValue.trim() !== ""));
  const aligned = views.every((x) => x.type === "note" || x.type === "text" || x.type === "shape");
  if (!fonts && !sized) return null;
  const fields = [
    sized && f.seg("size", "Размер", TEXT_OPTS, views[0]!.type === "path" ? "s" : "m"),
    aligned && f.seg("align", "Выравнивание", ALIGN_OPTS, "left"),
    fonts && f.seg("font", "Шрифт", FONTS.map((x) => [x.id, x.label] as Opt), "sans", "select"),
  ].filter(Boolean) as Field[];
  return fields.length ? { id: "text", title: "Текст", fields } : null;
}

function geometrySection(c: Ctx): Section | null {
  const { b, views, v, ids, one } = c;
  if (views.some((x) => x.type === "path" || x.type === "comment")) return null;
  const s = b.view;
  const box = () => s.boundsOfIds(ids) ?? v.rect;
  const R = Math.round;
  const same = (f: (x: NodeView) => number) => (views.every((x) => R(f(x)) === R(f(v))) ? R(f(v)) : null);
  const fitAll = views.every((x) => x.fit);
  const fields: Field[] = [
    {
      k: "num",
      key: "gx",
      label: "X",
      half: true,
      int: true,
      get: () => R(one ? v.x : box().x),
      set: (n) => {
        if (n === null) return;
        const dx = n - (one ? v.x : box().x);
        s.updateMany(views.map((x) => [x.id, { x: R(x.x + dx) }]));
      },
    },
    {
      k: "num",
      key: "gy",
      label: "Y",
      half: true,
      int: true,
      get: () => R(one ? v.y : box().y),
      set: (n) => {
        if (n === null) return;
        const dy = n - (one ? v.y : box().y);
        s.updateMany(views.map((x) => [x.id, { y: R(x.y + dy) }]));
      },
    },
    { k: "num", key: "gw", label: "Ширина", half: true, int: true, min: 20, max: 20000, ph: "разная", get: () => same((x) => x.w), set: (n) => n !== null && s.updateMany(views.map((x) => [x.id, { w: clampN(R(n), 20, 20000) }])) },
    {
      k: "num",
      key: "gh",
      label: "Высота",
      half: true,
      int: true,
      min: 20,
      max: 20000,
      ph: "разная",
      disabled: fitAll,
      hint: fitAll ? "по содержимому" : undefined,
      get: () => same((x) => x.H),
      set: (n) => n !== null && s.updateMany(views.filter((x) => !x.fit).map((x) => [x.id, { h: clampN(R(n), 20, 20000) }])),
    },
  ];
  if (!views.some((x) => NO_TURN.has(x.type)))
    fields.push({
      k: "num",
      key: "gr",
      label: "Поворот",
      unit: "°",
      half: true,
      int: true,
      stepper: true,
      step: 15,
      min: -360,
      max: 360,
      ph: "разный",
      get: () => same((x) => (x.r * 180) / Math.PI),
      set: (n) => {
        if (n === null) return;
        const deg = ((R(n) % 360) + 540) % 360 - 180;
        s.updateMany(views.map((x) => [x.id, { r: deg ? (deg * Math.PI) / 180 : 0 }]));
      },
    });
  fields.push({
    k: "btns",
    key: "order",
    btns: [
      { label: "Вперёд", icon: ArrowUpToLine, title: "На передний план", run: () => s.reorder(ids, "top") },
      { label: "Назад", icon: ArrowDownToLine, title: "На задний план", run: () => s.reorder(ids, "bottom") },
      { label: "Копия", title: "Дублировать", run: () => duplicate(b, ids) },
    ],
  });
  return { id: "geo", title: "Размер и положение", fields };
}

/** Все разделы вкладки «Настройки». */
export function inspectFor(b: Board, views: NodeView[]): Section[] {
  const list = views.filter((x) => x.type !== "comment");
  if (!list.length) return [];
  const v = list[0]!;
  const ids = list.map((x) => x.id);
  const c: Ctx = {
    b,
    views: list,
    v,
    p: v.props,
    ids,
    one: list.length === 1,
    put: (patch) => b.view.updateMany(ids.map((id) => [id, patch as Partial<NodeData>])),
  };
  const type = list.every((x) => x.type === v.type) ? v.type : null;
  const out: Section[] = type ? typeSections(c, type).filter((s) => s.fields.length) : [];
  // цвет — первым полем: им пользуются чаще всего
  if (list.every((x) => !NO_COLOR.has(x.type))) {
    const color: Field = { k: "color", key: "color", label: "Цвет", none: "Обычный", get: () => v.props.color, set: (col) => c.put({ color: col && col !== "default" ? col : undefined }) };
    if (out[0] && !out[0].title) out[0].fields.unshift(color);
    else out.unshift({ id: "color", fields: [color] });
  }
  const text = textSection(c);
  if (text) out.push(text);
  const geo = geometrySection(c);
  if (geo) out.push(geo);
  return out;
}

/** Есть ли у объекта своя логика (события или действия) — показывать ли вкладку. */
export const LOGIC_HINT_TYPES = new Set<NodeType>(["task", "counter", "dice", "progress", "timer", "poll", ...WIDGET_TYPES]);
