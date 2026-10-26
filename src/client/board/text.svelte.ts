/* Статическая отрисовка текста: Markdown (markdown-it), формулы (KaTeX,
   грузится по требованию), подсветка кода (lezer — те же классы tok-*,
   что и в редакторе, поэтому код выглядит одинаково при чтении и правке). */
import MarkdownIt, { type StateBlock, type StateInline } from "markdown-it";

/** Растёт, когда догрузился язык или KaTeX — отрисовки пересчитываются. */
export const assets = $state({ rev: 0 });

/* ------------------------------ код ------------------------------ */
/* Подсветка живёт в отдельном чанке (CodeMirror + lezer ≈ 450 КБ): он
   грузится при первом блоке кода с языком, до этого код показывается
   простым текстом. */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type HL = typeof import("./highlight.ts");
let hl: HL | null = null;
let hlLoading = false;
const bump = () => assets.rev++;

/** Подсвеченный HTML кода (без обёртки). */
export function highlight(code: string, lang: string | undefined): string {
  const key = (lang || "").toLowerCase();
  if (!key || key === "text" || key === "plain") return esc(code);
  if (!hl) {
    if (!hlLoading) {
      hlLoading = true;
      void import("./highlight.ts").then((m) => {
        hl = m;
        bump();
      });
    }
    return esc(code);
  }
  return hl.highlight(code, key, bump) ?? esc(code);
}

/* ------------------------------ формулы ------------------------------ */

type Katex = typeof import("katex").default;
let katex: Katex | null = null;
let katexLoading = false;

function needKatex() {
  if (katex || katexLoading) return;
  katexLoading = true;
  void Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => {
    katex = m.default;
    assets.rev++;
  });
}

export function renderMath(src: string, display: boolean): string {
  if (!katex) {
    needKatex();
    return `<span class="math-pending">${esc(src)}</span>`;
  }
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, output: "html", strict: "ignore" });
  } catch {
    return `<span class="math-error">${esc(src)}</span>`;
  }
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src[start] !== "$" || src[start + 1] === "$") return false;
  const next = src[start + 1];
  if (!next || next === " " || next === "\n") return false;
  let end = start + 1;
  while (end < state.posMax) {
    end = src.indexOf("$", end);
    if (end < 0) return false;
    if (src[end - 1] !== "\\" && src[end - 1] !== " ") break;
    end++;
  }
  if (end < 0 || end >= state.posMax + 1) return false;
  const after = src[end + 1];
  if (after && /\d/.test(after)) return false; // «$5 и $10» — это деньги
  if (!silent) {
    const t = state.push("math_inline", "math", 0);
    t.content = src.slice(start + 1, end);
  }
  state.pos = end + 1;
  return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
  const max = state.eMarks[startLine]!;
  if (state.src.slice(pos, pos + 2) !== "$$") return false;
  if (silent) return true;
  let first = state.src.slice(pos + 2, max);
  let line = startLine;
  let content = "";
  if (first.trim().endsWith("$$") && first.trim().length > 2) {
    content = first.trim().slice(0, -2);
  } else {
    content = first;
    let found = false;
    while (++line < endLine) {
      const p = state.bMarks[line]! + state.tShift[line]!;
      const m = state.eMarks[line]!;
      const text = state.src.slice(p, m);
      if (text.trim().endsWith("$$")) {
        content += "\n" + text.trim().slice(0, -2);
        found = true;
        break;
      }
      content += "\n" + text;
    }
    if (!found) return false;
  }
  state.line = line + 1;
  const t = state.push("math_block", "math", 0);
  t.block = true;
  t.content = content;
  t.map = [startLine, state.line];
  return true;
}

/* ------------------------------ markdown ------------------------------ */

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
  highlight: (code, lang) => `<pre class="md-code"><code>${highlight(code, lang || undefined)}</code></pre>`,
});
md.inline.ruler.after("escape", "math_inline", mathInline);
md.block.ruler.before("fence", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
md.renderer.rules.math_inline = (tokens, i) => renderMath(tokens[i]!.content, false);
md.renderer.rules.math_block = (tokens, i) => `<div class="math-block">${renderMath(tokens[i]!.content, true)}</div>`;
md.renderer.rules.link_open = (tokens, i, opts, _env, self) => {
  tokens[i]!.attrSet("target", "_blank");
  tokens[i]!.attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, i, opts);
};
// списки задач: «- [ ] дело» → флажок, который можно нажать
md.core.ruler.after("inline", "tasks", (state) => {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== "inline" || tokens[i - 1]!.type !== "paragraph_open" || tokens[i - 2]!.type !== "list_item_open") continue;
    const m = /^\[([ xXхХ])\]\s/.exec(t.content);
    if (!m || !t.children?.length) continue;
    const first = t.children[0]!;
    if (first.type !== "text") continue;
    first.content = first.content.replace(/^\[([ xXхХ])\]\s/, "");
    const checked = m[1] !== " ";
    const line = tokens[i - 2]!.map?.[0] ?? 0;
    const box = new state.Token("html_inline", "", 0);
    box.content = `<input type="checkbox" class="task" data-line="${line}"${checked ? " checked" : ""}>`;
    t.children.unshift(box);
    tokens[i - 2]!.attrJoin("class", checked ? "task-item done" : "task-item");
  }
});

export function renderMarkdown(src: string): string {
  try {
    return md.render(src);
  } catch {
    return `<p>${esc(src)}</p>`;
  }
}

/** Переключить флажок задачи в исходном тексте (номер строки — из data-line). */
export function toggleTaskLine(src: string, line: number): string | null {
  const lines = src.split("\n");
  const l = lines[line];
  if (l === undefined) return null;
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xXхХ])\]/.exec(l);
  if (!m) return null;
  lines[line] = l.replace(/\[([ xXхХ])\]/, m[2] === " " ? "[x]" : "[ ]");
  return lines.join("\n");
}

/** Первая строка как заголовок (для поиска, мини-карты, дальнего масштаба). */
export function firstLine(src: string): string {
  const line = src.split("\n").find((l) => l.trim()) ?? "";
  return line.replace(/^#+\s*|^[-*+]\s+(\[.\]\s*)?|[*_`~]/g, "").trim().slice(0, 120);
}

export { esc };
