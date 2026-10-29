/* Шаблоны: готовые наборы узлов (рамки, карточки, фигуры, связи).
   Строятся как содержимое буфера обмена — вставка переназначает id,
   привязки стрелок и родителей, поэтому шаблон можно ставить сколько
   угодно раз. Миниатюры рисуются из тех же данных. */
import {
  colorName,
  defaults,
  objectKey,
  terrainKey,
  type ColorName,
  type DeviceKind,
  type FontName,
  type Head,
  type LogicRule,
  type NodeData,
  type NodeProps,
  type NodeType,
  type Route,
  type ShapeKind,
  type TextSize,
} from "./model.ts";
import type { Clip } from "./ops.ts";
import { pollData } from "./nodes/poll.ts";
import { isoDay } from "./nodes/task.ts";
import { tableData } from "./nodes/table.svelte.ts";
import { shapeD } from "./shapes.ts";

type N = NodeData & { id: string };

interface Opt extends Pick<NodeProps, "tw" | "ti" | "tt" | "tls" | "tfx"> {
  color?: ColorName;
  parent?: string;
  size?: TextSize;
  h?: number;
  font?: FontName;
}

/** Начертание из опций — только заданные поля. */
const look = (o: Opt) => ({ ...(o.tw ? { tw: o.tw } : {}), ...(o.ti ? { ti: true } : {}), ...(o.tt ? { tt: o.tt } : {}), ...(o.tls ? { tls: o.tls } : {}), ...(o.tfx ? { tfx: o.tfx } : {}) });

/** Карточки канбана: [колонка, текст, цвет?] → поля kc:<id>. */
function cards(list: [string, string, ColorName?][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  list.forEach(([col, t, c], i) => (out[`kc:c${i + 1}`] = { t, col, o: i + 1, ...(c ? { c } : {}) }));
  return out;
}

/** Этапы дорожной карты: [текст, начало, длительность, строка, цвет, готовность?, веха?] → поля rb:<id>. */
function bars(list: [string, number, number, number, ColorName, number?, boolean?][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  list.forEach(([t, st, d, o, c, pv, m], i) => (out[`rb:b${i + 1}`] = { t, s: st, d, o, c, ...(pv ? { pv } : {}), ...(m ? { m } : {}) }));
  return out;
}

/** Карта из строк: буква — местность (и предмет поверх). */
const MAP_KEY: Record<string, [string | null, string | null]> = {
  "~": [null, null],
  s: ["sand", null],
  g: ["grass", null],
  W: ["wall", null],
  ".": ["stone", null],
  L: ["lava", null],
  H: ["grass", "hero"],
  T: ["grass", "tree"],
  K: ["grass", "key"],
  E: ["grass", "enemy"],
  e: ["stone", "enemy"],
  C: ["stone", "chest"],
  D: ["stone", "door"],
};
function mapRows(rows: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { gb: "water", gw: rows[0]!.length, gh: rows.length };
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const [t, o] = MAP_KEY[ch] ?? [null, null];
      if (t) out[terrainKey(x, y)] = t;
      if (o) out[objectKey(x, y)] = o;
    }),
  );
  return out;
}

class TB {
  nodes: N[] = [];
  private n = 0;

  add(d: NodeData): string {
    const id = `t${this.n++}`;
    this.nodes.push({ ...d, id });
    return id;
  }
  frame(x: number, y: number, w: number, h: number, name: string, color: ColorName = "default"): string {
    return this.add({ type: "frame", x, y, w, h, name, color });
  }
  note(x: number, y: number, w: number, text: string, o: Opt = {}): string {
    return this.add({ type: "note", x, y, w, h: o.h ?? 110, fit: true, text, color: o.color ?? "default", parent: o.parent, size: o.size });
  }
  text(x: number, y: number, w: number, text: string, o: Opt & { align?: "left" | "center" | "right" } = {}): string {
    return this.add({ type: "text", x, y, w, h: o.h ?? 40, fit: true, text, size: o.size ?? "m", color: o.color, parent: o.parent, align: o.align, font: o.font, ...look(o) });
  }
  shape(x: number, y: number, w: number, h: number, kind: ShapeKind, text: string, o: Opt & { fill?: "none" | "tint" | "solid"; dash?: "solid" | "dash" | "dot" } = {}): string {
    return this.add({ type: "shape", x, y, w, h, kind, text, fill: o.fill ?? "tint", stroke: "m", dash: o.dash ?? "solid", color: o.color ?? "default", parent: o.parent, size: o.size ?? "s", align: "center", font: o.font, ...look(o) });
  }
  /** Рамка-устройство: экран телефона, окно браузера, экран игры. */
  device(x: number, y: number, dev: DeviceKind, name: string, w: number, h: number, extra: Partial<NodeData> = {}): string {
    return this.add({ type: "frame", x, y, w, h, name, color: "default", dev, ...extra });
  }
  /** Виджет с настройками по умолчанию; свои поля — поверх. Свои kc:/rb:/sc:… заменяют примерные. */
  wd(type: NodeType, x: number, y: number, extra: Record<string, unknown> = {}): string {
    const own = Object.keys(extra).some((k) => k.includes(":"));
    const base = Object.fromEntries(Object.entries(defaults(type)).filter(([k]) => !own || !k.includes(":")));
    return this.add({ type, x, y, w: 240, h: 160, ...base, ...extra } as NodeData);
  }
  task(x: number, y: number, w: number, text: string, o: Opt & { done?: boolean; prio?: "low" | "mid" | "high"; due?: number } = {}): string {
    return this.add({ type: "task", x, y, w, h: 80, fit: true, text, color: o.color, parent: o.parent, done: o.done || undefined, prio: o.prio, due: o.due !== undefined ? isoDay(o.due) : undefined });
  }
  sticker(x: number, y: number, size: number, emoji: string, parent?: string): string {
    return this.add({ type: "sticker", x, y, w: size, h: size, emoji, parent });
  }
  poll(x: number, y: number, w: number, q: string, options: string[], parent?: string, multi = false): string {
    return this.add({ type: "poll", x, y, w, h: 90 + options.length * 42, fit: true, parent, ...pollData(q, options, multi) } as NodeData);
  }
  timer(x: number, y: number, minutes: number, title: string, parent?: string): string {
    return this.add({ type: "timer", x, y, w: 240, h: 150, dur: minutes * 60_000, end: null, left: null, title, parent });
  }
  counter(x: number, y: number, title: string, o: Opt & { n0?: number; step?: number; w?: number } = {}): string {
    return this.add({ type: "counter", x, y, w: o.w ?? 200, h: o.h ?? 150, title, n0: o.n0 ?? 0, step: o.step, color: o.color, parent: o.parent });
  }
  dice(x: number, y: number, count: number, sides = 6, o: Opt = {}): string {
    return this.add({ type: "dice", x, y, w: 220, h: o.h ?? 170, count, sides, color: o.color, parent: o.parent });
  }
  progress(x: number, y: number, w: number, title: string, pv: number, o: Opt & { steps?: number } = {}): string {
    return this.add({ type: "progress", x, y, w, h: 92, title, pv, steps: o.steps, color: o.color, parent: o.parent });
  }
  table(x: number, y: number, w: number, grid: string[][], parent?: string, color?: ColorName): string {
    return this.add({ type: "table", x, y, w, h: grid.length * 36, fit: true, parent, color, ...tableData(grid) } as NodeData);
  }
  /** Любой объект (виджеты, логика). */
  widget(type: NodeType, x: number, y: number, w: number, h: number, extra: Partial<NodeData> = {}): string {
    return this.add({ type, x, y, w, h, ...extra } as NodeData);
  }
  arrow(a: string, b: string, o: { route?: Route; head0?: Head; head1?: Head; label?: string; color?: ColorName; dash?: "solid" | "dash" | "dot"; lg?: LogicRule } = {}): string {
    const na = this.nodes.find((n) => n.id === a)!;
    const nb = this.nodes.find((n) => n.id === b)!;
    const ca = { x: na.x + na.w / 2, y: na.y + na.h / 2 };
    const cb = { x: nb.x + nb.w / 2, y: nb.y + nb.h / 2 };
    const x = Math.min(ca.x, cb.x);
    const y = Math.min(ca.y, cb.y);
    return this.add({
      type: "path",
      x,
      y,
      w: Math.max(1, Math.abs(ca.x - cb.x)),
      h: Math.max(1, Math.abs(ca.y - cb.y)),
      pts: [
        [ca.x - x, ca.y - y],
        [cb.x - x, cb.y - y],
      ],
      b0: { id: a, u: 0.5, v: 0.5, precise: false },
      b1: { id: b, u: 0.5, v: 0.5, precise: false },
      route: o.route ?? "curve",
      head0: o.head0 ?? "none",
      head1: o.head1 ?? "arrow",
      stroke: "m",
      dash: o.dash ?? "solid",
      color: o.color ?? "default",
      text: o.label,
      size: "s",
      lg: o.lg,
    });
  }
  clip(): Clip {
    return { v: 1, board: "template", nodes: this.nodes };
  }
}

export interface Template {
  id: string;
  label: string;
  desc: string;
  words: string;
  group: TemplateGroup;
  build: () => Clip;
}

export const TEMPLATE_GROUPS = ["Интерактив и логика", "Игры", "Разработка и дизайн", "Команда", "Планы и стратегия", "Схемы и идеи"] as const;
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number];

/* ------------------------------ шаблоны ------------------------------ */

function kanban(): Clip {
  const t = new TB();
  const kb = t.wd("kanban", 0, 0, {
    w: 1100,
    title: "Задачи проекта",
    kb: [
      { id: "a", t: "💡 Идеи", c: "gray" },
      { id: "b", t: "📋 Сделать", c: "blue" },
      { id: "c", t: "⚙️ В работе", c: "yellow", lim: 3 },
      { id: "d", t: "✅ Готово", c: "green" },
    ],
    ...cards([
      ["a", "Придумать название проекта"],
      ["a", "Собрать референсы и примеры", "pink"],
      ["b", "Расписать задачи на неделю"],
      ["b", "Созвониться с командой", "violet"],
      ["c", "Сделать прототип", "orange"],
      ["d", "Создать доску"],
    ]),
  });
  const pr = t.progress(0, 360, 520, "Готово задач", 0, { color: "green" });
  t.arrow(kb, pr, { route: "straight", lg: { on: "change", do: "share" } });
  const st = t.sticker(560, 350, 90, "🏁");
  t.arrow(kb, st, { lg: { on: "complete", do: "fx", x: "confetti", rev: false } });
  t.text(680, 372, 420, "Перетаскивайте карточки между колонками — полоса «Готово задач» считает сама, а когда готово всё, будет салют.", { size: "s", color: "gray" });
  return t.clip();
}

function mindmap(): Clip {
  const t = new TB();
  const c = t.shape(-130, -60, 260, 120, "ellipse", "**Главная идея**", { color: "violet", fill: "solid", size: "m" });
  const branches: [string, ColorName, number, number][] = [
    ["Цели", "blue", 360, -220],
    ["Идеи", "green", 400, -30],
    ["Ресурсы", "yellow", 360, 160],
    ["Риски", "red", -540, -220],
    ["Люди", "pink", -580, -30],
    ["Сроки", "cyan", -540, 160],
  ];
  for (const [label, color, x, y] of branches) {
    const id = t.shape(x, y, 180, 64, "pill", label, { color });
    t.arrow(c, id, { head1: "none", color, route: "curve" });
    const right = x > 0;
    for (const [k, sub] of ["Пункт", "Ещё пункт"].entries()) {
      const s = t.text(right ? x + 250 : x - 230, y - 30 + k * 64, 180, sub, { size: "s", align: right ? "left" : "right" });
      t.arrow(id, s, { head1: "none", color, route: "curve" });
    }
  }
  return t.clip();
}

function flowchart(): Clip {
  const t = new TB();
  const start = t.shape(0, 0, 200, 64, "pill", "Начало", { color: "green" });
  const act = t.shape(-10, 130, 220, 84, "rect", "Действие");
  const dec = t.shape(-20, 290, 240, 150, "diamond", "Условие выполнено?", { color: "yellow" });
  const yes = t.shape(-10, 520, 220, 84, "rect", "Следующий шаг");
  const no = t.shape(340, 323, 220, 84, "rect", "Исправить", { color: "orange" });
  const end = t.shape(0, 680, 200, 64, "pill", "Конец", { color: "red" });
  t.arrow(start, act, { route: "elbow" });
  t.arrow(act, dec, { route: "elbow" });
  t.arrow(dec, yes, { route: "elbow", label: "Да" });
  t.arrow(dec, no, { route: "elbow", label: "Нет" });
  t.arrow(no, act, { route: "elbow" });
  t.arrow(yes, end, { route: "elbow" });
  return t.clip();
}

function roadmap(): Clip {
  const t = new TB();
  const rm = t.wd("roadmap", 0, 0, {
    w: 1000,
    title: "🗺️ Дорожная карта на год",
    pu: "q",
    pn: 4,
    ...bars([
      ["Исследование и цели", 0, 1, 1, "violet", 100],
      ["Макеты", 0, 1, 2, "pink", 80],
      ["Дизайн-система", 1, 2, 3, "pink", 20],
      ["Разработка MVP", 1, 2, 4, "blue", 10],
      ["Метрики и обратная связь", 2, 2, 5, "cyan"],
      ["Релиз 🚀", 3, 1, 6, "green", 0, true],
    ]),
  });
  const pr = t.progress(1060, 0, 400, "Готовность плана", 0, { color: "violet" });
  t.arrow(rm, pr, { lg: { on: "change", do: "share" } });
  t.note(1060, 150, 400, "**⚠️ Риски и зависимости**\n- Дизайн-система нужна до MVP\n- Обратная связь — не позже 3 квартала", { color: "yellow" });
  return t.clip();
}

function gameNight(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1220, 760, "🎮 Игровой вечер", "violet");
  t.poll(40, 60, 360, "**Во что играем?**", ["Minecraft", "Dota 2", "Counter-Strike 2", "Настолки"], f, true);
  t.poll(430, 60, 360, "**Когда собираемся?**", ["Пятница, 20:00", "Суббота, 18:00", "Воскресенье, 16:00"], f);
  t.note(820, 60, 360, "**👥 Кто будет**\n- [ ] Я\n- [ ] Друг 1\n- [ ] Друг 2\n- [ ] Друг 3", { parent: f, color: "blue" });
  t.table(40, 400, 560, [["Игрок", "Роль", "Что берёт"], ["", "Танк", ""], ["", "Лекарь", ""], ["", "Урон", ""]], f);
  t.note(630, 400, 270, "**🛒 Что взять**\n- [ ] Снеки\n- [ ] Напитки\n- [ ] Зарядки\n- [ ] Наушники", { parent: f, color: "yellow" });
  t.timer(930, 400, 10, "Перерыв", f);
  t.sticker(1110, 600, 80, "🎲", f);
  t.sticker(1010, 630, 64, "🍕", f);
  return t.clip();
}

function gdd(): Clip {
  const t = new TB();
  const W = 440;
  const H = 400;
  const g = 40;
  const fr = (i: number, name: string, c: ColorName) => t.frame((i % 3) * (W + g), Math.floor(i / 3) * (H + g + 30), W, H, name, c);
  const f0 = fr(0, "🎯 Концепция", "violet");
  t.note(20, 50, W - 40, "**Жанр:** …\n**Платформы:** ПК, консоли\n**Аудитория:** …\n**Фишка в одном предложении:** …", { parent: f0, color: "violet" });

  const f1 = fr(1, "🔁 Игровой цикл", "blue");
  const x1 = W + g;
  const a = t.shape(x1 + 140, 60, 160, 56, "pill", "Исследовать", { parent: f1, color: "blue" });
  const b = t.shape(x1 + 260, 170, 160, 56, "pill", "Сражаться", { parent: f1, color: "red" });
  const c = t.shape(x1 + 140, 290, 160, 56, "pill", "Награда", { parent: f1, color: "yellow" });
  const d = t.shape(x1 + 20, 170, 160, 56, "pill", "Улучшение", { parent: f1, color: "green" });
  t.arrow(a, b);
  t.arrow(b, c);
  t.arrow(c, d);
  t.arrow(d, a);

  const f2 = fr(2, "🧙 Персонажи", "pink");
  const x2 = 2 * (W + g);
  t.note(x2 + 20, 50, 190, "**Герой**\nКто он и чего хочет", { parent: f2, color: "pink" });
  t.note(x2 + 230, 50, 190, "**Напарник**\nЧем помогает", { parent: f2, color: "cyan" });
  t.note(x2 + 20, 210, 400, "**Злодей**\nМотивы и сильные стороны", { parent: f2, color: "red" });

  const y3 = H + g + 30;
  const f3 = fr(3, "🗺️ Мир и уровни", "green");
  const l1 = t.shape(20, y3 + 70, 120, 70, "rect", "Лес", { parent: f3, color: "green" });
  const l2 = t.shape(160, y3 + 70, 120, 70, "rect", "Пещеры", { parent: f3, color: "gray" });
  const l3 = t.shape(300, y3 + 70, 120, 70, "rect", "Замок 🏰", { parent: f3, color: "violet" });
  t.arrow(l1, l2, { route: "straight" });
  t.arrow(l2, l3, { route: "straight" });
  t.note(20, y3 + 190, W - 40, "Как меняется сложность и что открывается на каждом уровне", { parent: f3 });

  const f4 = fr(4, "⚙️ Механики", "orange");
  t.table(x1 + 20, y3 + 50, W - 40, [["Механика", "Зачем", "Приоритет"], ["Прыжок", "Движение, головоломки", "Высокий"], ["Крафт", "Прогресс", "Средний"], ["Кооператив", "Играть с друзьями", "Высокий"]], f4);

  const f5 = fr(5, "✅ Задачи", "gray");
  t.task(x2 + 20, y3 + 50, W - 40, "Прототип управления", { parent: f5, prio: "high" });
  t.task(x2 + 20, y3 + 150, W - 40, "Первый уровень", { parent: f5, prio: "mid" });
  t.task(x2 + 20, y3 + 250, W - 40, "Звуки и музыка", { parent: f5, prio: "low" });
  return t.clip();
}

function retro(): Clip {
  const t = new TB();
  const cols: [string, ColorName, string[]][] = [
    ["👍 Что было хорошо", "green", ["Быстро договорились о плане", "Классная атмосфера"]],
    ["🔧 Что улучшить", "orange", ["Меньше созвонов", "Раньше делиться прогрессом"]],
    ["🚀 Что делаем дальше", "blue", ["Попробовать новый формат", "Назначить ответственных"]],
  ];
  cols.forEach(([name, c, notes], i) => {
    const f = t.frame(i * 400, 0, 360, 560, name, c);
    notes.forEach((n, k) => t.note(i * 400 + 20, 50 + k * 140, 320, n, { parent: f, color: c }));
  });
  t.timer(1220, 0, 5, "Пишем мысли");
  t.poll(1220, 170, 280, "**Что берём в работу?**", ["Пункт 1", "Пункт 2", "Пункт 3"], undefined, true);
  return t.clip();
}

function swot(): Clip {
  const t = new TB();
  t.text(0, -80, 900, "**SWOT-анализ**", { size: "l" });
  const cells: [string, ColorName, string][] = [
    ["💪 Сильные стороны", "green", "Что получается лучше всех?"],
    ["⚠️ Слабые стороны", "red", "Что мешает и чего не хватает?"],
    ["🌱 Возможности", "blue", "Какие тренды и шансы можно использовать?"],
    ["🌩️ Угрозы", "orange", "Что может помешать снаружи?"],
  ];
  cells.forEach(([name, c, hint], i) => {
    const x = (i % 2) * 480;
    const y = Math.floor(i / 2) * 400;
    const f = t.frame(x, y, 440, 340, name, c);
    t.note(x + 20, y + 50, 400, hint, { parent: f, color: c });
  });
  return t.clip();
}

function journey(): Clip {
  const t = new TB();
  const stages: [string, ColorName, string][] = [
    ["Узнаёт", "violet", "🙂"],
    ["Изучает", "blue", "🤔"],
    ["Пробует", "cyan", "😃"],
    ["Покупает", "green", "😬"],
    ["Советует", "yellow", "🤩"],
  ];
  const rows = ["Действия", "Мысли", "Эмоции", "Идеи"];
  rows.forEach((r, i) => t.text(0, 130 + i * 150, 150, `**${r}**`, { size: "s" }));
  stages.forEach(([name, c, emo], i) => {
    const x = 170 + i * 250;
    t.shape(x, 0, 240, 72, "chevron", `**${name}**`, { color: c, fill: "solid" });
    t.note(x + 10, 110, 220, "Что делает человек", { color: c, size: "s" });
    t.note(x + 10, 260, 220, "О чём думает", { size: "s" });
    t.sticker(x + 85, 405, 70, emo);
    t.note(x + 10, 560, 220, "Как помочь", { color: "yellow", size: "s" });
  });
  return t.clip();
}

function eisenhower(): Clip {
  const t = new TB();
  t.text(0, -80, 900, "**Матрица Эйзенхауэра**", { size: "l" });
  const cells: [string, ColorName][] = [
    ["🔥 Срочно и важно — сделать сейчас", "red"],
    ["📅 Важно, не срочно — запланировать", "blue"],
    ["🤝 Срочно, не важно — поручить", "yellow"],
    ["🗑️ Не срочно и не важно — отложить", "gray"],
  ];
  cells.forEach(([name, c], i) => {
    const x = (i % 2) * 480;
    const y = Math.floor(i / 2) * 400;
    const f = t.frame(x, y, 440, 340, name, c);
    t.task(x + 20, y + 50, 400, "Задача", { parent: f, color: c });
  });
  return t.clip();
}

function brainstorm(): Clip {
  const t = new TB();
  const topic = t.shape(-170, -70, 340, 140, "cloud", "**Тема штурма**", { color: "violet", size: "m" });
  const colors: ColorName[] = ["yellow", "pink", "blue", "green", "orange", "cyan", "violet", "red"];
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(Math.cos(a) * 420 - 110);
    const y = Math.round(Math.sin(a) * 300 - 50);
    const n = t.note(x, y, 220, "Идея", { color: c });
    if (i % 2 === 0) t.arrow(topic, n, { head1: "none", dash: "dot", color: c });
  });
  t.timer(620, -330, 10, "Генерируем идеи");
  t.poll(620, -160, 300, "**Лучшая идея?**", ["Идея 1", "Идея 2", "Идея 3"], undefined, true);
  return t.clip();
}

function week(): Clip {
  const t = new TB();
  const days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  days.forEach((d, i) => {
    const weekend = i >= 5;
    const f = t.frame(i * 270, 0, 250, 520, d, weekend ? "green" : "default");
    t.task(i * 270 + 15, 50, 220, weekend ? "Отдых 🌿" : "Главное на день", { parent: f, color: weekend ? "green" : undefined });
  });
  return t.clip();
}

function prosCons(): Clip {
  const t = new TB();
  t.text(0, -90, 860, "**Решение:** что выбираем?", { size: "l" });
  const fa = t.frame(0, 0, 400, 460, "👍 За", "green");
  const fb = t.frame(440, 0, 400, 460, "👎 Против", "red");
  t.note(20, 50, 360, "Аргумент", { parent: fa, color: "green" });
  t.note(460, 50, 360, "Аргумент", { parent: fb, color: "red" });
  t.poll(880, 0, 300, "**Итог**", ["Делаем", "Не делаем", "Нужно подумать"]);
  return t.clip();
}


/* ------------------------------ для игр ------------------------------ */

function tactics(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1000, 680, "🗺️ Карта", "default");
  const top = t.shape(300, 70, 400, 70, "pill", "Верх", { parent: f, color: "gray" });
  const mid = t.shape(400, 270, 200, 140, "ellipse", "**Центр**", { parent: f, color: "yellow" });
  const bot = t.shape(300, 540, 400, 70, "pill", "Низ", { parent: f, color: "gray" });
  t.shape(40, 260, 150, 160, "rect", "**База A**", { parent: f, color: "blue" });
  t.shape(810, 260, 150, 160, "rect", "**База B**", { parent: f, color: "red" });
  const lanes = [top, mid, bot];
  const blue = [0, 1, 2].map((i) => t.shape(214, 228 + i * 80, 56, 56, "ellipse", String(i + 1), { parent: f, color: "blue", fill: "solid" }));
  const red = [0, 1, 2].map((i) => t.shape(730, 228 + i * 80, 56, 56, "ellipse", String(i + 1), { parent: f, color: "red", fill: "solid" }));
  blue.forEach((id, i) => t.arrow(id, lanes[i]!, { color: "blue", dash: "dash", route: i === 1 ? "straight" : "curve" }));
  red.forEach((id, i) => t.arrow(id, lanes[i]!, { color: "red", dash: "dot", route: i === 1 ? "straight" : "curve" }));
  t.sticker(910, 50, 60, "⚔️", f);
  const g = t.frame(1040, 0, 360, 680, "📋 План раунда", "violet");
  t.note(1060, 50, 320, "**Цель:** забрать центр и удержать\n- [ ] Разведка верха\n- [ ] Дым на центр\n- [ ] Перейти на B", { parent: g, color: "violet" });
  t.poll(1060, 250, 320, "**Как заходим?**", ["Через верх", "Раш центра", "Тихо по низу"], g);
  t.timer(1100, 500, 2, "Раунд", g);
  return t.clip();
}

function bracket(): Clip {
  const t = new TB();
  const W = 200;
  const H = 52;
  const qy = [0, 64, 168, 232, 336, 400, 504, 568];
  const sy = [32, 200, 368, 536];
  const fy = [116, 452];
  ["Четвертьфинал", "Полуфинал", "Финал", "Победитель"].forEach((n, i) => t.text(i * 300, -70, W, `**${n}**`, { size: "s", align: "center", color: "gray" }));
  const q = qy.map((y, i) => t.shape(0, y, W, H, "rect", `Команда ${i + 1}`, { color: "default" }));
  const sf = sy.map((y) => t.shape(300, y, W, H, "rect", "…", { color: "blue" }));
  const fi = fy.map((y) => t.shape(600, y, W, H, "rect", "…", { color: "violet" }));
  const win = t.shape(890, 278, 220, 64, "pill", "🏆 **Победитель**", { color: "yellow", fill: "solid" });
  q.forEach((id, i) => t.arrow(id, sf[i >> 1]!, { route: "elbow", head1: "none", color: "gray" }));
  sf.forEach((id, i) => t.arrow(id, fi[i >> 1]!, { route: "elbow", head1: "none", color: "gray" }));
  fi.forEach((id) => t.arrow(id, win, { route: "elbow", head1: "none", color: "yellow" }));
  return t.clip();
}

function scoreboard(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 780, 540, "🏆 Табло", "default");
  t.counter(40, 60, "Команда A", { parent: f, color: "blue", w: 330, h: 220 });
  t.counter(410, 60, "Команда B", { parent: f, color: "red", w: 330, h: 220 });
  t.counter(40, 320, "Раунд", { parent: f, n0: 1 });
  t.timer(260, 320, 3, "Время раунда", f);
  t.dice(520, 320, 2, 6, { parent: f });
  return t.clip();
}

function rpg(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1000, 800, "🧙 Лист персонажа", "violet");
  const hero = t.wd("stats", 40, 60, {
    w: 420,
    title: "Имя героя",
    desc: "Воин · человек · уровень 1",
    emoji: "🛡️",
    parent: f,
    pl: [
      { id: "hp", t: "Здоровье", c: "red", m: 20 },
      { id: "mp", t: "Мана", c: "blue", m: 10 },
      { id: "str", t: "Сила", c: "orange" },
      { id: "dex", t: "Ловкость", c: "green" },
      { id: "con", t: "Телосложение", c: "yellow" },
      { id: "int", t: "Интеллект", c: "violet" },
    ],
    "sc:hp": 20,
    "sc:mp": 10,
    "sc:str": 14,
    "sc:dex": 12,
    "sc:con": 13,
    "sc:int": 8,
  });
  const d20 = t.dice(500, 60, 1, 20, { parent: f });
  t.counter(740, 60, "Золото", { parent: f, color: "yellow", n0: 50, step: 5, h: 170 });
  const hit = t.widget("button", 40, 430, 200, 72, { title: "Удар −3", emoji: "💥", color: "red", parent: f });
  const rest = t.widget("button", 260, 430, 200, 72, { title: "Отдых", emoji: "🔥", color: "green", parent: f });
  t.arrow(hit, hero, { lg: { on: "press", do: "sub", n: 3, x: "hp" } });
  t.arrow(rest, hero, { lg: { on: "press", do: "reset" } });
  const dead = t.sticker(530, 290, 90, "💀", f);
  t.nodes.find((n) => n.id === dead)!.hid = true;
  t.arrow(hero, dead, { lg: { on: "zero", do: "show", tx: "hp", rev: true } });
  t.progress(500, 430, 460, "Опыт до 2 уровня", 35, { parent: f, color: "green" });
  t.note(40, 540, 420, "**🎒 Инвентарь**\n- [x] Меч\n- [ ] Зелье лечения ×2\n- [ ] Верёвка, факел", { parent: f, color: "yellow" });
  t.note(500, 560, 460, "**📜 Задание:** найти пропавший караван у старой мельницы", { parent: f });
  t.text(500, 690, 460, "«Удар» отнимает здоровье, «Отдых» восстанавливает шкалы. На нуле появится череп.", { parent: f, size: "s", color: "gray" });
  void d20;
  return t.clip();
}

function tierList(): Clip {
  const t = new TB();
  const tiers: [string, string, ColorName][] = [
    ["S", "Шедевр", "red"],
    ["A", "Отлично", "orange"],
    ["B", "Хорошо", "yellow"],
    ["C", "Так себе", "green"],
    ["D", "Мимо", "blue"],
  ];
  tiers.forEach(([k, name, c], i) => {
    const y = i * 164;
    t.shape(0, y, 110, 130, "sharp", `**${k}**`, { color: c, fill: "solid", size: "xl" });
    t.frame(124, y, 1040, 130, name, c);
  });
  t.note(144, 46, 170, "Пример", { color: "red", h: 70 });
  const pool = t.frame(0, 5 * 164 + 20, 1164, 200, "🗃️ Не распределено", "gray");
  for (let i = 0; i < 6; i++) t.note(20 + i * 190, 5 * 164 + 70, 170, `Вариант ${i + 1}`, { parent: pool, h: 70 });
  return t.clip();
}

/* ------------------------------ команда ------------------------------ */

function meeting(): Clip {
  const t = new TB();
  t.text(0, -90, 900, "**Встреча команды** · тема и дата", { size: "l" });
  const a = t.frame(0, 0, 420, 420, "📋 Повестка", "blue");
  t.note(20, 50, 380, "- [ ] Итоги прошлой недели\n- [ ] Главный вопрос\n- [ ] Разное", { parent: a, color: "blue" });
  t.timer(90, 240, 10, "На вопрос", a);
  const b = t.frame(460, 0, 420, 420, "💬 Обсуждение", "violet");
  t.note(480, 50, 380, "Мысль или вопрос", { parent: b, color: "violet" });
  t.note(480, 190, 380, "Ещё мысль", { parent: b });
  const c = t.frame(920, 0, 420, 420, "✅ Решения и задачи", "green");
  t.note(940, 50, 380, "**Решили:** …", { parent: c, color: "green" });
  t.task(940, 170, 380, "Кто и что делает", { parent: c, prio: "high", due: 2 });
  t.task(940, 270, 380, "Следующий шаг", { parent: c, due: 7 });
  t.poll(1380, 0, 300, "**Как прошла встреча?**", ["🔥 Отлично", "🙂 Нормально", "😴 Можно короче"]);
  return t.clip();
}

function sprint(): Clip {
  const t = new TB();
  t.text(0, -120, 1000, "**Спринт 1** — цель: …", { size: "l" });
  t.progress(0, -50, 560, "Дни спринта", 0, { steps: 10 });
  const done = t.progress(600, -50, 500, "Сделано задач", 0, { color: "green" });
  const kb = t.wd("kanban", 0, 80, {
    w: 1100,
    title: "Задачи спринта",
    kb: [
      { id: "a", t: "📥 Бэклог", c: "gray" },
      { id: "b", t: "🏃 В спринте", c: "blue", lim: 4 },
      { id: "c", t: "👀 Ревью", c: "yellow", lim: 2 },
      { id: "d", t: "✅ Готово", c: "green" },
    ],
    ...cards([
      ["a", "Задача из бэклога"],
      ["a", "Ещё задача"],
      ["b", "Главная задача спринта", "red"],
      ["b", "Исправить баг со входом", "orange"],
      ["c", "Проверить и влить"],
    ]),
  });
  t.arrow(kb, done, { route: "straight", lg: { on: "change", do: "share" } });
  const est = t.wd("estimate", 1160, 80, { title: "Оцениваем задачу", pk: "fib" });
  const tm = t.timer(1160, 410, 2, "На обсуждение");
  t.arrow(tm, est, { lg: { on: "end", do: "reveal" } });
  const sp = t.counter(1420, 410, "Очки в спринте", { color: "violet", w: 200, h: 150 });
  t.arrow(est, sp, { lg: { on: "reveal", do: "addsrc", rev: false } });
  t.text(1160, 590, 460, "Каждый выбирает карту вслепую; когда выйдет время, карты откроются сами. Среднее — в счётчик очков.", { size: "s", color: "gray" });
  return t.clip();
}

/* ------------------------- планы и стратегия ------------------------- */

function okr(): Clip {
  const t = new TB();
  const goals: [string, ColorName, [string, number][]][] = [
    ["🎯 Цель 1: …", "violet", [["KR 1: …", 60], ["KR 2: …", 30], ["KR 3: …", 10]]],
    ["🎯 Цель 2: …", "blue", [["KR 1: …", 80], ["KR 2: …", 45], ["KR 3: …", 0]]],
  ];
  goals.forEach(([name, c, krs], i) => {
    const x = i * 600;
    const f = t.frame(x, 0, 560, 470, name, c);
    krs.forEach(([kr, pv], k) => t.progress(x + 20, 50 + k * 110, 520, kr, pv, { parent: f, color: c }));
    t.note(x + 20, 390, 520, "**Почему это важно:** …", { parent: f, color: c });
  });
  return t.clip();
}

function lean(): Clip {
  const t = new TB();
  const W = 280;
  const G = 20;
  const col = (i: number) => i * (W + G);
  const box = (x: number, y: number, w: number, h: number, name: string, c: ColorName, hint: string) => {
    const f = t.frame(x, y, w, h, name, c);
    t.note(x + 16, y + 50, w - 32, hint, { parent: f, color: c, size: "s" });
  };
  box(col(0), 0, W, 600, "Проблема", "red", "Три главные проблемы клиента");
  box(col(1), 0, W, 290, "Решение", "green", "Как решаем каждую");
  box(col(1), 310, W, 290, "Ключевые метрики", "cyan", "Что считаем успехом");
  box(col(2), 0, W, 600, "Ценностное предложение", "violet", "Почему именно мы — в одной фразе");
  box(col(3), 0, W, 290, "Преимущество", "orange", "Что нельзя легко скопировать");
  box(col(3), 310, W, 290, "Каналы", "blue", "Как о нас узнают");
  box(col(4), 0, W, 600, "Сегменты клиентов", "yellow", "Для кого делаем и кто первые");
  const half = (5 * W + 4 * G - G) / 2;
  box(0, 620, half, 240, "Издержки", "gray", "На что тратим");
  box(half + G, 620, half, 240, "Доходы", "green", "Как и сколько зарабатываем");
  return t.clip();
}

/* ----------------------------- схемы и идеи ----------------------------- */

function orgChart(): Clip {
  const t = new TB();
  const boss = t.shape(580, 0, 220, 84, "rect", "**Руководитель**\nИмя", { color: "violet", fill: "solid" });
  const heads: [string, ColorName][] = [
    ["Продукт", "blue"],
    ["Разработка", "green"],
    ["Маркетинг", "orange"],
  ];
  heads.forEach(([name, c], i) => {
    const x = 100 + i * 480;
    const h = t.shape(x, 190, 220, 76, "rect", `**${name}**\nИмя`, { color: c });
    t.arrow(boss, h, { route: "elbow", head1: "none", color: "gray" });
    for (let k = 0; k < 2; k++) {
      const m = t.shape(x - 110 + k * 240, 350, 200, 64, "pill", "Сотрудник", { color: c, size: "s" });
      t.arrow(h, m, { route: "elbow", head1: "none", color: c });
    }
  });
  return t.clip();
}

function moodboard(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1240, 700, "🎨 Мудборд", "default");
  t.text(40, 50, 300, "**Цвета**", { parent: f, size: "s" });
  (["violet", "pink", "orange", "yellow", "cyan"] as ColorName[]).forEach((c, i) => t.shape(40 + i * 120, 100, 100, 100, "ellipse", "", { parent: f, color: c, fill: "solid" }));
  t.text(40, 240, 300, "**Референсы**", { parent: f, size: "s" });
  for (let i = 0; i < 4; i++) t.shape(40 + i * 290, 290, 270, 220, "rect", "Перетащите картинку", { parent: f, color: "gray" });
  t.text(40, 550, 300, "**Настроение**", { parent: f, size: "s" });
  ["уютно", "неон", "ретро", "мягкий свет", "ночной город"].forEach((w, i) => t.shape(40 + i * 180, 600, 160, 52, "pill", w, { parent: f, color: (["pink", "cyan", "orange", "yellow", "violet"] as ColorName[])[i] }));
  t.note(960, 560, 240, "Что хотим передать одной фразой?", { parent: f, color: "yellow" });
  t.sticker(1120, 60, 72, "✨", f);
  t.sticker(1040, 120, 56, "🌙", f);
  return t.clip();
}

export const TEMPLATES: Template[] = [
  /* игры */
  { id: "habits", group: "Интерактив и логика", label: "Трекер привычек", desc: "Отметки по дням, общий прогресс и награда", words: "привычки трекер неделя логика прогресс", build: habits },
  { id: "quest", group: "Интерактив и логика", label: "Квест с наградой", desc: "Задания → опыт и прогресс → сундук открывается сам", words: "квест игра задания опыт xp награда логика геймификация", build: quest },
  { id: "buzzer", group: "Интерактив и логика", label: "Викторина", desc: "Кнопки очков, колесо и таймер на ответ", words: "викторина квиз кнопки счёт колесо игра", build: buzzer },
  { id: "standup", group: "Интерактив и логика", label: "Ежедневный созвон", desc: "Часы команды, статусы, колесо и таймер", words: "стендап созвон часы пояса статус команда", build: standup },
  { id: "decide", group: "Интерактив и логика", label: "Решаем вместе", desc: "Оценки вариантов и живая диаграмма", words: "решение оценка рейтинг диаграмма голосование", build: decide },
  { id: "logic", group: "Интерактив и логика", label: "Как работает логика", desc: "Примеры: свет, кубики, ползунок и статус", words: "логика пример обучение автоматизация стрелки", build: logicDemo },
  { id: "game", group: "Игры", label: "Игровой вечер", desc: "Во что и когда играем, роли, перерыв", words: "игра друзья голосование план встреча", build: gameNight },
  { id: "tactics", group: "Игры", label: "Тактическая карта", desc: "Зоны, команды, маршруты и план раунда", words: "игра тактика карта стратегия рейд матч cs dota", build: tactics },
  { id: "bracket", group: "Игры", label: "Турнирная сетка", desc: "8 команд: от четвертьфинала до победы", words: "турнир сетка плей-офф bracket киберспорт", build: bracket },
  { id: "score", group: "Игры", label: "Табло", desc: "Счёт команд, раунды, таймер и кубики", words: "счёт очки игра раунд табло", build: scoreboard },
  { id: "rpg", group: "Игры", label: "Лист персонажа", desc: "Настольная ролевая: шкалы, d20, опыт", words: "dnd d&d днд ролевая персонаж кубик настолка", build: rpg },
  { id: "tier", group: "Игры", label: "Тир-лист", desc: "Расставьте всё от S до D", words: "тир лист рейтинг tier list топ", build: tierList },
  { id: "gdd", group: "Разработка и дизайн", label: "Диздок игры", desc: "Концепция, цикл, персонажи, уровни", words: "игра gdd геймдизайн разработка", build: gdd },
  { id: "balance", group: "Разработка и дизайн", label: "Баланс прокачки", desc: "Уровень → кривые опыта, силы и цен", words: "баланс формулы кривая опыт уровни прокачка экономика геймдизайн", build: balance },
  { id: "level", group: "Разработка и дизайн", label: "Карта уровня", desc: "Остров, подземелье, цели и сундук", words: "уровень карта тайлы левел дизайн локация подземелье", build: level },
  { id: "loot", group: "Разработка и дизайн", label: "Добыча и награды", desc: "Сундук с шансами, кнопка и счётчики", words: "лут дроп сундук награда шанс редкость гача", build: lootbox },
  { id: "heroes", group: "Разработка и дизайн", label: "Персонажи и враги", desc: "Карточки с шкалами и бой с боссом", words: "персонажи враги босс характеристики hp юниты баланс rpg", build: heroes },
  { id: "hud", group: "Разработка и дизайн", label: "Интерфейс игры", desc: "Экран 16:9: здоровье, слоты, мини-карта", words: "hud интерфейс игры ui экран меню макет", build: hud },
  { id: "app", group: "Разработка и дизайн", label: "Макет приложения", desc: "Три экрана телефона и переходы", words: "макет приложение мобильное прототип ui ux экраны вайрфрейм", build: appMockup },
  { id: "style", group: "Разработка и дизайн", label: "Стайлгайд", desc: "Палитры, шрифты, кнопки и тон", words: "стайлгайд гайдлайн бренд цвета шрифты дизайн-система", build: styleGuide },
  { id: "playtest", group: "Разработка и дизайн", label: "Плейтест", desc: "Оценки, впечатления и доска багов", words: "плейтест тест отзывы баги фидбек игра", build: playtest },
  /* команда */
  { id: "meeting", group: "Команда", label: "Встреча", desc: "Повестка, обсуждение, решения и задачи", words: "встреча созвон митинг повестка протокол", build: meeting },
  { id: "brainstorm", group: "Команда", label: "Мозговой штурм", desc: "Тема, идеи, таймер и голосование", words: "идеи штурм brainstorm", build: brainstorm },
  { id: "retro", group: "Команда", label: "Ретроспектива", desc: "Хорошо, улучшить, дальше", words: "ретро итоги команда", build: retro },
  { id: "sprint", group: "Команда", label: "Спринт", desc: "Канбан, покер планирования и таймер", words: "спринт scrum скрам оценка покер agile", build: sprint },
  { id: "kanban", group: "Команда", label: "Канбан", desc: "Колонки, карточки и прогресс", words: "доска задачи проект kanban трелло", build: kanban },
  /* планы */
  { id: "roadmap", group: "Планы и стратегия", label: "Дорожная карта", desc: "Этапы по кварталам и готовность", words: "roadmap план сроки этапы гант релиз", build: roadmap },
  { id: "okr", group: "Планы и стратегия", label: "Цели и результаты", desc: "OKR: цели с прогрессом ключевых результатов", words: "okr цели kpi результаты прогресс", build: okr },
  { id: "week", group: "Планы и стратегия", label: "План на неделю", desc: "Семь дней — семь колонок", words: "неделя расписание календарь", build: week },
  { id: "lean", group: "Планы и стратегия", label: "Lean Canvas", desc: "Бизнес-идея на одном листе", words: "бизнес стартап модель lean canvas", build: lean },
  { id: "swot", group: "Планы и стратегия", label: "SWOT-анализ", desc: "Сильные и слабые стороны", words: "swot анализ стратегия", build: swot },
  { id: "eisenhower", group: "Планы и стратегия", label: "Матрица Эйзенхауэра", desc: "Срочно / важно", words: "приоритеты матрица дела", build: eisenhower },
  { id: "pros", group: "Планы и стратегия", label: "За и против", desc: "Аргументы и итоговое решение", words: "решение выбор сравнение", build: prosCons },
  /* схемы */
  { id: "mindmap", group: "Схемы и идеи", label: "Майнд-карта", desc: "Идея в центре и ветки вокруг", words: "интеллект карта mind map мысли", build: mindmap },
  { id: "flow", group: "Схемы и идеи", label: "Блок-схема", desc: "Начало, действия, условия", words: "алгоритм процесс flowchart схема", build: flowchart },
  { id: "org", group: "Схемы и идеи", label: "Оргструктура", desc: "Кто за что отвечает", words: "структура команда иерархия org chart", build: orgChart },
  { id: "journey", group: "Схемы и идеи", label: "Путь пользователя", desc: "Этапы, мысли и эмоции", words: "cjm customer journey ux", build: journey },
  { id: "mood", group: "Схемы и идеи", label: "Мудборд", desc: "Цвета, референсы и настроение", words: "мудборд moodboard дизайн вдохновение референсы", build: moodboard },
];

/* ------------------------- интерактив и логика ------------------------- */

function habits(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 900, 640, "🌱 Трекер привычек", "green");
  const a = t.widget("tracker", 40, 60, 400, 150, { title: "💪 Зарядка", cells: 7, color: "green", parent: f });
  const b = t.widget("tracker", 40, 230, 400, 150, { title: "📚 Чтение 20 минут", cells: 7, color: "blue", parent: f });
  const c = t.widget("tracker", 40, 400, 400, 150, { title: "💧 Вода 2 литра", cells: 7, color: "cyan", parent: f });
  const p = t.progress(520, 120, 340, "Неделя", 0, { parent: f, color: "green" });
  const r = t.widget("chart", 520, 300, 340, 250, { title: "Отмечено дней", ct: "bar", parent: f });
  t.arrow(a, p, { lg: { on: "change", do: "share" } });
  t.arrow(b, p, { lg: { on: "change", do: "share" } });
  t.arrow(c, p, { lg: { on: "change", do: "share" } });
  t.arrow(a, r, { dash: "dot" });
  t.arrow(b, r, { dash: "dot" });
  t.arrow(c, r, { dash: "dot" });
  const s = t.sticker(800, 30, 70, "🏆", f);
  t.arrow(p, s, { lg: { on: "full", do: "fx", x: "fanfare", rev: false } });
  t.text(40, 580, 820, "Отмечайте клетки — полоса «Неделя» заполняется сама, а на 100 % будут фанфары. Стрелки с ⚡ — это логика: выделите стрелку, чтобы поменять правило.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

function quest(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1000, 620, "🗺️ Квест с наградой", "violet");
  const q1 = t.task(40, 70, 320, "Найти карту в библиотеке", { parent: f });
  const q2 = t.task(40, 170, 320, "Разгадать загадку сфинкса", { parent: f });
  const q3 = t.task(40, 270, 320, "Победить дракона", { parent: f, prio: "high" });
  const p = t.progress(420, 80, 300, "Прогресс квеста", 0, { parent: f, color: "violet", steps: 3 });
  const xp = t.counter(780, 60, "Опыт (XP)", { parent: f, color: "yellow", w: 180, h: 150 });
  t.arrow(q1, p, { lg: { on: "change", do: "share" } });
  t.arrow(q2, p, { lg: { on: "change", do: "share" } });
  t.arrow(q3, p, { lg: { on: "change", do: "share" } });
  t.arrow(q1, xp, { lg: { on: "done", do: "add", n: 50, rev: true } });
  t.arrow(q2, xp, { lg: { on: "done", do: "add", n: 50, rev: true } });
  t.arrow(q3, xp, { lg: { on: "done", do: "add", n: 100, rev: true } });
  const g = t.widget("gate", 470, 260, 150, 110, { gm: "and", parent: f });
  t.arrow(q1, g, { dash: "dot" });
  t.arrow(q2, g, { dash: "dot" });
  t.arrow(q3, g, { dash: "dot" });
  const prize = t.note(420, 430, 300, "## 🎁 Сундук открыт!\nНаграда: легендарный меч и 500 золотых.", { parent: f, color: "yellow" });
  const chest = t.sticker(780, 300, 110, "🧰", f);
  t.arrow(g, prize, { lg: { on: "on", do: "show", rev: true } });
  t.arrow(g, chest, { lg: { on: "on", do: "fx", x: "confetti", rev: false } });
  t.nodes.find((n) => n.id === prize)!.hid = true;
  t.text(40, 560, 920, "Отмечайте задания: растёт прогресс и опыт. Когда выполнены все три, логический блок «И» откроет сундук — заметка с наградой появится сама.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

function buzzer(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 900, 560, "🔔 Викторина с кнопками", "orange");
  const a = t.counter(40, 60, "Команда A", { parent: f, color: "blue", w: 260, h: 180 });
  const b = t.counter(600, 60, "Команда B", { parent: f, color: "red", w: 260, h: 180 });
  const ba = t.widget("button", 40, 270, 260, 80, { title: "+1 команде A", emoji: "🔵", color: "blue", parent: f });
  const bb = t.widget("button", 600, 270, 260, 80, { title: "+1 команде B", emoji: "🔴", color: "red", parent: f });
  t.arrow(ba, a, { lg: { on: "press", do: "add", n: 1 } });
  t.arrow(bb, b, { lg: { on: "press", do: "add", n: 1 } });
  const wh = t.widget("wheel", 330, 40, 240, 300, { title: "Кто отвечает", parent: f, opts: ["Аня", "Борис", "Вика", "Гоша", "Даша", "Егор"].map((x, i) => ({ id: `o${i + 1}`, t: x })) });
  const tm = t.timer(330, 370, 1, "На ответ", f);
  t.arrow(wh, tm, { lg: { on: "result", do: "start" } });
  const gong = t.sticker(80, 400, 90, "🔔", f);
  t.arrow(tm, gong, { lg: { on: "end", do: "fx", x: "ding" } });
  t.text(600, 400, 260, "Крутите колесо — таймер запустится сам. Кнопки прибавляют очки.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

function standup(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 980, 560, "☕ Ежедневный созвон", "blue");
  t.widget("clock", 40, 60, 200, 120, { tz: "Europe/Moscow", parent: f });
  t.widget("clock", 260, 60, 200, 120, { tz: "Europe/London", parent: f });
  t.widget("clock", 480, 60, 200, 120, { tz: "America/New_York", parent: f });
  t.widget("countdown", 700, 60, 240, 120, { title: "До релиза", at: Date.now() + 14 * 86_400_000, parent: f });
  const people = ["Аня", "Борис", "Вика"];
  people.forEach((n, i) => t.widget("status", 40, 220 + i * 74, 300, 60, { title: n, st: i % 3, parent: f }));
  t.widget("wheel", 380, 210, 260, 310, { title: "Кто начинает", parent: f, opts: people.map((x, i) => ({ id: `o${i + 1}`, t: x })) });
  t.timer(680, 220, 15, "Созвон", f);
  t.widget("rating", 680, 400, 260, 96, { title: "Как прошло?", parent: f });
  return t.clip();
}

function decide(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 940, 560, "⚖️ Решаем вместе", "pink");
  const r1 = t.widget("rating", 40, 70, 280, 96, { title: "Вариант A", parent: f });
  const r2 = t.widget("rating", 40, 190, 280, 96, { title: "Вариант B", parent: f });
  const r3 = t.widget("rating", 40, 310, 280, 96, { title: "Вариант C", parent: f });
  const ch = t.widget("chart", 380, 70, 520, 330, { title: "Средняя оценка", ct: "bar", color: "pink", parent: f });
  t.arrow(r1, ch, { dash: "dot" });
  t.arrow(r2, ch, { dash: "dot" });
  t.arrow(r3, ch, { dash: "dot" });
  t.widget("slider", 40, 430, 420, 96, { title: "Насколько срочно", sv: 50, min: 0, max: 100, unit: "%", parent: f });
  t.text(500, 440, 400, "Каждый ставит свою оценку — диаграмма обновляется у всех сразу.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

function logicDemo(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1000, 600, "⚡ Как работает логика", "cyan");
  const sw = t.widget("switch", 40, 70, 240, 72, { title: "Свет", parent: f });
  const lamp = t.sticker(370, 60, 90, "💡", f);
  t.arrow(sw, lamp, { lg: { on: "on", do: "show", rev: true } });
  t.nodes.find((n) => n.id === lamp)!.hid = true;
  const btn = t.widget("button", 40, 200, 240, 80, { title: "Бросить", emoji: "🎲", parent: f });
  const dice = t.dice(370, 170, 2, 6, { parent: f, h: 150 });
  const sum = t.counter(700, 170, "Сумма бросков", { parent: f, color: "green", w: 240, h: 150 });
  t.arrow(btn, dice, { lg: { on: "press", do: "roll" } });
  t.arrow(dice, sum, { lg: { on: "roll", do: "addsrc" } });
  const sl = t.widget("slider", 40, 360, 300, 96, { title: "Громкость", sv: 30, parent: f });
  const pr = t.progress(400, 375, 300, "Как ползунок", 30, { parent: f, color: "cyan" });
  t.arrow(sl, pr, { lg: { on: "change", do: "share" } });
  const st = t.widget("status", 760, 380, 200, 56, { parent: f });
  t.arrow(pr, st, { lg: { on: "full", do: "setst", x: "3", rev: false } });
  t.text(40, 500, 920, "Проведите стрелку от одного объекта к другому, выделите её и нажмите ⚡ «Логика» — выберите, когда и что делать. Попробуйте: включите свет, нажмите кнопку, сдвиньте ползунок до конца.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

/* ------------------------- разработка и дизайн ------------------------- */

function balance(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1240, 900, "📈 Баланс прокачки", "violet");
  const lv = t.widget("slider", 420, 60, 790, 96, { title: "Уровень героя", sv: 10, min: 1, max: 50, step: 1, color: "violet", parent: f });
  const xp = t.wd("curve", 420, 200, { w: 380, h: 300, title: "Опыт до уровня", min: 1, max: 50, parent: f, fs: [{ id: "a", f: "round(100 * x^1.5)", t: "Опыт", c: "violet" }] });
  const hero = t.wd("curve", 830, 200, {
    w: 380,
    h: 300,
    title: "Сила героя",
    min: 1,
    max: 50,
    parent: f,
    fs: [
      { id: "a", f: "50 + 12x", t: "Здоровье", c: "red" },
      { id: "b", f: "round(10 * 1.06^x)", t: "Урон", c: "orange" },
    ],
  });
  t.arrow(lv, xp, { dash: "dot" });
  t.arrow(lv, hero, { dash: "dot" });
  t.note(40, 60, 340, "**Как пользоваться**\nДвигайте ползунок — кривые отмечают значения на этом уровне.\n\nФормулы — в инспекторе: x — уровень; можно ^, sqrt, log, round, min, max и if(условие, да, нет).", { parent: f, color: "violet" });
  t.wd("curve", 420, 540, { w: 790, h: 320, title: "Цена улучшения в магазине", min: 1, max: 12, tb: true, parent: f, fs: [{ id: "a", f: "round(50 * 1.35^(x-1))", t: "Цена, золото", c: "yellow" }] });
  t.note(40, 300, 340, "**💡 Совет**\nКривая опыта растёт быстрее силы — значит, каждый новый уровень даётся дольше. Сравнивайте формулы на одном графике.", { parent: f, color: "yellow" });
  return t.clip();
}

function level(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1260, 680, "🗺️ Уровень 1-1: Остров и подземелье", "green");
  t.wd("tilemap", 40, 60, {
    w: 780,
    h: 520,
    title: "Карта уровня",
    parent: f,
    ...mapRows([
      "~~~~~~~~~~~~~~~~~~~~",
      "~ssssss~~~~~WWWWWWW~",
      "~sggTgs~~~~~W..e..W~",
      "~sgHggss~~~~W.....W~",
      "~sggggssss~~W..C..W~",
      "~sgTgggggs..D.....W~",
      "~ssggKgggs~~W.....W~",
      "~~sgggggTs~~W.LLL.W~",
      "~~ssgEggs~~~W.LLL.W~",
      "~~~sssss~~~~W.....W~",
      "~~~~~~~~~~~~WWWWWWW~",
      "~~~~~~~~~~~~~~~~~~~~",
    ]),
  });
  t.note(860, 60, 360, "**🎯 Цели уровня**\n- [ ] Найти ключ 🔑\n- [ ] Открыть дверь в подземелье\n- [ ] Забрать сундук 💰\n- [ ] Не наступить в лаву", { parent: f, color: "green" });
  t.wd("loot", 860, 270, { w: 360, title: "Сундук в подземелье", parent: f });
  t.text(40, 600, 780, "Выделите карту: кисть рисует местность, заливка красит область, ластик стирает. Предметы ставятся поверх клеток.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

function lootbox(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1100, 640, "🎁 Добыча и награды", "yellow");
  const chest = t.wd("loot", 40, 60, {
    w: 380,
    title: "Сундук героя",
    parent: f,
    lo: [
      { id: "a", t: "🪙 Горсть монет", w: 50, c: "gray" },
      { id: "b", t: "🧪 Зелье лечения", w: 25, c: "green" },
      { id: "c", t: "🗡️ Стальной меч", w: 15, c: "blue" },
      { id: "d", t: "💍 Кольцо силы", w: 8, c: "violet" },
      { id: "e", t: "🐉 Чешуя дракона", w: 2, c: "orange" },
    ],
  });
  const btn = t.widget("button", 90, 470, 280, 80, { title: "Открыть сундук", emoji: "🗝️", color: "yellow", parent: f });
  t.arrow(btn, chest, { lg: { on: "press", do: "open" } });
  const opened = t.counter(520, 70, "Открыто сундуков", { parent: f, w: 280, h: 150 });
  t.arrow(chest, opened, { lg: { on: "drop", do: "add", n: 1 } });
  const legend = t.counter(520, 290, "Легендарные находки", { parent: f, color: "orange", w: 280, h: 150 });
  t.arrow(chest, legend, { lg: { on: "dropx", tx: "🐉 Чешуя дракона", do: "add", n: 1 } });
  const dragon = t.sticker(890, 305, 120, "🐉", f);
  t.arrow(legend, dragon, { lg: { on: "inc", do: "fx", x: "fanfare", rev: false } });
  t.text(520, 490, 540, "Нажмите кнопку — сундук разыграет добычу по весам (шансы — в инспекторе). Выпала легендарка — +1 в счётчик и фанфары у дракона.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

function heroes(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1260, 480, "⚔️ Персонажи и враги", "pink");
  const unit = (x: number, title: string, desc: string, emoji: string, pl: { id: string; t: string; c: string; m?: number; v: number }[]) =>
    t.wd("stats", x, 60, { w: 320, title, desc, emoji, parent: f, pl: pl.map(({ v: _v, ...st }) => st), ...Object.fromEntries(pl.map((st) => [`sc:${st.id}`, st.v])) });
  unit(40, "Воин", "Танк · ближний бой", "🛡️", [
    { id: "hp", t: "Здоровье", c: "red", m: 120, v: 120 },
    { id: "st", t: "Энергия", c: "yellow", m: 60, v: 60 },
    { id: "atk", t: "Атака", c: "orange", v: 14 },
    { id: "def", t: "Защита", c: "gray", v: 12 },
  ]);
  unit(390, "Маг", "Урон по области", "🔮", [
    { id: "hp", t: "Здоровье", c: "red", m: 70, v: 70 },
    { id: "mp", t: "Мана", c: "blue", m: 120, v: 120 },
    { id: "atk", t: "Атака", c: "orange", v: 20 },
    { id: "def", t: "Защита", c: "gray", v: 5 },
  ]);
  const boss = unit(740, "Каменный голем", "Босс · 1 этап", "🗿", [
    { id: "hp", t: "Здоровье", c: "red", m: 300, v: 300 },
    { id: "rage", t: "Ярость", c: "violet", m: 100, v: 30 },
    { id: "atk", t: "Атака", c: "orange", v: 25 },
    { id: "def", t: "Защита", c: "gray", v: 18 },
  ]);
  const hit = t.widget("button", 740, 340, 150, 72, { title: "Удар −40", emoji: "⚔️", color: "red", parent: f });
  const heal = t.widget("button", 910, 340, 150, 72, { title: "Заново", emoji: "🔁", parent: f });
  t.arrow(hit, boss, { lg: { on: "press", do: "sub", n: 40, x: "hp" } });
  t.arrow(heal, boss, { lg: { on: "press", do: "reset" } });
  const win = t.sticker(1100, 110, 120, "🏆", f);
  t.nodes.find((n) => n.id === win)!.hid = true;
  t.arrow(boss, win, { lg: { on: "zero", tx: "hp", do: "show", rev: true } });
  t.text(40, 350, 660, "Карточки персонажей — шкалы с пределом и простые числа. Кнопки меняют шкалы через логику: бейте голема, пока не появится кубок.", { parent: f, size: "s", color: "gray" });
  return t.clip();
}

function appMockup(): Clip {
  const t = new TB();
  const W = 390;
  const H = 844;
  const g = 90;
  const a = t.device(0, 0, "phone", "1. Вход", W, H);
  t.text(40, 150, W - 80, "**Привет! 👋**", { parent: a, size: "l", align: "center" });
  t.text(40, 222, W - 80, "Войдите, чтобы продолжить", { parent: a, size: "s", color: "gray", align: "center" });
  t.shape(40, 300, W - 80, 56, "rect", "Почта", { parent: a, fill: "none", color: "gray" });
  t.shape(40, 376, W - 80, 56, "rect", "Пароль", { parent: a, fill: "none", color: "gray" });
  const go = t.shape(40, 470, W - 80, 56, "pill", "**Войти**", { parent: a, fill: "solid", color: "blue" });
  t.text(40, 545, W - 80, "Забыли пароль?", { parent: a, size: "s", color: "blue", align: "center" });

  const x1 = W + g;
  const b = t.device(x1, 0, "phone", "2. Лента", W, H);
  t.text(x1 + 24, 64, 200, "**Лента**", { parent: b, size: "l" });
  const av = t.shape(x1 + W - 72, 66, 44, 44, "ellipse", "🙂", { parent: b, color: "violet" });
  for (let i = 0; i < 3; i++) {
    t.shape(x1 + 24, 140 + i * 200, W - 48, 180, "rect", "", { parent: b, color: i === 1 ? "pink" : "gray" });
    t.text(x1 + 44, 160 + i * 200, W - 88, `**Пост ${i + 1}**\nКороткое описание`, { parent: b, size: "s" });
  }
  ["🏠", "🔍", "➕", "💬", "👤"].forEach((e, i) => t.shape(x1 + 24 + i * 70, H - 104, 56, 56, "ellipse", e, { parent: b, fill: i === 0 ? "solid" : "tint", color: i === 0 ? "blue" : "gray" }));

  const x2 = 2 * (W + g);
  const c = t.device(x2, 0, "phone", "3. Профиль", W, H);
  t.shape(x2 + W / 2 - 60, 90, 120, 120, "ellipse", "🙂", { parent: c, color: "violet", size: "xl" });
  t.text(x2 + 40, 228, W - 80, "**Имя Фамилия**", { parent: c, size: "m", align: "center" });
  t.text(x2 + 40, 272, W - 80, "@username · Москва", { parent: c, size: "s", color: "gray", align: "center" });
  ["**128**\nпостов", "**4,2K**\nчитателей", "**310**\nподписок"].forEach((x, i) => t.shape(x2 + 24 + i * 118, 330, 106, 80, "rect", x, { parent: c, fill: "none", color: "gray" }));
  t.shape(x2 + 40, 440, W - 80, 52, "pill", "Редактировать", { parent: c, fill: "tint", color: "blue" });
  t.shape(x2 + 24, 520, W - 48, 260, "rect", "Галерея", { parent: c, color: "gray", dash: "dash", fill: "none" });

  t.arrow(go, b, { color: "blue", label: "вход" });
  t.arrow(av, c, { color: "violet", label: "аватар" });
  t.note(3 * (W + g), 0, 320, "**📱 Сценарий**\n1. Вход по почте\n2. Лента постов\n3. Профиль по аватару\n\nНовые экраны — «Экран телефона» в библиотеке, раздел «Разработка и дизайн».", { color: "blue" });
  return t.clip();
}

function hud(): Clip {
  const t = new TB();
  const f = t.device(0, 0, "game", "Бой: интерфейс игрока", 960, 540);
  t.shape(60, 46, 260, 38, "pill", "❤️ 87 / 100", { parent: f, fill: "solid", color: "red", font: "game" });
  t.shape(60, 94, 200, 32, "pill", "🔷 40 / 60", { parent: f, fill: "solid", color: "blue", font: "game" });
  t.text(330, 46, 300, "Волна 3 · 02:41", { parent: f, align: "center", font: "game", tt: "up", tfx: "outline" });
  t.shape(770, 40, 150, 150, "rect", "Мини-карта", { parent: f, color: "green", font: "game" });
  t.text(60, 400, 320, "📜 Найти ключ от ворот\n⚔️ Победить стражей 2/5", { parent: f, size: "s", font: "game" });
  ["⚔️", "🛡️", "🧪", "🏹", "🔥"].forEach((e, i) => t.shape(330 + i * 62, 450, 54, 54, "sharp", e, { parent: f, fill: i === 0 ? "solid" : "tint", color: i === 0 ? "yellow" : "gray", size: "l" }));
  t.shape(800, 380, 60, 60, "ellipse", "**A**", { parent: f, fill: "solid", color: "green", font: "game" });
  t.shape(866, 320, 60, 60, "ellipse", "**B**", { parent: f, fill: "solid", color: "red", font: "game" });
  t.note(1000, 0, 340, "**🎮 Безопасная зона**\nПунктир внутри экрана — края, которые могут обрезать телевизоры. Держите важное внутри.\n\nШрифт кнопок — «Игровой», у таймера — обводка: настройки объекта (I) → «Текст».", { color: "violet" });
  t.wd("palette", 1000, 260, {
    w: 340,
    h: 210,
    title: "Цвета интерфейса",
    pm: "chips",
    sw: [
      { id: "a", hex: "#e5484d", t: "Здоровье" },
      { id: "b", hex: "#3e63dd", t: "Мана" },
      { id: "c", hex: "#f5d90a", t: "Золото" },
      { id: "d", hex: "#30a46c", t: "Успех" },
      { id: "e", hex: "#1c2024", t: "Фон" },
    ],
  });
  return t.clip();
}

function styleGuide(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1200, 680, "🎨 Стайлгайд", "default");
  t.wd("palette", 40, 60, {
    w: 540,
    title: "Основные цвета",
    parent: f,
    sw: [
      { id: "a", hex: "#1d3557", t: "Ночь" },
      { id: "b", hex: "#457b9d", t: "Море" },
      { id: "c", hex: "#a8dadc", t: "Лёд" },
      { id: "d", hex: "#f1faee", t: "Снег" },
      { id: "e", hex: "#e63946", t: "Акцент" },
    ],
  });
  t.wd("palette", 40, 250, {
    w: 540,
    title: "Состояния",
    pm: "chips",
    parent: f,
    sw: [
      { id: "a", hex: "#2a9d8f", t: "Успех" },
      { id: "b", hex: "#e9c46a", t: "Внимание" },
      { id: "c", hex: "#e76f51", t: "Ошибка" },
      { id: "d", hex: "#6c757d", t: "Неактивно" },
    ],
  });
  t.text(640, 60, 520, "Заголовок", { parent: f, size: "xl", font: "wide", tw: "heavy", tt: "up", tls: "wide" });
  t.text(640, 140, 520, "Подзаголовок", { parent: f, size: "l", font: "geo" });
  t.text(640, 200, 520, "Основной текст: читается легко и спокойно. Межстрочный интервал — полтора.", { parent: f, size: "m", font: "round" });
  t.text(640, 290, 520, "Акцент: «Редкий предмет!»", { parent: f, size: "m", font: "game", color: "red", tfx: "pop" });
  t.text(640, 340, 520, "Подпись от руки", { parent: f, size: "m", font: "marker", color: "blue", ti: true });
  t.shape(640, 420, 170, 52, "pill", "**Основная**", { parent: f, fill: "solid", color: "blue" });
  t.shape(830, 420, 170, 52, "pill", "Вторичная", { parent: f, fill: "tint", color: "blue" });
  t.shape(1020, 420, 140, 52, "pill", "Контур", { parent: f, fill: "none", color: "blue" });
  t.note(40, 450, 540, "**🗣️ Тон и голос**\n- Говорим просто и на «вы»\n- Коротко: одно действие — одна кнопка\n- Юмор — в мелочах, не в ошибках", { parent: f, color: "cyan" });
  t.note(640, 510, 520, "**Шрифты:** Широкий — заголовки, Геометрический — подзаголовки, Округлый — текст, Игровой — акценты.\nШрифт и начертание — в настройках объекта (I) → «Текст»; общий шрифт — меню доски → «Шрифт доски».", { parent: f, color: "yellow" });
  return t.clip();
}

function playtest(): Clip {
  const t = new TB();
  const f = t.frame(0, 0, 1220, 720, "🧪 Плейтест", "cyan");
  t.widget("rating", 40, 60, 320, 96, { title: "Насколько весело?", max: 5, ri: "star", parent: f });
  t.widget("rating", 40, 176, 320, 96, { title: "Насколько сложно?", max: 5, ri: "heart", parent: f });
  t.wd("words", 400, 60, { title: "Игра одним словом", parent: f });
  t.poll(800, 60, 380, "**Что улучшить первым?**", ["Управление", "Сложность", "Графика", "Звук и музыка"], f);
  t.widget("stopwatch", 40, 296, 320, 110, { title: "Время прохождения", parent: f });
  t.wd("kanban", 40, 440, {
    w: 1140,
    title: "Баги и правки",
    parent: f,
    kb: [
      { id: "a", t: "🐞 Найдено", c: "red" },
      { id: "b", t: "🔧 Чиним", c: "orange", lim: 3 },
      { id: "c", t: "🔎 Проверить", c: "blue" },
      { id: "d", t: "✅ Исправлено", c: "green" },
    ],
    ...cards([
      ["a", "Герой застревает в стене у моста", "red"],
      ["a", "Нет звука у сундука"],
      ["b", "Камера дёргается при прыжке"],
      ["c", "Опечатка в диалоге"],
    ]),
  });
  return t.clip();
}

/* ------------------------------ миниатюры ------------------------------ */



const fillOf = (c: unknown, a: number) => `color-mix(in oklab, var(--c-${colorName(c)}) ${a}%, transparent)`;

/** SVG-миниатюра шаблона (только свои данные — безопасно для {@html}). */
export function templateThumb(clip: Clip, W = 132, H = 80): string {
  const ns = clip.nodes;
  if (!ns.length) return "";
  const xs = ns.map((n) => n.x);
  const ys = ns.map((n) => n.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...ns.map((n) => n.x + n.w));
  const y1 = Math.max(...ns.map((n) => n.y + n.h));
  const pad = 6;
  const k = Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (H - (y1 - y0) * k) / 2 - y0 * k;
  const X = (x: number) => (x * k + ox).toFixed(1);
  const Y = (y: number) => (y * k + oy).toFixed(1);
  const byId = new Map(ns.map((n) => [n.id, n]));
  let out = "";
  for (const n of ns) {
    const w = (n.w * k).toFixed(1);
    const h = (n.h * k).toFixed(1);
    switch (n.type) {
      case "frame":
        if (n.dev) {
          const r = n.dev === "phone" ? Math.min(n.w, n.h) * k * 0.14 : 2;
          out += `<rect x="${X(n.x)}" y="${Y(n.y)}" width="${w}" height="${h}" rx="${r.toFixed(1)}" style="fill:var(--surface-2);stroke:var(--ink-3)" stroke-width="1.6"/>`;
          break;
        }
        out += `<rect x="${X(n.x)}" y="${Y(n.y)}" width="${w}" height="${h}" rx="3" style="fill:${fillOf(n.color, 10)};stroke:${fillOf(n.color === "default" || !n.color ? "gray" : n.color, 55)}" stroke-width="0.8"/>`;
        break;
      case "path": {
        const a = n.b0 ? byId.get(n.b0.id) : undefined;
        const b = n.b1 ? byId.get(n.b1.id) : undefined;
        if (!a || !b) break;
        out += `<line x1="${X(a.x + a.w / 2)}" y1="${Y(a.y + a.h / 2)}" x2="${X(b.x + b.w / 2)}" y2="${Y(b.y + b.h / 2)}" style="stroke:${fillOf(n.color === "default" || !n.color ? "gray" : n.color, 80)}" stroke-width="0.9"/>`;
        break;
      }
      default:
        break;
    }
  }
  for (const n of ns) {
    const x = n.x * k + ox;
    const y = n.y * k + oy;
    const w = n.w * k;
    const h = n.h * k;
    switch (n.type) {
      case "shape":
        out += `<path d="${shapeD(n.kind ?? "rect", x, y, w, h)}" style="fill:${fillOf(n.color, n.fill === "solid" ? 85 : 35)};stroke:${fillOf(n.color, 90)}" stroke-width="0.8"/>`;
        break;
      case "note":
      case "task":
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(3, h).toFixed(1)}" rx="1.5" style="fill:${n.color && n.color !== "default" ? fillOf(n.color, 55) : "var(--surface-3)"}"/>`;
        break;
      case "text":
        out += `<rect x="${x.toFixed(1)}" y="${(y + h * 0.3).toFixed(1)}" width="${(w * 0.6).toFixed(1)}" height="${Math.max(1.5, h * 0.35).toFixed(1)}" rx="1" style="fill:var(--ink-3)"/>`;
        break;
      case "counter":
      case "dice":
      case "progress":
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="fill:${n.color && n.color !== "default" ? fillOf(n.color, 40) : "var(--surface-3)"};stroke:var(--line-3)" stroke-width="0.6"/>`;
        if (n.type === "progress") out += `<rect x="${(x + 2).toFixed(1)}" y="${(y + h * 0.62).toFixed(1)}" width="${((w - 4) * (Math.min(100, n.pv ?? 0) / 100)).toFixed(1)}" height="${Math.max(1, h * 0.16).toFixed(1)}" rx="1" style="fill:var(--accent)"/>`;
        else out += `<rect x="${(x + w * 0.35).toFixed(1)}" y="${(y + h * 0.35).toFixed(1)}" width="${(w * 0.3).toFixed(1)}" height="${(h * 0.3).toFixed(1)}" rx="1" style="fill:var(--ink-3)"/>`;
        break;
      case "poll":
      case "table":
      case "timer":
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="fill:var(--surface-3);stroke:var(--line-3)" stroke-width="0.6"/>`;
        if (n.type !== "timer") for (let i = 1; i < 4; i++) out += `<line x1="${(x + 2).toFixed(1)}" x2="${(x + w - 2).toFixed(1)}" y1="${(y + (h * i) / 4).toFixed(1)}" y2="${(y + (h * i) / 4).toFixed(1)}" style="stroke:var(--line-3)" stroke-width="0.6"/>`;
        break;
      case "sticker":
        out += `<circle cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" r="${Math.max(1.5, w / 2.6).toFixed(1)}" style="fill:var(--c-yellow)"/>`;
        break;
      case "wheel":
      case "clock":
      case "gate":
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="fill:var(--surface-3);stroke:var(--line-3)" stroke-width="0.6"/>`;
        out += `<circle cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" r="${Math.max(1.5, Math.min(w, h) / 3).toFixed(1)}" style="fill:${n.type === "wheel" ? "var(--c-orange)" : n.type === "gate" ? "var(--c-green)" : "var(--ink-3)"}"/>`;
        break;
      case "button":
        out += `<rect x="${(x + 1).toFixed(1)}" y="${(y + 1).toFixed(1)}" width="${(w - 2).toFixed(1)}" height="${(h - 2).toFixed(1)}" rx="3" style="fill:${n.color && n.color !== "default" ? fillOf(n.color, 85) : "var(--accent)"}"/>`;
        break;
      case "kanban": {
        const cols = Array.isArray(n.kb) && n.kb.length ? n.kb : [{ c: "gray" }, { c: "blue" }, { c: "green" }];
        const cw = w / cols.length;
        const hh = Math.max(h, w * 0.3);
        cols.forEach((col, i) => {
          out += `<rect x="${(x + i * cw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(cw - 2).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" style="fill:${fillOf(col.c, 22)}"/>`;
          for (let j = 0; j < 2 - (i % 2); j++) out += `<rect x="${(x + i * cw + 2.5).toFixed(1)}" y="${(y + 3 + j * hh * 0.28).toFixed(1)}" width="${(cw - 5).toFixed(1)}" height="${(hh * 0.2).toFixed(1)}" rx="1" style="fill:var(--surface-1)"/>`;
        });
        break;
      }
      case "roadmap": {
        const hh = Math.max(h, w * 0.3);
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="2" style="fill:var(--surface-3);stroke:var(--line-3)" stroke-width="0.6"/>`;
        const list = Object.entries(n as unknown as Record<string, unknown>).filter(([key]) => key.startsWith("rb:")).map(([, b]) => b as { s: number; d: number; o: number; c?: string });
        const pn = Math.max(2, n.pn ?? 8);
        list.forEach((b, i) => {
          const bx = x + 2 + ((w - 4) * b.s) / pn;
          const by = y + 3 + ((hh - 6) * i) / Math.max(1, list.length);
          out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${Math.max(2, ((w - 4) * b.d) / pn - 1).toFixed(1)}" height="${Math.max(1.5, (hh - 6) / Math.max(1, list.length) - 1.2).toFixed(1)}" rx="1" style="fill:${fillOf(b.c, 70)}"/>`;
        });
        break;
      }
      case "stats":
      case "loot":
      case "estimate": {
        const hh = Math.max(h, w * 0.6);
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="2" style="fill:var(--surface-3);stroke:var(--line-3)" stroke-width="0.6"/>`;
        const rows = n.type === "stats" ? (n.pl ?? []).map((x) => x.c) : n.type === "loot" ? (n.lo ?? []).map((x) => x.c) : ["blue", "violet", "pink"];
        rows.slice(0, 5).forEach((c, i) => {
          const ry = y + hh * 0.28 + i * hh * 0.14;
          out += n.type === "estimate" ? `<rect x="${(x + w * (0.12 + i * 0.28)).toFixed(1)}" y="${(y + hh * 0.3).toFixed(1)}" width="${(w * 0.2).toFixed(1)}" height="${(hh * 0.45).toFixed(1)}" rx="1" style="fill:${fillOf(c, 60)}"/>` : `<rect x="${(x + w * 0.1).toFixed(1)}" y="${ry.toFixed(1)}" width="${(w * (0.8 - (i % 3) * 0.15)).toFixed(1)}" height="${Math.max(1, hh * 0.07).toFixed(1)}" rx="1" style="fill:${fillOf(c, 70)}"/>`;
        });
        break;
      }
      case "curve": {
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="fill:var(--surface-3);stroke:var(--line-3)" stroke-width="0.6"/>`;
        (n.fs ?? []).slice(0, 3).forEach((sr, i) => {
          let d = "";
          for (let j = 0; j <= 8; j++) d += `${j ? "L" : "M"}${(x + w * 0.08 + (w * 0.84 * j) / 8).toFixed(1)},${(y + h * 0.88 - h * 0.7 * (j / 8) ** (1.6 - i * 0.4)).toFixed(1)}`;
          out += `<path d="${d}" fill="none" style="stroke:${fillOf(sr.c, 95)}" stroke-width="1.1"/>`;
        });
        break;
      }
      case "palette": {
        const sw = (n.sw ?? []).filter((c) => /^#[\da-f]{6}$/i.test(c.hex));
        sw.forEach((c, i) => (out += `<rect x="${(x + (w * i) / sw.length).toFixed(1)}" y="${y.toFixed(1)}" width="${(w / sw.length).toFixed(1)}" height="${h.toFixed(1)}" style="fill:${c.hex}"/>`));
        break;
      }
      case "tilemap": {
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" style="fill:#3e7fc1"/>`;
        out += `<ellipse cx="${(x + w * 0.3).toFixed(1)}" cy="${(y + h * 0.5).toFixed(1)}" rx="${(w * 0.22).toFixed(1)}" ry="${(h * 0.32).toFixed(1)}" style="fill:#5a9e4b;stroke:#d8bf73" stroke-width="1.2"/>`;
        out += `<rect x="${(x + w * 0.62).toFixed(1)}" y="${(y + h * 0.12).toFixed(1)}" width="${(w * 0.32).toFixed(1)}" height="${(h * 0.76).toFixed(1)}" style="fill:#7d808a;stroke:#3c3742" stroke-width="1.2"/>`;
        break;
      }
      case "switch":
      case "slider":
      case "rating":
      case "status":
      case "tracker":
      case "chart":
      case "countdown":
      case "calc":
      case "qr":
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="fill:${n.color && n.color !== "default" ? fillOf(n.color, 30) : "var(--surface-3)"};stroke:var(--line-3)" stroke-width="0.6"/>`;
        if (n.type === "chart") for (let i = 0; i < 4; i++) out += `<rect x="${(x + w * (0.14 + i * 0.2)).toFixed(1)}" y="${(y + h * (0.75 - (0.2 + ((i * 37) % 5) * 0.1))).toFixed(1)}" width="${(w * 0.12).toFixed(1)}" height="${(h * (0.2 + ((i * 37) % 5) * 0.1)).toFixed(1)}" style="fill:var(--accent)"/>`;
        else out += `<rect x="${(x + w * 0.12).toFixed(1)}" y="${(y + h * 0.42).toFixed(1)}" width="${(w * 0.76).toFixed(1)}" height="${Math.max(1, h * 0.16).toFixed(1)}" rx="1" style="fill:${n.type === "tracker" ? "var(--c-green)" : "var(--ink-3)"}"/>`;
        break;
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${out}</svg>`;
}
