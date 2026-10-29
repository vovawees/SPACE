/* Библиотека: всё, что можно поставить на доску из левой панели —
   щелчком (в центр экрана) или перетаскиванием (в точку). Тот же
   список используют палитра команд и бросание на холст. */
import type { Component } from "svelte";
import { toasts } from "../lib/toast.svelte.ts";
import type { Board } from "./board.svelte.ts";
import { brandSvg } from "./brands.ts";
import { intersects, type Pt } from "./geometry.ts";
import { DEVICE_LABELS, DEVICE_SIZES, SHAPE_KINDS, SHAPE_LABELS, defaults, type DeviceKind, type NodeData, type NodeType, type ShapeKind } from "./model.ts";
import { islandPatch } from "./nodes/design.ts";
import { pollData } from "./nodes/poll.ts";
import { emptyTable } from "./nodes/table.svelte.ts";
import { insertClip, place } from "./ops.ts";
import { shapeGlyph } from "./shapes.ts";
import { TEMPLATES, templateThumb } from "./templates.ts";
import { TYPE_ICONS } from "./typeInfo.ts";
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
import Smartphone from "@lucide/svelte/icons/smartphone";
import Tablet from "@lucide/svelte/icons/tablet";
import AppWindow from "@lucide/svelte/icons/app-window";
import Monitor from "@lucide/svelte/icons/monitor";
import Gamepad2 from "@lucide/svelte/icons/gamepad-2";

export const LIB_MIME = "application/x-space-lib";

export type LibCat = "basic" | "widgets" | "games" | "design" | "shapes" | "stickers" | "templates" | "services";

export const LIB_CATS: { id: LibCat; label: string }[] = [
  { id: "basic", label: "Объекты" },
  { id: "widgets", label: "Виджеты и логика" },
  { id: "games", label: "Игры и встречи" },
  { id: "design", label: "Разработка и дизайн" },
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
  { name: "Флаги", list: ["🏳️", "🏴", "🚩", "🏴‍☠️", "🏳️‍🌈", "🇷🇺", "🇺🇦", "🇧🇾", "🇰🇿", "🇺🇸", "🇬🇧", "🇩🇪", "🇫🇷", "🇯🇵", "🇨🇳", "🇪🇺"] },
];

const BASIC: LibItem[] = [
  { id: "note", cat: "basic", label: "Заметка", words: "стикер карточка текст", icon: StickyNote },
  { id: "text", cat: "basic", label: "Текст", words: "надпись заголовок", icon: Type },
  { id: "task", cat: "basic", label: "Задача", words: "дело todo срок исполнитель", icon: SquareCheck },
  { id: "checklist", cat: "basic", label: "Чек-лист", words: "список дел чеклист задачи todo пункты галочки", desc: "Пункты с галочками и полосой готовности", icon: ListChecks },
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

const gi = (t: NodeType) => TYPE_ICONS[t] as Icon;

const GAMES: LibItem[] = [
  { id: "coin", cat: "games", label: "Монетка", words: "орёл решка жребий подбросить случай игра", desc: "Орёл или решка — с броском и звуком", icon: gi("coin") },
  { id: "deck", cat: "games", label: "Колода карт", words: "карты 36 52 таро тянуть перемешать игра покер дурак", desc: "Тяните карты, мешайте, своя колода", icon: gi("deck") },
  { id: "random", cat: "games", label: "Случайный выбор", words: "рандом жребий число кто вариант генератор лотерея", desc: "Число, вариант из списка или участник", icon: gi("random") },
  { id: "score", cat: "games", label: "Табло счёта", words: "очки счёт команды игроки баллы лидер турнир", desc: "Команды и очки, лидер с короной", icon: gi("score") },
  { id: "turns", cat: "games", label: "Очередь ходов", words: "ход очередь игрок раунд порядок кто ходит", desc: "Чей ход и какой раунд", icon: gi("turns") },
  { id: "buzzer", cat: "games", label: "Кто первый", words: "кнопка викторина своя игра buzzer реакция первый", desc: "Кнопка для викторин: кто нажал раньше", icon: gi("buzzer") },
  { id: "flipcard", cat: "games", label: "Карточка-перевёртыш", words: "вопрос ответ флеш карта учить переворот", desc: "Вопрос спереди, ответ сзади", icon: gi("flipcard") },
  { id: "spoiler", cat: "games", label: "Сюрприз", words: "спойлер скрыто секрет открыть подарок тайна", desc: "Скрытый текст — открывается нажатием", icon: gi("spoiler") },
  { id: "token", cat: "games", label: "Фишка", words: "пешка фигура игрок метка настольная игра карта", desc: "Двигайте по карте или полю", icon: gi("token") },
  { id: "stopwatch", cat: "games", label: "Секундомер", words: "время круг замер старт стоп лап", desc: "С кругами и общим временем", icon: gi("stopwatch") },
  { id: "words", cat: "games", label: "Облако слов", words: "слова ассоциации опрос мнения ретро встреча", desc: "Каждый пишет слово — растёт облако", icon: gi("words") },
  { id: "calendar", cat: "games", label: "Календарь", words: "месяц дни даты отметки кто когда может планирование", desc: "Отмечайте дни — видно, кто когда может", icon: gi("calendar") },
  { id: "input", cat: "games", label: "Поле ввода", words: "ввод текст число значение форма ответ логика", desc: "Общее поле: текст или число для логики", icon: gi("input") },
  { id: "icon", cat: "games", label: "Значок", words: "иконка пиктограмма символ значок картинка", desc: "Больше сотни значков любого цвета", icon: gi("icon") },
];

const DESIGN: LibItem[] = [
  { id: "kanban", cat: "design", label: "Канбан", words: "доска задач колонки спринт agile scrum todo в работе готово бэклог", desc: "Колонки и карточки — перетаскивайте задачи", icon: gi("kanban") },
  { id: "roadmap", cat: "design", label: "Дорожная карта", words: "roadmap план этапы гант сроки релиз недели месяцы кварталы спринты вехи", desc: "Этапы и вехи на шкале времени", icon: gi("roadmap") },
  { id: "estimate", cat: "design", label: "Покер планирования", words: "оценка задач scrum planning poker голос вслепую фибоначчи story points", desc: "Оценки вслепую — потом все открывают", icon: gi("estimate") },
  { id: "stats", cat: "design", label: "Карточка персонажа", words: "персонаж герой характеристики здоровье hp мана атака rpg npc враг юнит класс", desc: "Портрет, характеристики и шкалы", icon: gi("stats") },
  { id: "loot", cat: "design", label: "Таблица добычи", words: "лут дроп награда шанс вероятность редкость сундук гача рандом веса", desc: "Предметы с весами: шансы и «открыть»", icon: gi("loot") },
  { id: "curve", cat: "design", label: "Кривая баланса", words: "формула график опыт уровни прокачка урон экономика баланс функция рост", desc: "Графики формул: опыт, урон, цены", icon: gi("curve") },
  { id: "tilemap", cat: "design", label: "Карта уровня", words: "уровень тайлы клетки сетка карта локация левел дизайн пиксели подземелье", desc: "Рисуйте местность, ставьте предметы", icon: gi("tilemap") },
  { id: "palette", cat: "design", label: "Палитра", words: "цвета цвет hex стайлгайд дизайн бренд css переменные", desc: "Цвета проекта — копируйте HEX и CSS", icon: gi("palette") },
  { id: "dev:phone", cat: "design", label: "Экран телефона", words: "макет мобильное приложение айфон андроид прототип ui ux рамка", desc: "Рамка 390×844 с вырезом", icon: Smartphone },
  { id: "dev:tablet", cat: "design", label: "Экран планшета", words: "макет планшет ipad приложение прототип ui ux рамка", desc: "Рамка 768×1024", icon: Tablet },
  { id: "dev:browser", cat: "design", label: "Окно браузера", words: "макет сайт веб страница лендинг прототип ui ux рамка", desc: "Рамка 1280×800 с адресной строкой", icon: AppWindow },
  { id: "dev:window", cat: "design", label: "Окно программы", words: "макет приложение десктоп программа окно прототип ui рамка", desc: "Рамка 960×640 с заголовком", icon: Monitor },
  { id: "dev:game", cat: "design", label: "Экран игры", words: "макет игра интерфейс hud меню 16:9 экран прототип рамка", desc: "16:9 с безопасной зоной для HUD", icon: Gamepad2 },
];

const SHAPES: LibItem[] = SHAPE_KINDS.map((k) => ({ id: `shape:${k}`, cat: "shapes" as const, label: SHAPE_LABELS[k], words: "фигура блок-схема", svg: shapeGlyph(k, 26, 1.6) }));

/* Эмодзи, попавший в две группы, показывается в первой: ключи списка должны быть
   разными, иначе Svelte не отрисует раздел целиком. */
const seenEmoji = new Set<string>();
const STICKERS: LibItem[] = EMOJI_GROUPS.flatMap((g) =>
  g.list.filter((e) => !seenEmoji.has(e) && !!seenEmoji.add(e)).map((e) => ({ id: `sticker:${e}`, cat: "stickers" as const, label: e, words: g.name.toLowerCase(), emoji: e, group: g.name })),
);

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

export const LIB_ITEMS: LibItem[] = [...BASIC, ...WIDGETS, ...GAMES, ...DESIGN, ...SHAPES, ...STICKERS, ...TPL, ...SERVICES];

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
  if (id.startsWith("dev:")) {
    const dev = id.slice(4) as DeviceKind;
    const [w, h] = DEVICE_SIZES[dev] ?? [960, 640];
    return mk("frame", { dev, w, h, name: DEVICE_LABELS[dev] ?? "Макет", ...(dev === "browser" ? { url: "example.com" } : {}) });
  }
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
      return { ...mk("checklist", { color: b.style.color }), edit: undefined };
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
    case "stopwatch":
    case "coin":
    case "flipcard":
    case "deck":
    case "random":
    case "score":
    case "turns":
    case "buzzer":
    case "input":
    case "calendar":
    case "icon":
    case "token":
    case "words":
    case "spoiler":
    case "kanban":
    case "roadmap":
    case "stats":
    case "loot":
    case "curve":
    case "palette":
    case "estimate":
      return { ...mk(id), edit: undefined };
    case "tilemap":
      return { ...mk("tilemap", islandPatch(16, 10) as Partial<NodeData>), edit: undefined };
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
