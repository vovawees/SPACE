/* Модель узлов доски: типы, поля, значения по умолчанию.

   В Yjs каждый узел — Y.Map с плоскими полями. Геометрия (x, y, w, h, r),
   порядок (z — дробный индекс) и рамка-родитель (parent) общие для всех
   типов; остальное — свойства типа. Текст заметок/кода/подписей — Y.Text
   в поле text, чтобы одновременный ввод сливался посимвольно. */

export type NodeType =
  | "note"
  | "text"
  | "code"
  | "image"
  | "video"
  | "file"
  | "shelf"
  | "link"
  | "frame"
  | "shape"
  | "path"
  | "ink"
  | "sticker"
  | "table"
  | "task"
  | "poll"
  | "timer"
  | "audio"
  | "counter"
  | "dice"
  | "progress"
  | "comment"
  | "button"
  | "switch"
  | "slider"
  | "rating"
  | "clock"
  | "countdown"
  | "chart"
  | "qr"
  | "wheel"
  | "status"
  | "tracker"
  | "calc"
  | "gate"
  | "stopwatch"
  | "coin"
  | "flipcard"
  | "deck"
  | "random"
  | "score"
  | "turns"
  | "buzzer"
  | "checklist"
  | "input"
  | "calendar"
  | "icon"
  | "token"
  | "words"
  | "spoiler"
  | "kanban"
  | "roadmap"
  | "stats"
  | "loot"
  | "curve"
  | "palette"
  | "tilemap"
  | "estimate";

export const COLORS = ["default", "gray", "yellow", "orange", "red", "pink", "violet", "blue", "cyan", "green"] as const;
export type ColorName = (typeof COLORS)[number];

export const COLOR_LABELS: Record<ColorName, string> = {
  default: "Обычный",
  gray: "Серый",
  yellow: "Жёлтый",
  orange: "Оранжевый",
  red: "Красный",
  pink: "Розовый",
  violet: "Фиолетовый",
  blue: "Синий",
  cyan: "Бирюзовый",
  green: "Зелёный",
};

export function colorName(c: unknown): ColorName {
  return typeof c === "string" && (COLORS as readonly string[]).includes(c) ? (c as ColorName) : "default";
}

/** Свой цвет — #rrggbb из палитры браузера. */
export type HexColor = `#${string}`;
export type Color = ColorName | HexColor;

export const isHex = (c: unknown): c is HexColor => typeof c === "string" && /^#[\da-f]{6}$/i.test(c);

/** Имя цвета или свой #rrggbb; всё неизвестное — «Обычный». */
export function colorKey(c: unknown): Color {
  return isHex(c) ? (c.toLowerCase() as HexColor) : colorName(c);
}

export const colorCss = (c: unknown) => {
  const k = colorKey(c);
  return isHex(k) ? k : `var(--c-${k})`;
};

export const COLOR_ITEMS = COLORS.map((c) => ({ value: c, css: colorCss(c), label: COLOR_LABELS[c] }));

export type ShapeKind =
  | "rect"
  | "sharp"
  | "pill"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "octagon"
  | "pentagon"
  | "star"
  | "parallelogram"
  | "trapezoid"
  | "cylinder"
  | "document"
  | "process"
  | "delay"
  | "cloud"
  | "bubble"
  | "arrow"
  | "chevron"
  | "cross"
  | "heart"
  | "poly";
export type Fill = "none" | "tint" | "solid";
export type StrokeSize = "s" | "m" | "l" | "xl";
export type Dash = "solid" | "dash" | "dot";
export type Head = "none" | "arrow" | "triangle" | "triangle-o" | "dot" | "circle" | "diamond" | "diamond-o" | "bar" | "crow";
export const HEADS: Head[] = ["none", "arrow", "triangle", "triangle-o", "dot", "circle", "diamond", "diamond-o", "bar", "crow"];
export const HEAD_LABELS: Record<Head, string> = {
  none: "Без наконечника",
  arrow: "Стрелка",
  triangle: "Треугольник",
  "triangle-o": "Пустой треугольник",
  dot: "Точка",
  circle: "Кружок",
  diamond: "Ромб",
  "diamond-o": "Пустой ромб",
  bar: "Черта",
  crow: "«Много» (ER)",
};
/** Маршрут линии: прямая, плавная кривая или ломаная под прямыми углами. */
export type Route = "straight" | "curve" | "elbow";
export const ROUTE_LABELS: Record<Route, string> = { straight: "Прямая", curve: "Плавная", elbow: "Под прямым углом" };
export type HeadSize = "s" | "m" | "l";
export const HEAD_SCALE: Record<HeadSize, number> = { s: 0.7, m: 1, l: 1.45 };
export type TextSize = "s" | "m" | "l" | "xl";

export const STROKE_PX: Record<StrokeSize, number> = { s: 2, m: 3.5, l: 6, xl: 10 };
export const TEXT_PX: Record<TextSize, number> = { s: 16, m: 24, l: 36, xl: 56 };
export const INK_PX: Record<StrokeSize, number> = { s: 3, m: 6, l: 11, xl: 18 };

export interface Binding {
  id: string;
  /** Точка привязки в долях рамки цели (0..1). */
  u: number;
  v: number;
  /** false — «плавающий» конец: сам выбирает, где коснуться узла. */
  precise: boolean;
  /** Точка лежит на контуре: конец сидит на краю и выходит перпендикулярно. */
  edge?: boolean;
}

/** Исполнитель задачи (копия имени и цвета: человек мог уйти с доски). */
export interface Assignee {
  id: string;
  name: string;
  color: string;
}

export interface PollOption {
  id: string;
  t: string;
}

/** Голос в опросе: поле vote:<id человека>. */
export interface Vote {
  o: string[];
  n: string;
  c: string;
}

export type Priority = "low" | "mid" | "high";
export const PRIORITY_LABELS: Record<Priority, string> = { low: "Низкий", mid: "Средний", high: "Высокий" };

export interface ShelfItem {
  src: string;
  name: string;
  size: number;
  mime: string;
}

/** Все не-геометрические поля узла. Хранятся как простые значения. */
export interface NodeProps {
  color?: Color;
  locked?: boolean;
  createdBy?: string;
  /** Высота по содержимому (заметки, текст, код). */
  fit?: boolean;
  // текст и код
  size?: TextSize;
  align?: "left" | "center" | "right";
  lang?: string;
  view?: "code" | "preview";
  wrap?: boolean;
  title?: string;
  // файлы
  src?: string;
  preview?: string;
  natW?: number;
  natH?: number;
  name?: string;
  mime?: string;
  bytes?: number;
  pending?: boolean;
  // ссылки и видео
  url?: string;
  embed?: string;
  desc?: string;
  image?: string;
  icon?: string;
  site?: string;
  live?: boolean;
  embeddable?: boolean;
  /** Факты с сайта: ★ звёзды, язык, статус, версия, цена. */
  facts?: string[];
  // фигуры и линии
  kind?: ShapeKind;
  fill?: Fill;
  stroke?: StrokeSize;
  dash?: Dash;
  /** Точки: path — локальные [x,y]; ink — локальные [x,y,нажим]; poly — доли 0..1. */
  pts?: number[][];
  /** Устаревшее «плавная кривая» — то же, что route: "curve". */
  curve?: boolean;
  route?: Route;
  closed?: boolean;
  head0?: Head;
  head1?: Head;
  /** Размер наконечников. */
  hs?: HeadSize;
  /** Положение подписи вдоль линии, 0..1. */
  lt?: number;
  /** Свои «усы» наконечников: [длина, угол, длина, угол] (длина — в долях обычной). */
  hb0?: number[];
  hb1?: number[];
  /** Система отсчёта изломов: якоря концов [x0, y0, x1, y1] на момент записи точек. */
  rf?: number[];
  b0?: Binding | null;
  b1?: Binding | null;
  /** Исходный размер штриха (ink) — масштабирование без пересчёта точек. */
  ow?: number;
  oh?: number;
  // полка
  items?: ShelfItem[];
  // видео
  sync?: { playing: boolean; t: number; at: number; by: string } | null;
  // стикер
  emoji?: string;
  // таблица: id строк и столбцов, доли ширины столбцов, первая строка — шапка;
  // ячейки — отдельные поля c:<строка>:<столбец> (правки разных ячеек сливаются)
  rows?: string[];
  cols?: string[];
  cw?: number[];
  head?: boolean;
  // задача
  done?: boolean;
  who?: Assignee | null;
  due?: string | null;
  prio?: Priority | null;
  // опрос: варианты; голоса — поля vote:<id человека>
  opts?: PollOption[];
  multi?: boolean;
  // таймер: длительность; идёт — время окончания, на паузе — остаток (мс)
  dur?: number;
  end?: number | null;
  left?: number | null;
  /** Шаг кнопок ± (мс). */
  tstep?: number;
  /** Звук: none — без звука, иначе вид сигнала (у каждого типа свой по умолчанию). */
  snd?: string;
  /** Начинать заново, когда время вышло. */
  loop?: boolean;
  /** Надпись, когда время вышло / отсчёт закончился. */
  endt?: string;
  /** Вид таймера: полоса, кольцо, только цифры. */
  tv?: "bar" | "ring" | "none";
  // счётчик: база (+ поправки участников d:<id>) и шаг
  n0?: number;
  step?: number;
  // кубики: граней, сколько, последний бросок
  sides?: number;
  count?: number;
  roll?: { v: number[]; n: string; c: string; s: number } | null;
  /** Свои грани кубика (текст или эмодзи) — вместо чисел. */
  faces?: string[];
  /** Прибавка к сумме броска. */
  mod?: number;
  /** Что считать: все кубики, лучший или худший. */
  keep?: "all" | "hi" | "lo";
  /** Вид кубиков. */
  ds?: "classic" | "color" | "dark" | "glass";
  /** Показывать последние броски. */
  hist?: boolean;
  /** Последние броски (новые в конце). */
  rh?: { v: number[]; n: string; c: string; t: number }[];
  /** Счётчик: значение для «Сбросить». */
  rst?: number;
  // прогресс: 0..100 и деление на этапы
  pv?: number;
  steps?: number;
  /** Как подписать: проценты, «7 из 10», без числа. */
  pf?: "pct" | "frac" | "none";
  /** Кнопки −/+ на самой полосе. */
  pb?: boolean;
  // комментарий: обсуждение решено (сообщения — поля m:<id>)
  resolved?: boolean;
  // прозрачность 0.1..1 и шрифт текста
  opacity?: number;
  font?: FontName;
  // начертание текста (см. style.ts): толщина, курсив, регистр, интервалы, эффект
  tw?: "light" | "bold" | "heavy";
  ti?: boolean;
  tt?: "up" | "sc";
  tls?: "tight" | "wide" | "wider";
  tlh?: "tight" | "loose";
  tfx?: "shadow" | "outline" | "glow" | "pop";
  // оформление (см. style.ts)
  fc?: string;
  fc2?: string;
  ga?: number;
  tc?: string;
  bc?: string;
  bw?: number;
  bs?: "solid" | "dashed" | "dotted" | "double";
  rad?: number;
  shd?: "none" | "s" | "m" | "l" | "glow" | "neon";
  fx?: string;
  flip?: "h" | "v" | "hv";
  flt?: string;
  tag?: string;
  tagc?: string;
  /** Спрятан логикой: участникам не виден, редакторам — призраком. */
  hid?: boolean;
  /** Разовый эффект от логики (салют, вспышка, звук): номер и вид. */
  fxe?: { s: number; k: string } | null;
  // кнопка: последнее нажатие, вид, куда ведёт (адрес или #id объекта)
  press?: { s: number; n: string; c: string } | null;
  bv?: "solid" | "soft" | "outline";
  href?: string;
  // переключатель и логический блок: включён
  on?: boolean;
  // ползунок: значение и пределы (max — и число звёзд у оценки)
  sv?: number;
  min?: number;
  max?: number;
  unit?: string;
  // оценка: значок; голоса — поля rt:<id человека>
  ri?: "star" | "heart" | "fire" | "like";
  // часы: пояс, вид, секунды, 12-часовой формат, дата
  tz?: string;
  cv?: "digital" | "analog";
  sec?: boolean;
  h12?: boolean;
  date?: boolean;
  // обратный отсчёт: момент (мс)
  at?: number | null;
  // диаграмма
  ct?: "bar" | "line" | "pie" | "donut";
  data?: ChartPoint[];
  // колесо: последний запуск
  spin?: { s: number; a: number; i: number; n: string; c: string; at: number } | null;
  // статус: варианты и текущий
  sts?: { t: string; c: string }[];
  st?: number;
  // трекер: клеток; отметки — поля k:<номер>
  cells?: number;
  // вычисление
  op?: CalcOp;
  dec?: number;
  // логический блок
  gm?: GateMode;
  // логика на стрелке: когда что делать
  lg?: LogicRule | null;
  // секундомер: идёт с момента t0 (мс), накоплено до этого acc; круги — общее время на отметке
  t0?: number | null;
  acc?: number;
  laps?: number[];
  /** Секундомер: показывать сотые. */
  ms?: boolean;
  // монетка: последний бросок (v: 0 — первая сторона, 1 — вторая), подписи сторон, счёт
  coin?: { s: number; v: 0 | 1; n: string; c: string } | null;
  cf?: string[];
  ch?: number[];
  // карточка: лицо и оборот; on — перевёрнута у всех; self — каждый переворачивает у себя
  ft?: string;
  bt?: string;
  self?: boolean;
  // колода: набор, оставшиеся карты (номера), последняя вытянутая
  dk?: "36" | "52" | "custom";
  pile?: number[];
  top?: { i: number; s: number; n: string; c: string } | null;
  /** Колода: вытянутые (номера), последние в конце. */
  out?: number[];
  /** Колода: номер перетасовки (анимация у всех). */
  shf?: number;
  // случайное: что выбирать, результат, без повторов (уже выпавшие)
  rm?: "num" | "list" | "people";
  rnd?: { s: number; v: string; n: string; c: string } | null;
  uniq?: boolean;
  used?: string[];
  // табло и очередь ходов: игроки; очки — поля sc:<id игрока>
  pl?: Player[];
  cur?: number;
  rn?: number;
  /** Табло: сортировать по очкам. */
  sort?: boolean;
  // чек-лист: пункты; отметки — поля ck:<id пункта>
  cl?: { id: string; t: string }[];
  /** Чек-лист: прятать выполненные. */
  hd?: boolean;
  // поле ввода: значение, вид, подсказка
  iv?: string;
  it?: "text" | "num";
  ph?: string;
  // календарь: месяц «2025-07» (пусто — текущий), начало недели; отметки — поля k:<дата>
  ym?: string;
  // значок: имя иконки и толщина линий
  ic?: string;
  isw?: number;
  // фишка: форма
  tk?: "circle" | "square" | "pawn" | "star" | "hex";
  // «кто первый»: нажатия — поля bq:<id человека> (время)
  /** Скрытый текст: кому открывается по щелчку. */
  sm?: "all" | "self";
  // канбан: колонки; карточки — поля kc:<id карточки> (KanbanCard)
  kb?: KanbanCol[];
  // дорожная карта: сколько периодов, какие, с какого начинать; этапы — поля rb:<id> (RoadBar)
  pn?: number;
  pu?: PeriodUnit;
  ps?: number;
  // таблица добычи: предметы с весами; последний бросок (i — id выпавших)
  lo?: LootItem[];
  drop?: { s: number; i: string[]; n: string; c: string } | null;
  // кривая: формулы; шкала Y; таблица значений
  fs?: CurveSeries[];
  ys?: "lin" | "log";
  tb?: boolean;
  // палитра: цвета и вид
  sw?: Swatch[];
  pm?: "strip" | "chips";
  // карта уровня: размер сетки, плитки, фон; клетки — поля gt:<x>:<y> (местность) и go:<x>:<y> (предметы)
  gw?: number;
  gh?: number;
  tiles?: Tile[];
  gb?: string;
  leg?: boolean;
  // покер планирования: колода; карты участников — поля pp:<id человека>
  pk?: "fib" | "tshirt" | "pow2" | "custom";
  // рамка: вид устройства (экран телефона, окно браузера…)
  dev?: DeviceKind;
}

export interface KanbanCol {
  id: string;
  t: string;
  c?: string;
  /** Лимит карточек (WIP). */
  lim?: number;
}
/** Карточка канбана: поле kc:<id>. o — порядок в колонке. */
export interface KanbanCard {
  t: string;
  col: string;
  o: number;
  c?: string;
}
export type PeriodUnit = "w" | "m" | "q" | "s" | "d";
/** Этап дорожной карты: поле rb:<id>. s — первый период (с 0), d — длительность, o — строка. */
export interface RoadBar {
  t: string;
  s: number;
  d: number;
  o: number;
  c?: string;
  /** Веха (ромб в одной точке). */
  m?: boolean;
  /** Готовность, %. */
  pv?: number;
}
export interface LootItem {
  id: string;
  t: string;
  w: number;
  c?: string;
}
export interface CurveSeries {
  id: string;
  /** Формула от x. */
  f: string;
  t?: string;
  c?: string;
}
export interface Swatch {
  id: string;
  hex: string;
  t?: string;
}
/** Плитка карты: цвет местности или предмет-эмодзи. */
export interface Tile {
  id: string;
  t: string;
  c?: string;
  e?: string;
}
export type DeviceKind = "phone" | "tablet" | "browser" | "window" | "game";
export const DEVICE_LABELS: Record<DeviceKind, string> = { phone: "Телефон", tablet: "Планшет", browser: "Браузер", window: "Окно программы", game: "Экран игры 16:9" };
/** Размеры рамок-устройств (экран внутри корпуса). */
export const DEVICE_SIZES: Record<DeviceKind, [number, number]> = { phone: [390, 844], tablet: [768, 1024], browser: [1280, 800], window: [960, 640], game: [960, 540] };

export interface Player {
  id: string;
  t: string;
  c: string;
  /** Карточка персонажа: предел характеристики (шкала). */
  m?: number;
}

export interface ChartPoint {
  l: string;
  v: number;
  c?: string;
}

export type CalcOp = "sum" | "avg" | "min" | "max" | "count" | "mul" | "diff";
export const CALC_LABELS: Record<CalcOp, string> = { sum: "Сумма", avg: "Среднее", min: "Минимум", max: "Максимум", count: "Сколько выполнено", mul: "Произведение", diff: "Разность" };
export type GateMode = "and" | "or" | "not" | "xor";
export const GATE_LABELS: Record<GateMode, string> = { and: "И — все", or: "ИЛИ — любой", not: "НЕ — ни одного", xor: "Только один" };

/** Правило логики: на источнике (начало стрелки) — событие, на цели (конец) — действие. */
export interface LogicRule {
  on: string;
  do: string;
  /** Число действия (сколько прибавить) или цель «доли». */
  n?: number;
  /** Выбор действия: цвет, эффект, текст, номер статуса. */
  x?: string;
  /** Порог события («достиг значения»). */
  tn?: number;
  /** Выбор события: номер статуса, вариант колеса. */
  tx?: string;
  /** Обратное событие отменяет действие (сняли галочку — вернуть). */
  rev?: boolean;
}

/** Поле ячейки таблицы. */
export const cellKey = (row: string, col: string) => `c:${row}:${col}`;
export const rateKey = (user: string) => `rt:${user}`;
export const markKey = (i: number) => `k:${i}`;
export const voteKey = (user: string) => `vote:${user}`;
export const scoreKey = (player: string) => `sc:${player}`;
export const checkKey = (item: string) => `ck:${item}`;
export const buzzKey = (user: string) => `bq:${user}`;
export const wordsKey = (user: string) => `w:${user}`;
export const dayKey = (iso: string) => `k:${iso}`;
export const cardKey = (id: string) => `kc:${id}`;
export const barKey = (id: string) => `rb:${id}`;
export const terrainKey = (x: number, y: number) => `gt:${x}:${y}`;
export const objectKey = (x: number, y: number) => `go:${x}:${y}`;
export const pokerKey = (user: string) => `pp:${user}`;

export const GEOMETRY_KEYS = ["x", "y", "w", "h", "r", "z", "parent"] as const;
export type GeometryKey = (typeof GEOMETRY_KEYS)[number];

export interface NodeData extends NodeProps {
  type: NodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  z?: string;
  parent?: string;
  /** Только при создании/копировании: содержимое Y.Text. */
  text?: string;
}

/** Типы с текстом в Y.Text. */
export const TEXT_TYPES = new Set<NodeType>(["note", "text", "code", "shape", "path", "task", "poll"]);

export type FontName =
  | "sans"
  | "serif"
  | "mono"
  | "hand"
  | "round"
  | "geo"
  | "soft"
  | "narrow"
  | "wide"
  | "tech"
  | "game"
  | "pixel"
  | "classic"
  | "elegant"
  | "slab"
  | "old"
  | "script"
  | "marker";
export type FontGroup = "Без засечек" | "С засечками" | "Акцентные" | "Рукописные";
export const FONT_GROUPS: FontGroup[] = ["Без засечек", "С засечками", "Акцентные", "Рукописные"];
/** Шрифты узлов: css — семейство, adj — font-size-adjust для мелких по высоте строчных. */
export const FONTS: { id: FontName; label: string; css: string; group: FontGroup; adj?: number }[] = [
  { id: "sans", label: "Обычный", css: "var(--font-ui)", group: "Без засечек" },
  { id: "round", label: "Округлый", css: '"Nunito Variable", var(--font-ui)', group: "Без засечек" },
  { id: "geo", label: "Геометрический", css: '"Montserrat Variable", var(--font-ui)', group: "Без засечек" },
  { id: "soft", label: "Мягкий", css: '"Comfortaa Variable", var(--font-ui)', group: "Без засечек" },
  { id: "narrow", label: "Узкий", css: '"Oswald Variable", var(--font-ui)', group: "Без засечек" },
  { id: "mono", label: "Моноширинный", css: "var(--font-mono)", group: "Без засечек" },
  { id: "serif", label: "С засечками", css: "var(--font-serif)", group: "С засечками" },
  { id: "classic", label: "Книжный", css: '"PT Serif", var(--font-serif)', group: "С засечками" },
  { id: "elegant", label: "Изящный", css: '"Playfair Display Variable", var(--font-serif)', group: "С засечками" },
  { id: "slab", label: "Брусковый", css: '"Roboto Slab Variable", var(--font-serif)', group: "С засечками" },
  { id: "wide", label: "Широкий", css: '"Unbounded Variable", var(--font-ui)', group: "Акцентные" },
  { id: "tech", label: "Технический", css: '"Exo 2 Variable", var(--font-ui)', group: "Акцентные" },
  { id: "game", label: "Игровой", css: '"Russo One", var(--font-ui)', group: "Акцентные" },
  { id: "pixel", label: "Пиксельный", css: '"Pixelify Sans Variable", var(--font-mono)', group: "Акцентные" },
  { id: "old", label: "Былинный", css: '"Ruslan Display", var(--font-serif)', group: "Акцентные" },
  { id: "hand", label: "Рукописный", css: "var(--font-hand)", group: "Рукописные", adj: 0.56 },
  { id: "script", label: "Каллиграфия", css: '"Marck Script", var(--font-hand)', group: "Рукописные", adj: 0.5 },
  { id: "marker", label: "Фломастер", css: '"Neucha", var(--font-hand)', group: "Рукописные", adj: 0.52 },
];
const FONT_BY_ID = new Map(FONTS.map((f) => [f.id, f]));
export const fontOf = (id: unknown) => (typeof id === "string" ? FONT_BY_ID.get(id as FontName) : undefined);
/** Свой шрифт узла (не обычный) — CSS-семейство, иначе null. */
export function fontCss(id: unknown): string | null {
  const f = fontOf(id);
  return f && f.id !== "sans" ? f.css : null;
}
/** Где выбор шрифта имеет смысл: есть свой текст, и это не код. */
export const FONT_TYPES = new Set<NodeType>([
  "note", "text", "shape", "path", "task", "poll", "table", "frame", "counter", "timer", "progress", "button", "switch", "slider", "rating", "clock", "countdown", "chart", "wheel", "status", "tracker", "calc", "gate",
  "stopwatch", "coin", "flipcard", "deck", "random", "score", "turns", "buzzer", "checklist", "input", "calendar", "token", "words", "spoiler",
  "kanban", "roadmap", "stats", "loot", "curve", "palette", "tilemap", "estimate",
]);
/** Объекты с заголовком: двойной щелчок или Enter — переименовать. */
export const TITLED_TYPES = new Set<NodeType>(["timer", "counter", "progress", "button", "switch", "slider", "rating", "clock", "countdown", "tracker", "calc"]);
/** Виджеты со своим режимом правки (варианты, значения, содержимое). */
export const WIDGET_EDIT_TYPES = new Set<NodeType>(["chart", "wheel", "qr", "status"]);
/** Новые виджеты и логика: к ним можно вести стрелки, их можно вращать. */
export const WIDGET_TYPES = new Set<NodeType>([
  "button", "switch", "slider", "rating", "clock", "countdown", "chart", "qr", "wheel", "status", "tracker", "calc", "gate",
  "stopwatch", "coin", "flipcard", "deck", "random", "score", "turns", "buzzer", "checklist", "input", "calendar", "icon", "token", "words", "spoiler",
  "kanban", "roadmap", "stats", "loot", "curve", "palette", "tilemap", "estimate",
]);
/** Объекты-приборы: двойной щелчок и Enter открывают панель настроек. */
export const INSPECT_TYPES = new Set<NodeType>([...WIDGET_TYPES, "timer", "counter", "dice", "progress", "sticker"]);
/** Типы с высотой по содержимому. */
export const FIT_TYPES = new Set<NodeType>(["note", "text", "code", "link", "file", "shelf", "table", "task", "poll", "audio", "checklist", "kanban", "roadmap", "stats", "loot", "estimate"]);
/** Сохраняют пропорции при изменении размера. */
export const ASPECT_TYPES = new Set<NodeType>(["image", "video", "sticker", "icon", "token"]);

export const TYPE_LABELS: Record<NodeType, string> = {
  note: "Заметка",
  text: "Текст",
  code: "Код",
  image: "Картинка",
  video: "Видео",
  file: "Файл",
  shelf: "Полка",
  link: "Ссылка",
  frame: "Рамка",
  shape: "Фигура",
  path: "Линия",
  ink: "Рисунок",
  sticker: "Стикер",
  table: "Таблица",
  task: "Задача",
  poll: "Опрос",
  timer: "Таймер",
  audio: "Аудио",
  counter: "Счётчик",
  dice: "Кубики",
  progress: "Прогресс",
  comment: "Комментарий",
  button: "Кнопка",
  switch: "Переключатель",
  slider: "Ползунок",
  rating: "Оценка",
  clock: "Часы",
  countdown: "Обратный отсчёт",
  chart: "Диаграмма",
  qr: "QR-код",
  wheel: "Колесо фортуны",
  status: "Статус",
  tracker: "Трекер",
  calc: "Вычисление",
  gate: "Логический блок",
  stopwatch: "Секундомер",
  coin: "Монетка",
  flipcard: "Карточка",
  deck: "Колода карт",
  random: "Случайный выбор",
  score: "Табло счёта",
  turns: "Очередь ходов",
  buzzer: "Кто первый",
  checklist: "Чек-лист",
  input: "Поле ввода",
  calendar: "Календарь",
  icon: "Значок",
  token: "Фишка",
  words: "Облако слов",
  spoiler: "Сюрприз",
  kanban: "Канбан",
  roadmap: "Дорожная карта",
  stats: "Карточка персонажа",
  loot: "Таблица добычи",
  curve: "Кривая баланса",
  palette: "Палитра",
  tilemap: "Карта уровня",
  estimate: "Покер планирования",
};

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: "Прямоугольник",
  sharp: "Прямые углы",
  pill: "Капсула",
  ellipse: "Эллипс",
  diamond: "Ромб — решение",
  triangle: "Треугольник",
  hexagon: "Шестиугольник",
  octagon: "Восьмиугольник",
  pentagon: "Пятиугольник",
  star: "Звезда",
  parallelogram: "Параллелограмм — ввод/вывод",
  trapezoid: "Трапеция",
  cylinder: "Цилиндр — база данных",
  document: "Документ",
  process: "Подпроцесс",
  delay: "Задержка",
  cloud: "Облако",
  bubble: "Реплика",
  arrow: "Стрелка-блок",
  chevron: "Шеврон — этап",
  cross: "Плюс",
  heart: "Сердце",
  poly: "Многоугольник",
};
/** Фигуры в порядке библиотеки. */
export const SHAPE_KINDS: ShapeKind[] = [
  "rect", "sharp", "pill", "ellipse", "diamond", "triangle", "hexagon", "octagon", "pentagon", "star",
  "parallelogram", "trapezoid", "cylinder", "document", "process", "delay", "cloud", "bubble", "arrow", "chevron", "cross", "heart",
];

export function defaults(type: NodeType): Partial<NodeData> {
  switch (type) {
    case "note":
      return { w: 260, h: 120, fit: true };
    case "text":
      return { w: 320, h: 40, fit: true, size: "m" };
    case "code":
      return { w: 480, h: 200, fit: true, lang: "javascript", view: "code" };
    case "frame":
      return { w: 800, h: 520, name: "Рамка" };
    case "shape":
      return { w: 180, h: 120, kind: "rect", fill: "tint", stroke: "m", dash: "solid", color: "default" };
    case "path":
      return { stroke: "m", dash: "solid", head0: "none", head1: "arrow", route: "straight" };
    case "ink":
      return { stroke: "m" };
    case "link":
      return { w: 340, h: 120, fit: true };
    case "file":
      return { w: 280, h: 72, fit: true };
    case "shelf":
      return { w: 320, h: 200, fit: true, name: "Полка", items: [] };
    case "image":
      return { w: 320, h: 240 };
    case "video":
      return { w: 480, h: 270 };
    case "sticker":
      return { w: 120, h: 120, emoji: "👍" };
    case "table":
      return { w: 480, h: 160, fit: true, head: true };
    case "task":
      return { w: 280, h: 96, fit: true };
    case "poll":
      return { w: 320, h: 220, fit: true };
    case "timer":
      return { w: 240, h: 150, dur: 5 * 60_000, end: null, left: null };
    case "audio":
      return { w: 320, h: 84, fit: true };
    case "counter":
      return { w: 200, h: 150, n0: 0, step: 1 };
    case "dice":
      return { w: 260, h: 190, sides: 6, count: 2, roll: null };
    case "progress":
      return { w: 320, h: 92, pv: 30 };
    case "comment":
      return { w: 36, h: 36 };
    case "button":
      return { w: 200, h: 72, title: "Нажми меня", emoji: "⚡" };
    case "switch":
      return { w: 220, h: 72, title: "Переключатель" };
    case "slider":
      return { w: 300, h: 96, sv: 50, min: 0, max: 100, step: 1 };
    case "rating":
      return { w: 260, h: 96, max: 5, ri: "star" };
    case "clock":
      return { w: 220, h: 120, cv: "digital" };
    case "countdown":
      return { w: 320, h: 130, at: null };
    case "chart":
      return { w: 380, h: 260, ct: "bar" };
    case "qr":
      return { w: 200, h: 236 };
    case "wheel":
      return { w: 320, h: 360, opts: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `o${i}`, t: `Вариант ${i}` })) };
    case "status":
      return { w: 200, h: 56, st: 0 };
    case "tracker":
      return { w: 340, h: 150, cells: 7 };
    case "calc":
      return { w: 220, h: 130, op: "sum" };
    case "gate":
      return { w: 150, h: 110, gm: "and" };
    case "stopwatch":
      return { w: 240, h: 150, t0: null, acc: 0 };
    case "coin":
      return { w: 190, h: 210, coin: null };
    case "flipcard":
      return { w: 260, h: 170, ft: "Вопрос", bt: "Ответ" };
    case "deck":
      return { w: 230, h: 270, dk: "36" };
    case "random":
      return { w: 250, h: 170, rm: "num", min: 1, max: 100 };
    case "score":
      return { w: 300, h: 190, pl: [{ id: "a", t: "Команда 1", c: "blue" }, { id: "b", t: "Команда 2", c: "red" }] };
    case "turns":
      return { w: 270, h: 220, pl: [{ id: "a", t: "Игрок 1", c: "blue" }, { id: "b", t: "Игрок 2", c: "red" }, { id: "c", t: "Игрок 3", c: "green" }], cur: 0, rn: 1 };
    case "buzzer":
      return { w: 230, h: 200, title: "Кто первый?" };
    case "checklist":
      return { w: 280, h: 200, fit: true, title: "Чек-лист", cl: [{ id: "a", t: "Первый пункт" }, { id: "b", t: "Второй пункт" }, { id: "c", t: "Третий пункт" }] };
    case "input":
      return { w: 260, h: 100, title: "Поле ввода", it: "text" };
    case "calendar":
      return { w: 300, h: 300 };
    case "icon":
      return { w: 120, h: 120, ic: "star" };
    case "token":
      return { w: 76, h: 76, tk: "pawn", color: "blue" };
    case "words":
      return { w: 360, h: 250, title: "Одно слово о встрече", max: 3 };
    case "spoiler":
      return { w: 280, h: 150, title: "Нажмите, чтобы открыть", bt: "Сюрприз! 🎉" };
    case "kanban":
      return {
        w: 720,
        h: 300,
        fit: true,
        title: "Задачи",
        kb: [
          { id: "a", t: "Идеи", c: "gray" },
          { id: "b", t: "В работе", c: "blue", lim: 3 },
          { id: "c", t: "Проверка", c: "orange" },
          { id: "d", t: "Готово", c: "green" },
        ],
        ...({ "kc:k1": { t: "Придумать название", col: "a", o: 1 }, "kc:k2": { t: "Собрать прототип", col: "b", o: 1 }, "kc:k3": { t: "Нарисовать иконку", col: "a", o: 2, c: "pink" } } as object),
      };
    case "roadmap":
      return {
        w: 720,
        h: 240,
        fit: true,
        title: "Дорожная карта",
        pn: 8,
        pu: "w",
        ...({
          "rb:r1": { t: "Прототип", s: 0, d: 2, o: 1, c: "violet", pv: 100 },
          "rb:r2": { t: "Альфа", s: 2, d: 3, o: 2, c: "blue", pv: 40 },
          "rb:r3": { t: "Тесты", s: 4, d: 3, o: 3, c: "orange" },
          "rb:r4": { t: "Релиз", s: 7, d: 1, o: 4, c: "green", m: true },
        } as object),
      };
    case "stats":
      return {
        w: 300,
        h: 260,
        fit: true,
        title: "Герой",
        desc: "Воин · уровень 1",
        emoji: "🧙",
        pl: [
          { id: "hp", t: "Здоровье", c: "red", m: 100 },
          { id: "mp", t: "Мана", c: "blue", m: 50 },
          { id: "atk", t: "Атака", c: "orange" },
          { id: "def", t: "Защита", c: "gray" },
        ],
        ...({ "sc:hp": 100, "sc:mp": 50, "sc:atk": 12, "sc:def": 8 } as object),
      };
    case "loot":
      return {
        w: 320,
        h: 280,
        fit: true,
        title: "Сундук",
        lo: [
          { id: "a", t: "🪙 Горсть монет", w: 50, c: "gray" },
          { id: "b", t: "🧪 Зелье лечения", w: 25, c: "green" },
          { id: "c", t: "🗡️ Стальной меч", w: 15, c: "blue" },
          { id: "d", t: "💍 Кольцо силы", w: 8, c: "violet" },
          { id: "e", t: "🐉 Чешуя дракона", w: 2, c: "orange" },
        ],
      };
    case "curve":
      return { w: 420, h: 280, title: "Опыт до уровня", min: 1, max: 20, fs: [{ id: "a", f: "round(100 * x^1.5)", t: "Опыт", c: "violet" }] };
    case "palette":
      return {
        w: 420,
        h: 150,
        title: "Палитра",
        sw: [
          { id: "a", hex: "#264653", t: "Глубина" },
          { id: "b", hex: "#2a9d8f", t: "Бирюза" },
          { id: "c", hex: "#e9c46a", t: "Песок" },
          { id: "d", hex: "#f4a261", t: "Абрикос" },
          { id: "e", hex: "#e76f51", t: "Коралл" },
        ],
      };
    case "tilemap":
      return { w: 520, h: 330, title: "Карта уровня", gw: 16, gh: 10 };
    case "estimate":
      return { w: 380, h: 240, fit: true, title: "Оцениваем задачу", pk: "fib" };
  }
}

export function isFit(type: NodeType, props: NodeProps): boolean {
  return FIT_TYPES.has(type) && props.fit !== false;
}

/* ------------------------- языки блоков кода ------------------------- */

export const CODE_LANGS: { id: string; label: string; ext: string[]; more?: true }[] = [
  { id: "javascript", label: "JavaScript", ext: ["js", "mjs", "cjs"] },
  { id: "typescript", label: "TypeScript", ext: ["ts", "mts", "cts"] },
  { id: "python", label: "Python", ext: ["py", "pyw"] },
  { id: "html", label: "HTML", ext: ["html", "htm"] },
  { id: "css", label: "CSS", ext: ["css"] },
  { id: "json", label: "JSON", ext: ["json", "jsonc", "map"] },
  { id: "markdown", label: "Markdown", ext: ["md", "markdown"] },
  { id: "sql", label: "SQL", ext: ["sql"] },
  { id: "shell", label: "Shell", ext: ["sh", "bash", "zsh"] },
  { id: "rust", label: "Rust", ext: ["rs"] },
  { id: "go", label: "Go", ext: ["go"] },
  { id: "java", label: "Java", ext: ["java"] },
  { id: "kotlin", label: "Kotlin", ext: ["kt", "kts"] },
  { id: "c", label: "C", ext: ["c", "h"] },
  { id: "cpp", label: "C++", ext: ["cpp", "cc", "hpp", "cxx", "hh"] },
  { id: "csharp", label: "C#", ext: ["cs"] },
  { id: "php", label: "PHP", ext: ["php"] },
  { id: "lua", label: "Lua", ext: ["lua", "luau"] },
  { id: "yaml", label: "YAML", ext: ["yml", "yaml"] },
  { id: "text", label: "Текст", ext: ["txt", "log", "csv"] },
  /* ещё языки — в подменю */
  { id: "jsx", label: "JSX", ext: ["jsx"], more: true },
  { id: "tsx", label: "TSX", ext: ["tsx"], more: true },
  { id: "vue", label: "Vue", ext: ["vue"], more: true },
  { id: "scss", label: "SCSS", ext: ["scss"], more: true },
  { id: "sass", label: "Sass", ext: ["sass"], more: true },
  { id: "less", label: "Less", ext: ["less"], more: true },
  { id: "powershell", label: "PowerShell", ext: ["ps1", "psm1"], more: true },
  { id: "ruby", label: "Ruby", ext: ["rb"], more: true },
  { id: "swift", label: "Swift", ext: ["swift"], more: true },
  { id: "dart", label: "Dart", ext: ["dart"], more: true },
  { id: "scala", label: "Scala", ext: ["scala", "sc"], more: true },
  { id: "groovy", label: "Groovy / Gradle", ext: ["groovy", "gradle"], more: true },
  { id: "objc", label: "Objective-C", ext: ["m", "mm"], more: true },
  { id: "haskell", label: "Haskell", ext: ["hs"], more: true },
  { id: "ocaml", label: "OCaml", ext: ["ml", "mli"], more: true },
  { id: "fsharp", label: "F#", ext: ["fs", "fsx"], more: true },
  { id: "erlang", label: "Erlang", ext: ["erl"], more: true },
  { id: "clojure", label: "Clojure", ext: ["clj", "cljs", "cljc", "edn"], more: true },
  { id: "lisp", label: "Common Lisp", ext: ["lisp", "cl", "el"], more: true },
  { id: "scheme", label: "Scheme", ext: ["scm", "ss"], more: true },
  { id: "elm", label: "Elm", ext: ["elm"], more: true },
  { id: "crystal", label: "Crystal", ext: ["cr"], more: true },
  { id: "d", label: "D", ext: ["d"], more: true },
  { id: "julia", label: "Julia", ext: ["jl"], more: true },
  { id: "r", label: "R", ext: ["r"], more: true },
  { id: "perl", label: "Perl", ext: ["pl", "pm"], more: true },
  { id: "pascal", label: "Pascal / Delphi", ext: ["pas", "dpr"], more: true },
  { id: "fortran", label: "Fortran", ext: ["f", "f90", "f95", "for"], more: true },
  { id: "cobol", label: "COBOL", ext: ["cob", "cbl"], more: true },
  { id: "vbnet", label: "Visual Basic", ext: ["vb", "vbs"], more: true },
  { id: "coffeescript", label: "CoffeeScript", ext: ["coffee"], more: true },
  { id: "gdscript", label: "GDScript (Godot)", ext: ["gd"], more: true },
  { id: "glsl", label: "GLSL / HLSL", ext: ["glsl", "vert", "frag", "hlsl", "shader"], more: true },
  { id: "asm", label: "Ассемблер", ext: ["s", "asm"], more: true },
  { id: "wasm", label: "WebAssembly", ext: ["wat", "wast"], more: true },
  { id: "verilog", label: "Verilog", ext: ["v", "sv"], more: true },
  { id: "vhdl", label: "VHDL", ext: ["vhd", "vhdl"], more: true },
  { id: "toml", label: "TOML", ext: ["toml"], more: true },
  { id: "ini", label: "INI / properties", ext: ["ini", "cfg", "conf", "properties", "env"], more: true },
  { id: "xml", label: "XML / SVG", ext: ["xml", "svg", "xsd", "xsl"], more: true },
  { id: "protobuf", label: "Protobuf", ext: ["proto"], more: true },
  { id: "dockerfile", label: "Dockerfile", ext: ["dockerfile"], more: true },
  { id: "nginx", label: "Nginx", ext: ["nginx"], more: true },
  { id: "cmake", label: "CMake", ext: ["cmake"], more: true },
  { id: "diff", label: "Diff", ext: ["diff", "patch"], more: true },
  { id: "http", label: "HTTP", ext: ["http"], more: true },
  { id: "latex", label: "LaTeX", ext: ["tex", "ltx"], more: true },
  { id: "jinja", label: "Jinja", ext: ["j2", "jinja"], more: true },
  { id: "liquid", label: "Liquid", ext: ["liquid"], more: true },
  { id: "pug", label: "Pug", ext: ["pug"], more: true },
  { id: "brainfuck", label: "Brainfuck", ext: ["bf"], more: true },
];

export function langLabel(id: string | undefined): string {
  return CODE_LANGS.find((l) => l.id === id)?.label ?? (id || "Текст");
}

export function langFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  const ext = lower.split(".").pop() ?? "";
  return CODE_LANGS.find((l) => l.ext.includes(ext))?.id ?? null;
}

/** Языки, у которых есть режим «результат». */
export const PREVIEW_LANGS = new Set(["markdown", "html", "latex", "xml"]);
