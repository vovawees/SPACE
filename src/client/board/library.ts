/* Библиотека: всё, что можно поставить на доску из левой панели —
   щелчком (в центр экрана) или перетаскиванием (в точку). Тот же
   список используют палитра команд и бросание на холст. */
import type { Component } from "svelte";
import { toasts } from "../lib/toast.svelte.ts";
import type { Board } from "./board.svelte.ts";
import { brandSvg } from "./brands.ts";
import { intersects, type Pt } from "./geometry.ts";
import { SHAPE_KINDS, SHAPE_LABELS, defaults, type NodeData, type NodeType, type ShapeKind } from "./model.ts";
import { pollData } from "./nodes/poll.ts";
import { emptyTable } from "./nodes/table.svelte.ts";
import { insertClip, place } from "./ops.ts";
import { shapeGlyph } from "./shapes.ts";
import { TEMPLATES, templateThumb } from "./templates.ts";
import Code from "@lucide/svelte/icons/square-code";
import FrameIcon from "@lucide/svelte/icons/frame";
import ListChecks from "@lucide/svelte/icons/list-checks";
import Music from "@lucide/svelte/icons/music";
import Package from "@lucide/svelte/icons/package";
import SquareCheck from "@lucide/svelte/icons/square-check";
import StickyNote from "@lucide/svelte/icons/sticky-note";
import Table2 from "@lucide/svelte/icons/table-2";
import Timer from "@lucide/svelte/icons/timer";
import Dices from "@lucide/svelte/icons/dices";
import Gauge from "@lucide/svelte/icons/gauge";
import Hash from "@lucide/svelte/icons/hash";
import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
import Type from "@lucide/svelte/icons/type";
import Upload from "@lucide/svelte/icons/upload";
import Vote from "@lucide/svelte/icons/vote";
import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
import ToggleRight from "@lucide/svelte/icons/toggle-right";
import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
import Star from "@lucide/svelte/icons/star";
import Clock from "@lucide/svelte/icons/clock";
import Hourglass from "@lucide/svelte/icons/hourglass";
import ChartColumn from "@lucide/svelte/icons/chart-column";
import ChartPie from "@lucide/svelte/icons/chart-pie";
import QrCode from "@lucide/svelte/icons/qr-code";
import FerrisWheel from "@lucide/svelte/icons/ferris-wheel";
import CircleDot from "@lucide/svelte/icons/circle-dot";
import CalendarCheck from "@lucide/svelte/icons/calendar-check";
import Sigma from "@lucide/svelte/icons/sigma";
import Cpu from "@lucide/svelte/icons/cpu";
import Globe from "@lucide/svelte/icons/globe";

export const LIB_MIME = "application/x-space-lib";

export type LibCat = "basic" | "widgets" | "shapes" | "stickers" | "templates" | "services";

export const LIB_CATS: { id: LibCat; label: string }[] = [
  { id: "basic", label: "Объекты" },
  { id: "widgets", label: "Виджеты и логика" },
  { id: "shapes", label: "Фигуры" },
  { id: "stickers", label: "Стикеры" },
  { id: "templates", label: "Шаблоны" },
  { id: "services", label: "Сервисы" },
];

type Icon = Component<Record<string, unknown>>;

export interface LibItem {
  id: string;
  cat: LibCat;
  label: string;
  words?: string;
  desc?: string;
  icon?: Icon;
  /** Свой SVG (фигуры, сервисы, миниатюры шаблонов) — только из кода. */
  svg?: string;
  emoji?: string;
  /** Для сервисов: пример адреса и что получится. */
  url?: string;
  /** Нужен диалог (адрес, выбор файла) — перетаскивать нельзя. */
  ask?: "url" | "file";
  /** Подраздел (группы шаблонов). */
  group?: string;
}

export const EMOJI_GROUPS: { name: string; list: string[] }[] = [
  { name: "Реакции", list: ["👍", "👎", "❤️", "🔥", "🎉", "😂", "😮", "😢", "😡", "🤔", "👀", "🙏", "💯", "✨", "👏", "🤝"] },
  { name: "Статусы", list: ["✅", "❌", "⚠️", "❓", "❗", "⏳", "🚧", "🔒", "📌", "⭐", "🏁", "🔴", "🟡", "🟢", "🔵", "🆕"] },
  { name: "Игры", list: ["🎮", "🕹️", "🎲", "♟️", "🃏", "🏆", "🥇", "🎯", "⚔️", "🛡️", "🏹", "🧙", "🐉", "👾", "🗺️", "🏰", "💎", "💰", "🧪", "💣", "👑", "🧩", "🪄", "🎧"] },
  { name: "Работа", list: ["💡", "📅", "⏰", "📈", "📉", "🛠️", "🐛", "📦", "💬", "📎", "🔗", "📝", "🎨", "🧠", "🚀", "🎬"] },
  { name: "Еда и отдых", list: ["🍕", "🍔", "🍿", "☕", "🍺", "🥤", "🍰", "🌮", "🏖️", "⛺", "🎤", "🎸"] },
  { name: "Лица", list: ["😀", "😁", "😅", "🥲", "😍", "🤩", "😎", "🥳", "😴", "🤯", "🥶", "🥵", "🤠", "😇", "🤓", "🙃", "😬", "🫠", "😱", "🤡", "👻", "💀", "🤖", "👽"] },
  { name: "Жесты", list: ["👋", "✌️", "🤞", "👌", "🤙", "💪", "🫶", "🙌", "👆", "👇", "👉", "👈", "✋", "🤟", "🫡", "🤌"] },
  { name: "Животные", list: ["🐶", "🐱", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐧", "🦄", "🐝", "🦋", "🐢", "🐙", "🦖", "🐳", "🦉", "🐌", "🦀", "🐞", "🐺", "🦥"] },
  { name: "Природа", list: ["☀️", "🌙", "🌟", "☁️", "🌈", "⚡", "❄️", "🌊", "🌸", "🌻", "🌲", "🍀", "🍁", "🌵", "💧", "🌍"] },
  { name: "Символы", list: ["➡️", "⬅️", "⬆️", "⬇️", "↔️", "🔁", "➕", "➖", "✖️", "➗", "💲", "♻️", "⚙️", "🔔", "🔑", "🏷️", "📍", "🎵", "✔️", "🔺", "🔻", "💠", "🔶", "🔷"] },
  { name: "Флаги", list: ["🏳️", "🏴", "🚩", "🏁", "🏳️‍🌈", "🇷🇺", "🇺🇦", "🇧🇾", "🇰🇿", "🇺🇸", "🇬🇧", "🇩🇪", "🇫🇷", "🇯🇵", "🇨🇳", "🇪🇺"] },
];

const BASIC: LibItem[] = [
  { id: "note", cat: "basic", label: "Заметка", words: "стикер карточка текст", icon: StickyNote },
  { id: "text", cat: "basic", label: "Текст", words: "надпись заголовок", icon: Type },
  { id: "task", cat: "basic", label: "Задача", words: "дело todo срок исполнитель", icon: SquareCheck },
  { id: "checklist", cat: "basic", label: "Список дел", words: "чеклист задачи todo", icon: ListChecks },
  { id: "table", cat: "basic", label: "Таблица", words: "сетка ячейки excel csv", icon: Table2 },
  { id: "poll", cat: "basic", label: "Опрос", words: "голосование выбор vote", icon: Vote },
  { id: "timer", cat: "basic", label: "Таймер", words: "время обратный отсчёт секундомер", icon: Timer },
  { id: "counter", cat: "basic", label: "Счётчик", words: "счёт очки баллы игра число голоса", icon: Hash },
  { id: "dice", cat: "basic", label: "Кубики", words: "кубик кости d6 d20 бросок игра случай", icon: Dices },
  { id: "progress", cat: "basic", label: "Прогресс", words: "полоса процент готовность этапы", icon: Gauge },
  { id: "comment", cat: "basic", label: "Комментарий", words: "обсуждение булавка вопрос замечание", icon: MessageSquarePlus },
  { id: "code", cat: "basic", label: "Код", words: "программа сниппет скрипт", icon: Code },
  { id: "frame", cat: "basic", label: "Рамка", words: "группа секция область", icon: FrameIcon },
  { id: "shelf", cat: "basic", label: "Полка", words: "файлы папка архив", icon: Package },
  { id: "upload", cat: "basic", label: "Файлы…", words: "картинка видео музыка документ загрузить", icon: Upload, ask: "file" },
  { id: "audio", cat: "basic", label: "Музыка…", words: "звук аудио песня mp3", icon: Music, ask: "file" },
];

const WIDGETS: LibItem[] = [
  { id: "button", cat: "widgets", label: "Кнопка", words: "нажать действие клик ссылка переход логика", desc: "Нажимает любой; через стрелку — действие", icon: MousePointerClick },
  { id: "switch", cat: "widgets", label: "Переключатель", words: "вкл выкл тумблер флажок логика", icon: ToggleRight },
  { id: "slider", cat: "widgets", label: "Ползунок", words: "значение шкала диапазон бюджет громкость", icon: SlidersHorizontal },
  { id: "rating", cat: "widgets", label: "Оценка", words: "звёзды рейтинг лайк сердечки отзыв голос", icon: Star },
  { id: "status", cat: "widgets", label: "Статус", words: "этап состояние в работе готово метка", icon: CircleDot },
  { id: "tracker", cat: "widgets", label: "Трекер", words: "привычки дни недели отметки серия чек квест этапы", icon: CalendarCheck },
  { id: "wheel", cat: "widgets", label: "Колесо фортуны", words: "рулетка случай выбор жребий кто первый игра", icon: FerrisWheel },
  { id: "clock", cat: "widgets", label: "Часы", words: "время пояс город мировые часы", icon: Clock },
  { id: "clocks", cat: "widgets", label: "Мировые часы", words: "время пояса города команда москва лондон нью-йорк", icon: Globe },
  { id: "countdown", cat: "widgets", label: "Отсчёт до даты", words: "обратный отсчёт дедлайн событие дата праздник", icon: Hourglass },
  { id: "chart", cat: "widgets", label: "Диаграмма", words: "график столбцы данные статистика bar chart", icon: ChartColumn },
  { id: "pie", cat: "widgets", label: "Круговая", words: "диаграмма круг доли pie donut кольцо", icon: ChartPie },
  { id: "calc", cat: "widgets", label: "Вычисление", words: "сумма среднее формула итог калькулятор логика", icon: Sigma },
  { id: "gate", cat: "widgets", label: "Логический блок", words: "и или не условие логика все любой gate", icon: Cpu },
  { id: "qr", cat: "widgets", label: "QR-код", words: "qr код ссылка телефон сканировать", icon: QrCode },
];

const SHAPES: LibItem[] = SHAPE_KINDS.map((k) => ({ id: `shape:${k}`, cat: "shapes" as const, label: SHAPE_LABELS[k], words: "фигура блок-схема", svg: shapeGlyph(k, 26, 1.6) }));

const STICKERS: LibItem[] = EMOJI_GROUPS.flatMap((g) => g.list.map((e) => ({ id: `sticker:${e}`, cat: "stickers" as const, label: e, words: g.name.toLowerCase(), emoji: e })));

const TPL: LibItem[] = TEMPLATES.map((t) => ({ id: `tpl:${t.id}`, cat: "templates" as const, label: t.label, desc: t.desc, words: `${t.words} ${t.group.toLowerCase()}`, group: t.group, svg: templateThumb(t.build()) }));

const SERVICES: LibItem[] = (
  [
    ["github", "GitHub", "Репозиторий, задача, PR, gist или файл с кодом", "https://github.com/owner/repo"],
    ["youtube", "YouTube", "Видео прямо на доске", "https://youtu.be/…"],
    ["figma", "Figma", "Живой макет", "https://www.figma.com/design/…"],
    ["gdocs", "Google Документы", "Документ, таблица или презентация", "https://docs.google.com/…"],
    ["spotify", "Spotify", "Трек, альбом или плейлист с плеером", "https://open.spotify.com/…"],
    ["steam", "Steam", "Игра: обложка, цена, жанры", "https://store.steampowered.com/app/…"],
    ["twitch", "Twitch", "Канал, запись или клип", "https://www.twitch.tv/…"],
    ["vk", "VK Видео", "Видео из ВКонтакте", "https://vk.com/video…"],
    ["wikipedia", "Википедия", "Статья с кратким содержанием", "https://ru.wikipedia.org/wiki/…"],
    ["npm", "npm", "Пакет: версия и описание", "https://www.npmjs.com/package/…"],
    ["codepen", "CodePen", "Живой пример кода", "https://codepen.io/…/pen/…"],
    ["soundcloud", "SoundCloud", "Трек с плеером", "https://soundcloud.com/…"],
    ["x", "X (Twitter)", "Пост", "https://x.com/…/status/…"],
    ["link", "Любая ссылка", "Карточка с превью или живая страница", "https://…"],
  ] as const
).map(([id, label, desc, url]) => ({ id: `svc:${id}`, cat: "services" as const, label, desc, url, svg: brandSvg(id, 22), words: "ссылка интеграция встроить " + id, ask: "url" as const }));

export const LIB_ITEMS: LibItem[] = [...BASIC, ...WIDGETS, ...SHAPES, ...STICKERS, ...TPL, ...SERVICES];

export function libItem(id: string): LibItem | undefined {
  return LIB_ITEMS.find((i) => i.id === id);
}

const norm = (t: string) => t.toLowerCase().replace(/ё/g, "е");

export function searchLib(q: string): LibItem[] {
  const query = norm(q.trim());
  if (!query) return [];
  return LIB_ITEMS.filter((i) => norm(`${i.label} ${i.words ?? ""} ${i.desc ?? ""}`).includes(query) || (i.emoji && q.includes(i.emoji)));
}

/** Свободное место около точки: новое не ложится поверх уже стоящего —
    ищется ближайшее по расширяющимся кольцам. Мелочь можно класть в рамку,
    а шаблон (со своими рамками) — только мимо чужих рамок. */
function freeSpot(b: Board, at: Pt, w: number, h: number, avoidFrames = false): Pt {
  const s = b.store;
  const pad = avoidFrames ? 48 : 24;
  const step = Math.max(40, Math.round(Math.min(w, h) / 8));
  const rings = 30;
  const reach = rings * step + Math.max(w, h) + pad;
  const area = { x: at.x - reach, y: at.y - reach, w: reach * 2, h: reach * 2 };
  const near = s.order
    .filter((v) => (avoidFrames || v.type !== "frame") && v.type !== "path" && v.type !== "ink")
    .map((v) => s.bounds(v))
    .filter((r) => intersects(r, area));
  const free = (p: Pt) => {
    const r = { x: p.x - w / 2 - pad, y: p.y - h / 2 - pad, w: w + pad * 2, h: h + pad * 2 };
    return !near.some((o) => intersects(r, o));
  };
  if (free(at)) return at;
  for (let ring = 1; ring <= rings; ring++) {
    const d = ring * step;
    const cands: Pt[] = [];
    for (let i = -ring; i <= ring; i++) {
      cands.push({ x: at.x + d, y: at.y + i * step }, { x: at.x + i * step, y: at.y + d }, { x: at.x - d, y: at.y + i * step }, { x: at.x + i * step, y: at.y - d });
    }
    // ближе к точке — лучше; при равенстве — правее и ниже (туда читают)
    cands.sort((a, c) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(c.x - at.x, c.y - at.y) || c.x - a.x || c.y - a.y);
    const hit = cands.find(free);
    if (hit) return hit;
  }
  return at;
}

export interface InsertResult {
  ids: string[];
  /** Сразу начать ввод текста. */
  edit?: string;
}

/** Поставить элемент библиотеки; at — центр (точка бросания или центр экрана). */
export function insertLib(b: Board, id: string, at: Pt, opts: { drop?: boolean } = {}): InsertResult | null {
  if (b.readonly) return null;
  const s = b.store;
  const it = libItem(id);
  if (!it) return null;
  const mk = (type: NodeType, extra: Partial<NodeData> = {}): InsertResult => {
    const d = { ...defaults(type), ...extra };
    const w = d.w ?? 200;
    const h = d.h ?? 120;
    const p = opts.drop ? at : freeSpot(b, at, w, h);
    const nid = place(b, type, p, extra);
    s.selection.set([nid]);
    if (!opts.drop) b.camera.reveal({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    return { ids: [nid], edit: type === "note" || type === "text" || type === "task" || type === "code" ? nid : undefined };
  };
  if (id.startsWith("shape:")) {
    const kind = id.slice(6) as ShapeKind;
    const r = mk("shape", { kind, fill: b.style.fill, stroke: b.style.stroke, dash: b.style.dash, color: b.style.color, ...(kind === "pill" ? { w: 200, h: 80 } : kind === "ellipse" || kind === "star" || kind === "heart" ? { w: 150, h: 150 } : {}) });
    b.shapeKind = kind;
    return r;
  }
  if (id.startsWith("sticker:")) return { ...mk("sticker", { emoji: it.emoji }), edit: undefined };
  if (id.startsWith("tpl:")) {
    const t = TEMPLATES.find((x) => `tpl:${x.id}` === id);
    if (!t) return null;
    const clip = t.build();
    let spot = at;
    if (!opts.drop) {
      const xs = clip.nodes.map((n) => [n.x, n.x + n.w]).flat();
      const ys = clip.nodes.map((n) => [n.y, n.y + n.h]).flat();
      spot = freeSpot(b, at, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), true);
    }
    const ids = insertClip(b, clip, { at: spot });
    return { ids };
  }
  switch (id) {
    case "note":
      return mk("note", { color: b.style.color });
    case "text":
      return mk("text", { size: b.style.size });
    case "task":
      return mk("task");
    case "checklist":
      return { ...mk("note", { text: "**Список дел**\n- [ ] Первое\n- [ ] Второе\n- [ ] Третье", color: b.style.color, w: 280 }), edit: undefined };
    case "table":
      return mk("table", emptyTable(3, 3) as Partial<NodeData>);
    case "poll":
      return { ...mk("poll", pollData("", ["Вариант 1", "Вариант 2", "Вариант 3"])), edit: undefined };
    case "timer":
      return mk("timer");
    case "counter":
      return mk("counter");
    case "dice":
      return mk("dice");
    case "progress":
      return mk("progress");
    case "comment":
      return mk("comment");
    case "code":
      return mk("code");
    case "frame":
      return mk("frame");
    case "shelf":
      return mk("shelf");
    case "button":
    case "switch":
    case "slider":
    case "rating":
    case "status":
    case "tracker":
    case "wheel":
    case "clock":
    case "countdown":
    case "chart":
    case "calc":
    case "gate":
      return { ...mk(id), edit: undefined };
    case "pie":
      return mk("chart", { ct: "donut", w: 360, h: 240 });
    case "qr":
      return mk("qr", { url: location.origin + location.pathname });
    case "clocks": {
      const zones: [string, string][] = [
        ["", ""],
        ["Europe/London", ""],
        ["America/New_York", ""],
      ];
      const w = 200;
      const p0 = opts.drop ? at : freeSpot(b, at, w * 3 + 24, 120);
      const ids = zones.map(([tz], i) => place(b, "clock", { x: p0.x + (i - 1) * (w + 12), y: p0.y }, { tz: tz || undefined, w, h: 120 }));
      s.selection.set(ids);
      if (!opts.drop) b.camera.reveal({ x: p0.x - w * 1.5 - 12, y: p0.y - 60, w: w * 3 + 24, h: 120 });
      return { ids };
    }
  }
  return null;
}

/** Щелчок в библиотеке или команда палитры: поставить в центр экрана,
    шаблон — показать целиком, текстовое — сразу начать ввод. */
export function useLibItem(b: Board, id: string, opts: { animate?: boolean; left?: number } = {}): InsertResult | null {
  const it = libItem(id);
  // середина видимой части доски (слева может быть открыта библиотека)
  const cam = b.camera;
  const left = Math.min(opts.left ?? 0, cam.vw / 2);
  const r = insertLib(b, id, cam.toWorld((left + cam.vw) / 2, cam.vh / 2));
  if (!it || !r) return r;
  if (it.cat === "templates" && r.ids.length) {
    const box = b.store.boundsOfIds(r.ids);
    if (box) b.camera.fit(box, { maxZoom: 1, animate: opts.animate !== false });
    toasts.show(`Шаблон «${it.label}» добавлен`, { kind: "ok", ms: 1800 });
  }
  if (r.edit) b.ix.edit(r.edit, "end");
  return r;
}
