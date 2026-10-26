/* Шаблоны: готовые наборы узлов (рамки, карточки, фигуры, связи).
   Строятся как содержимое буфера обмена — вставка переназначает id,
   привязки стрелок и родителей, поэтому шаблон можно ставить сколько
   угодно раз. Миниатюры рисуются из тех же данных. */
import { colorName, type ColorName, type Head, type NodeData, type Route, type ShapeKind, type TextSize } from "./model.ts";
import type { Clip } from "./ops.ts";
import { pollData } from "./nodes/poll.ts";
import { isoDay } from "./nodes/task.ts";
import { tableData } from "./nodes/table.svelte.ts";
import { shapeD } from "./shapes.ts";

type N = NodeData & { id: string };

interface Opt {
  color?: ColorName;
  parent?: string;
  size?: TextSize;
  h?: number;
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
    return this.add({ type: "text", x, y, w, h: o.h ?? 40, fit: true, text, size: o.size ?? "m", color: o.color, parent: o.parent, align: o.align });
  }
  shape(x: number, y: number, w: number, h: number, kind: ShapeKind, text: string, o: Opt & { fill?: "none" | "tint" | "solid" } = {}): string {
    return this.add({ type: "shape", x, y, w, h, kind, text, fill: o.fill ?? "tint", stroke: "m", dash: "solid", color: o.color ?? "default", parent: o.parent, size: o.size ?? "s", align: "center" });
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
  arrow(a: string, b: string, o: { route?: Route; head0?: Head; head1?: Head; label?: string; color?: ColorName; dash?: "solid" | "dash" | "dot" } = {}): string {
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

export const TEMPLATE_GROUPS = ["Игры", "Команда", "Планы и стратегия", "Схемы и идеи"] as const;
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number];

/* ------------------------------ шаблоны ------------------------------ */

function kanban(): Clip {
  const t = new TB();
  const cols: [string, ColorName][] = [
    ["💡 Идеи", "gray"],
    ["📋 Сделать", "blue"],
    ["⚙️ В работе", "yellow"],
    ["✅ Готово", "green"],
  ];
  const f = cols.map(([name, c], i) => t.frame(i * 340, 0, 300, 640, name, c));
  t.task(20, 50, 260, "Придумать название проекта", { parent: f[0] });
  t.task(20, 150, 260, "Собрать референсы и примеры", { parent: f[0] });
  t.task(360, 50, 260, "Расписать задачи на неделю", { parent: f[1], prio: "high" });
  t.task(360, 150, 260, "Созвониться с командой", { parent: f[1], due: 1 });
  t.task(700, 50, 260, "Сделать прототип", { parent: f[2], prio: "mid" });
  t.task(1040, 50, 260, "Создать доску", { parent: f[3], done: true });
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
  const f = t.frame(0, 0, 1420, 600, "🗺️ Дорожная карта", "default");
  const q = ["Квартал 1", "Квартал 2", "Квартал 3", "Квартал 4"];
  q.forEach((name, i) => t.text(220 + i * 300, 40, 260, `**${name}**`, { parent: f, size: "s", align: "center" }));
  const lanes: [string, ColorName][] = [
    ["Продукт", "violet"],
    ["Дизайн", "pink"],
    ["Разработка", "blue"],
    ["Запуск", "green"],
  ];
  lanes.forEach(([name, _c], i) => t.text(30, 130 + i * 110, 170, `**${name}**`, { parent: f, size: "s" }));
  const bar = (lane: number, from: number, to: number, label: string) =>
    t.shape(220 + from * 300, 116 + lane * 110, (to - from + 1) * 300 - 40, 56, "pill", label, { parent: f, color: lanes[lane]![1] });
  bar(0, 0, 1, "Исследование и цели");
  bar(0, 2, 3, "Метрики и обратная связь");
  bar(1, 0, 0, "Макеты");
  bar(1, 1, 2, "Дизайн-система");
  bar(2, 1, 3, "Разработка MVP");
  bar(3, 3, 3, "Релиз 🚀");
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
  const f = t.frame(0, 0, 980, 720, "🧙 Лист персонажа", "violet");
  t.note(40, 60, 420, "**Имя:** …\n**Класс:** Воин\n**Раса:** Человек\n**Уровень:** 1", { parent: f, color: "violet" });
  t.counter(500, 60, "Здоровье", { parent: f, color: "red", n0: 20 });
  t.counter(740, 60, "Мана", { parent: f, color: "blue", n0: 10 });
  t.table(40, 240, 420, [["Характеристика", "Значение"], ["Сила", "14"], ["Ловкость", "12"], ["Телосложение", "13"], ["Интеллект", "8"], ["Мудрость", "10"], ["Харизма", "11"]], f);
  t.dice(500, 240, 1, 20, { parent: f });
  t.counter(740, 240, "Золото", { parent: f, color: "yellow", n0: 50, step: 5, h: 170 });
  t.progress(500, 440, 440, "Опыт до 2 уровня", 35, { parent: f, color: "green" });
  t.note(40, 530, 420, "**🎒 Инвентарь**\n- [x] Меч\n- [ ] Зелье лечения ×2\n- [ ] Верёвка, факел", { parent: f, color: "yellow" });
  t.note(500, 560, 440, "**📜 Задание:** найти пропавший караван у старой мельницы", { parent: f });
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
  t.text(0, -110, 1000, "**Спринт 1** — цель: …", { size: "l" });
  t.progress(0, -30, 700, "Дни спринта", 0, { steps: 10 });
  t.counter(740, -60, "Очки в спринте", { color: "violet", w: 200, h: 140 });
  const cols: [string, ColorName][] = [
    ["📥 Бэклог", "gray"],
    ["🏃 В спринте", "blue"],
    ["👀 Ревью", "yellow"],
    ["✅ Готово", "green"],
  ];
  const f = cols.map(([name, c], i) => t.frame(i * 340, 110, 310, 560, name, c));
  t.task(20, 160, 270, "Задача из бэклога", { parent: f[0], prio: "low" });
  t.task(20, 260, 270, "Ещё задача", { parent: f[0] });
  t.task(360, 160, 270, "Главная задача спринта", { parent: f[1], prio: "high" });
  t.task(700, 160, 270, "Проверить и влить", { parent: f[2], prio: "mid" });
  t.poll(1380, 110, 280, "**Оценка задачи** (покер)", ["1", "2", "3", "5", "8", "13", "?"]);
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
  { id: "game", group: "Игры", label: "Игровой вечер", desc: "Во что и когда играем, роли, перерыв", words: "игра друзья голосование план встреча", build: gameNight },
  { id: "tactics", group: "Игры", label: "Тактическая карта", desc: "Зоны, команды, маршруты и план раунда", words: "игра тактика карта стратегия рейд матч cs dota", build: tactics },
  { id: "bracket", group: "Игры", label: "Турнирная сетка", desc: "8 команд: от четвертьфинала до победы", words: "турнир сетка плей-офф bracket киберспорт", build: bracket },
  { id: "score", group: "Игры", label: "Табло", desc: "Счёт команд, раунды, таймер и кубики", words: "счёт очки игра раунд табло", build: scoreboard },
  { id: "rpg", group: "Игры", label: "Лист персонажа", desc: "Настольная ролевая: здоровье, d20, опыт", words: "dnd d&d днд ролевая персонаж кубик настолка", build: rpg },
  { id: "tier", group: "Игры", label: "Тир-лист", desc: "Расставьте всё от S до D", words: "тир лист рейтинг tier list топ", build: tierList },
  { id: "gdd", group: "Игры", label: "Диздок игры", desc: "Концепция, цикл, персонажи, уровни", words: "игра gdd геймдизайн разработка", build: gdd },
  /* команда */
  { id: "meeting", group: "Команда", label: "Встреча", desc: "Повестка, обсуждение, решения и задачи", words: "встреча созвон митинг повестка протокол", build: meeting },
  { id: "brainstorm", group: "Команда", label: "Мозговой штурм", desc: "Тема, идеи, таймер и голосование", words: "идеи штурм brainstorm", build: brainstorm },
  { id: "retro", group: "Команда", label: "Ретроспектива", desc: "Хорошо, улучшить, дальше", words: "ретро итоги команда", build: retro },
  { id: "sprint", group: "Команда", label: "Спринт", desc: "Цель, дни, задачи и покер планирования", words: "спринт scrum скрам оценка покер agile", build: sprint },
  { id: "kanban", group: "Команда", label: "Канбан", desc: "Колонки задач: идеи → готово", words: "доска задачи проект kanban трелло", build: kanban },
  /* планы */
  { id: "roadmap", group: "Планы и стратегия", label: "Дорожная карта", desc: "Планы по кварталам", words: "roadmap план сроки этапы", build: roadmap },
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
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${out}</svg>`;
}
