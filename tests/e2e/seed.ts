/* Готовые доски для проверок: демонстрационная и «тяжёлая» (тысячи узлов).
   node tests/e2e/seed.ts demo > demo.space
   node tests/e2e/seed.ts perf 5000 > perf.space */
import { generateNKeysBetween } from "fractional-indexing";
import * as Y from "yjs";

type Data = Record<string, unknown> & { type: string; x: number; y: number; w: number; h: number; text?: string };

const TEXT = new Set(["note", "text", "code", "shape"]);

function build(title: string, list: { id: string; d: Data }[]): Uint8Array {
  const doc = new Y.Doc();
  const nodes = doc.getMap<Y.Map<unknown>>("nodes");
  const keys = generateNKeysBetween(null, null, list.length);
  doc.transact(() => {
    doc.getMap("meta").set("title", title);
    doc.getMap("meta").set("createdAt", Date.now());
    list.forEach(({ id, d }, i) => {
      const m = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(d)) if (k !== "text" && v !== undefined) m.set(k, v);
      if (TEXT.has(d.type)) m.set("text", new Y.Text(d.text ?? ""));
      m.set("z", keys[i]);
      nodes.set(id, m);
    });
  });
  return Y.encodeStateAsUpdate(doc);
}

let seq = 0;
const id = (p = "n") => `${p}${(++seq).toString(36).padStart(6, "0")}`;

function demo(): Uint8Array {
  const L: { id: string; d: Data }[] = [];
  const add = (d: Data, nid = id()) => (L.push({ id: nid, d }), nid);

  const f1 = add({ type: "frame", x: 0, y: 0, w: 940, h: 600, name: "Идеи на неделю" });
  const f2 = add({ type: "frame", x: 1020, y: 0, w: 820, h: 600, name: "Код и формулы", color: "blue" });
  add({ type: "text", x: 40, y: 50, w: 600, h: 60, size: "xl", fit: true, parent: f1, text: "Запуск SPACE" });
  add({ type: "note", x: 40, y: 150, w: 260, h: 160, fit: true, color: "yellow", parent: f1, text: "**Сегодня**\n- [x] Новый холст\n- [x] Умное рисование\n- [ ] Демо для команды" });
  const n2 = add({ type: "note", x: 330, y: 150, w: 260, h: 160, fit: true, color: "violet", parent: f1, text: "Перетащите файл на файл —\nполучится *полка*.\n\nДвойной щелчок по пустому месту — новая заметка." });
  add({ type: "note", x: 620, y: 150, w: 260, h: 160, fit: true, color: "green", parent: f1, text: "Ctrl+K — команды\nCtrl+F — поиск по доске\n? — все клавиши" });
  add({ type: "note", x: 40, y: 370, w: 260, h: 140, fit: true, parent: f1, text: "Обычная заметка без цвета. Поддерживает `код`, **жирный** и ссылки: https://svelte.dev" });
  add({ type: "link", x: 330, y: 370, w: 340, h: 120, fit: true, parent: f1, url: "https://svelte.dev/docs/svelte/overview", title: "Svelte • Overview", desc: "Svelte is a UI framework that uses a compiler to let you write breathtakingly concise components.", site: "svelte.dev", embeddable: false });
  add({ type: "file", x: 700, y: 370, w: 200, h: 72, fit: true, parent: f1, name: "Отчёт за май.pdf", mime: "application/pdf", bytes: 2483112, src: "0".repeat(64) });

  add({
    type: "code", x: 1060, y: 60, w: 460, h: 260, fit: true, lang: "typescript", view: "code", title: "camera.ts", parent: f2,
    text: "export function zoomAt(cam: Camera, sx: number, sy: number, k: number) {\n  const z = clamp(cam.z * k, 0.04, 8);\n  const f = z / cam.z;\n  // точка под курсором остаётся на месте\n  cam.x = sx - (sx - cam.x) * f;\n  cam.y = sy - (sy - cam.y) * f;\n  cam.z = z;\n}",
  });
  add({ type: "code", x: 1060, y: 360, w: 460, h: 200, fit: true, lang: "markdown", view: "preview", parent: f2, text: "### Формула площади\n\nПлощадь круга $S = \\pi r^2$, а сумма ряда:\n\n$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$$" });
  add({ type: "note", x: 1560, y: 60, w: 240, h: 120, fit: true, color: "blue", parent: f2, text: "Код подсвечивается\nи редактируется вместе" });
  add({ type: "shelf", x: 1560, y: 230, w: 240, h: 200, fit: true, parent: f2, name: "Материалы", items: [
    { src: "1".repeat(64), name: "brief.docx", size: 48211, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { src: "2".repeat(64), name: "budget.xlsx", size: 18200, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { src: "3".repeat(64), name: "logo.svg", size: 3310, mime: "image/svg+xml" },
  ] });

  // схема со стрелками
  const s1 = add({ type: "shape", x: 0, y: 720, w: 200, h: 110, kind: "rect", fill: "tint", stroke: "m", dash: "solid", color: "orange", text: "Идея" });
  const s2 = add({ type: "shape", x: 320, y: 700, w: 200, h: 150, kind: "diamond", fill: "tint", stroke: "m", dash: "solid", color: "violet", text: "Нравится?" });
  const s3 = add({ type: "shape", x: 640, y: 720, w: 200, h: 110, kind: "ellipse", fill: "solid", stroke: "m", dash: "solid", color: "green", text: "В работу" });
  const s4 = add({ type: "shape", x: 320, y: 930, w: 200, h: 100, kind: "rect", fill: "none", stroke: "m", dash: "dash", color: "gray", text: "Доработать" });
  const bind = (t: string) => ({ id: t, u: 0.5, v: 0.5, precise: false });
  add({ type: "path", x: 200, y: 775, w: 120, h: 1, pts: [[0, 0], [120, 0]], b0: bind(s1), b1: bind(s2), head0: "none", head1: "arrow", stroke: "m", dash: "solid", color: "default" });
  add({ type: "path", x: 520, y: 775, w: 120, h: 1, pts: [[0, 0], [120, 0]], b0: bind(s2), b1: bind(s3), head0: "none", head1: "arrow", stroke: "m", dash: "solid", color: "green" });
  add({ type: "path", x: 420, y: 850, w: 1, h: 80, pts: [[0, 0], [0, 80]], b0: bind(s2), b1: bind(s4), head0: "none", head1: "arrow", stroke: "m", dash: "dash", color: "gray" });
  add({ type: "path", x: 520, y: 980, w: 200, h: 150, pts: [[0, 0], [120, -40], [180, -150]], b0: bind(s4), b1: bind(n2), head0: "none", head1: "triangle", stroke: "s", dash: "solid", color: "red", curve: true });

  // рукописная подпись
  const pts: number[][] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push([Math.round(t * 300 * 10) / 10, Math.round((40 + Math.sin(t * Math.PI * 3) * 30 + t * 20) * 10) / 10, 0.5]);
  }
  add({ type: "ink", x: 960, y: 760, w: 300, h: 110, ow: 300, oh: 110, pts, stroke: "m", color: "orange" });
  add({ type: "text", x: 960, y: 690, w: 320, h: 40, fit: true, size: "m", color: "orange", text: "Рисуйте прямо на доске" });
  return build("Демо SPACE", L);
}

function perf(n: number): Uint8Array {
  const L: { id: string; d: Data }[] = [];
  const cols = Math.ceil(Math.sqrt(n));
  const colors = ["default", "yellow", "orange", "red", "pink", "violet", "blue", "cyan", "green", "gray"];
  let frame = "";
  for (let i = 0; i < n; i++) {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    if (cx % 10 === 0 && cy % 10 === 0) {
      frame = id("f");
      L.push({ id: frame, d: { type: "frame", x: cx * 300 - 30, y: cy * 220 - 50, w: 10 * 300, h: 10 * 220, name: `Секция ${cx / 10 + 1}-${cy / 10 + 1}` } });
    }
    const kind = i % 7;
    const x = cx * 300;
    const y = cy * 220;
    if (kind === 6) L.push({ id: id(), d: { type: "shape", x, y, w: 200, h: 120, kind: i % 2 ? "ellipse" : "rect", fill: "tint", stroke: "m", dash: "solid", color: colors[i % 10], text: `Фигура ${i}` } });
    else if (kind === 5) L.push({ id: id(), d: { type: "code", x, y, w: 260, h: 150, fit: true, lang: "javascript", view: "code", text: `const n${i} = ${i};\nfunction f${i}(x) {\n  return x * n${i};\n}` } });
    else L.push({ id: id(), d: { type: "note", x, y, w: 240, h: 140, fit: true, color: colors[i % 10], text: `**Заметка ${i}**\nНемного текста, чтобы было похоже на правду. Строка ${i % 13}.` } });
  }
  return build(`Нагрузка: ${n} объектов`, L);
}

const [mode = "demo", count = "3000"] = process.argv.slice(2);
const out = mode === "perf" ? perf(Number(count)) : demo();
process.stdout.write(out);
