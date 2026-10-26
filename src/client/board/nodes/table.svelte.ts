/* Таблица: строки и столбцы — списки id, ячейки — отдельные поля узла
   c:<строка>:<столбец>. Поэтому два человека, правящие разные ячейки,
   не мешают друг другу, а вставка строки не сдвигает чужие правки. */
import { nanoid } from "nanoid";
import type { Board } from "../board.svelte.ts";
import { cellKey, type NodeData } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";

export const MAX_ROWS = 200;
export const MAX_COLS = 26;

/** Где сейчас курсор в редактируемой таблице (для меню и клавиш). */
export const tableCursor = $state({ id: "", r: 0, c: 0 });

export const newId = () => nanoid(6);

export function rowsOf(v: NodeView): string[] {
  const r = v.props.rows;
  return Array.isArray(r) && r.length ? r : [];
}

export function colsOf(v: NodeView): string[] {
  const c = v.props.cols;
  return Array.isArray(c) && c.length ? c : [];
}

/** Доли ширины столбцов (сумма — 1). */
export function widthsOf(v: NodeView): number[] {
  const n = colsOf(v).length;
  const cw = v.props.cw;
  if (!Array.isArray(cw) || cw.length !== n || cw.some((x) => !(x > 0))) return Array.from({ length: n }, () => 1 / Math.max(1, n));
  const sum = cw.reduce((a, b) => a + b, 0);
  return cw.map((x) => x / sum);
}

export function cellOf(v: NodeView, row: string, col: string): string {
  const t = (v.props as Record<string, unknown>)[cellKey(row, col)];
  return typeof t === "string" ? t : "";
}

/** Данные новой таблицы из готовых строк (шаблоны, вставка CSV). */
export function tableData(grid: string[][], extra: Partial<NodeData> = {}): Partial<NodeData> & Record<string, unknown> {
  const nCols = Math.max(1, Math.min(MAX_COLS, ...grid.map((r) => r.length)));
  const rows = grid.slice(0, MAX_ROWS).map(() => newId());
  const cols = Array.from({ length: nCols }, () => newId());
  const out: Partial<NodeData> & Record<string, unknown> = { rows, cols, head: true, ...extra };
  grid.slice(0, MAX_ROWS).forEach((r, ri) =>
    r.slice(0, nCols).forEach((t, ci) => {
      if (t) out[cellKey(rows[ri]!, cols[ci]!)] = t;
    }),
  );
  return out;
}

export function emptyTable(nRows = 3, nCols = 3): Partial<NodeData> & Record<string, unknown> {
  return tableData(Array.from({ length: nRows }, () => Array.from({ length: nCols }, () => "")));
}

/** Все ячейки как текст: строки через перевод строки, ячейки через табуляцию. */
export function tableText(v: NodeView): string {
  const cols = colsOf(v);
  return rowsOf(v)
    .map((r) => cols.map((c) => cellOf(v, r, c).replace(/\s*\n\s*/g, " ")).join("\t"))
    .join("\n");
}

export function setCell(b: Board, v: NodeView, row: string, col: string, text: string) {
  if (b.readonly) return;
  b.view.update(v.id, { [cellKey(row, col)]: text || undefined } as Partial<NodeData>);
  v.ownsHeight = true;
}

export function insertRow(b: Board, v: NodeView, at: number): number {
  const rows = [...rowsOf(v)];
  if (rows.length >= MAX_ROWS) return -1;
  const i = Math.max(0, Math.min(rows.length, at));
  rows.splice(i, 0, newId());
  b.view.update(v.id, { rows });
  v.ownsHeight = true;
  return i;
}

export function insertCol(b: Board, v: NodeView, at: number): number {
  const cols = [...colsOf(v)];
  if (cols.length >= MAX_COLS) return -1;
  const i = Math.max(0, Math.min(cols.length, at));
  const w = widthsOf(v);
  const share = 1 / (cols.length + 1);
  const cw = w.map((x) => x * (1 - share));
  cw.splice(i, 0, share);
  cols.splice(i, 0, newId());
  // таблица становится шире, а не теснее
  const grow = Math.min(240, Math.round(v.w / Math.max(1, cols.length - 1)));
  b.view.update(v.id, { cols, cw: cw.map((x) => Math.round(x * 1e4) / 1e4), w: Math.round(v.w + grow) });
  v.ownsHeight = true;
  return i;
}

export function removeRow(b: Board, v: NodeView, i: number) {
  const rows = rowsOf(v);
  if (rows.length <= 1 || !rows[i]) return;
  const id = rows[i]!;
  const patch: Record<string, unknown> = { rows: rows.filter((_, k) => k !== i) };
  for (const c of colsOf(v)) if (cellOf(v, id, c)) patch[cellKey(id, c)] = undefined;
  b.view.update(v.id, patch as Partial<NodeData>);
  v.ownsHeight = true;
}

export function removeCol(b: Board, v: NodeView, i: number) {
  const cols = colsOf(v);
  if (cols.length <= 1 || !cols[i]) return;
  const id = cols[i]!;
  const w = widthsOf(v);
  const gone = w[i] ?? 0;
  const cw = w.filter((_, k) => k !== i).map((x) => Math.round((x / (1 - gone || 1)) * 1e4) / 1e4);
  const patch: Record<string, unknown> = { cols: cols.filter((_, k) => k !== i), cw, w: Math.max(120, Math.round(v.w * (1 - gone))) };
  for (const r of rowsOf(v)) if (cellOf(v, r, id)) patch[cellKey(r, id)] = undefined;
  b.view.update(v.id, patch as Partial<NodeData>);
  v.ownsHeight = true;
}

/** Похоже ли на таблицу (TSV/CSV из Excel, Google Таблиц, файла). */
export function parseGrid(text: string, sep?: "\t" | "," | ";"): string[][] | null {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  if (lines.length < 2 && !text.includes("\t")) return null;
  const pick = sep ?? (text.includes("\t") ? "\t" : lines[0]!.split(";").length > lines[0]!.split(",").length ? ";" : ",");
  const rows = sep === "\t" || pick === "\t" ? lines.map((l) => l.split("\t")) : parseCsv(text, pick);
  const n = rows[0]?.length ?? 0;
  if (n < 2 || rows.length > 2000) return null;
  // у «таблицы» почти во всех строках одинаковое число ячеек
  const same = rows.filter((r) => r.length === n).length;
  if (same < rows.length * 0.8) return null;
  return rows.map((r) => r.map((c) => c.trim()));
}

function parseCsv(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && !cell) q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim()));
}
