/* Буфер обмена: узлы SPACE ходят между досками и вкладками как JSON,
   спрятанный в text/html (свой MIME-тип браузеры отдают не везде),
   плюс обычный текст для других программ. Вставка понимает файлы,
   картинки, ссылки, код и простой текст. */
import { toasts } from "../lib/toast.svelte.ts";
import type { Board } from "./board.svelte.ts";
import { addFiles, addTable, addUrl, looksLikeCode, looksLikeUrl } from "./files.ts";
import { parseGrid } from "./nodes/table.svelte.ts";
import type { Pt } from "./geometry.ts";
import { CLIP_MIME, insertClip, place, serialize, type Clip } from "./ops.ts";

function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromB64(b: string): string {
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function plainOf(clip: Clip): string {
  return clip.nodes
    .map((n) => n.text || n.url || n.title || n.name || "")
    .filter(Boolean)
    .join("\n\n");
}

function htmlOf(clip: Clip): string {
  const text = plainOf(clip);
  return `<meta charset="utf-8"><div data-space-clip="${toB64(JSON.stringify(clip))}">${esc(text).replace(/\n/g, "<br>")}</div>`;
}

function parseClip(json: string): Clip | null {
  try {
    const c = JSON.parse(json) as Clip;
    return c && c.v === 1 && Array.isArray(c.nodes) ? c : null;
  } catch {
    return null;
  }
}

function clipFromHtml(html: string): Clip | null {
  const m = /data-space-clip="([A-Za-z0-9+/=]+)"/.exec(html);
  if (!m) return null;
  try {
    return parseClip(fromB64(m[1]!));
  } catch {
    return null;
  }
}

/** Копирование по Ctrl+C (событие copy). */
export function copyToEvent(b: Board, dt: DataTransfer): boolean {
  const ids = b.view.selection.list;
  if (!ids.length) return false;
  const clip = serialize(b, ids, b.view);
  dt.setData(CLIP_MIME, JSON.stringify(clip));
  dt.setData("text/html", htmlOf(clip));
  dt.setData("text/plain", plainOf(clip));
  return true;
}

/** Копирование из меню (асинхронный API). */
export async function copySelection(b: Board): Promise<boolean> {
  const ids = b.view.selection.list;
  if (!ids.length) return false;
  const clip = serialize(b, ids, b.view);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([htmlOf(clip)], { type: "text/html" }),
        "text/plain": new Blob([plainOf(clip)], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    memo = clip;
    return true;
  }
}

/** Запасной буфер, если браузер не дал доступа к системному. */
let memo: Clip | null = null;

/** Вставка по Ctrl+V (событие paste). */
export async function pasteFromEvent(b: Board, dt: DataTransfer, at: Pt): Promise<void> {
  if (b.readonly) return;
  const own = dt.getData(CLIP_MIME);
  const clip = (own && parseClip(own)) || clipFromHtml(dt.getData("text/html"));
  if (clip) return void insertClip(b, clip, { at });
  const files = [...dt.files];
  if (files.length) return void (await addFiles(b, files, at));
  pasteText(b, dt.getData("text/plain"), at);
}

/** Вставка из меню. */
export async function pasteFromClipboard(b: Board, at: Pt): Promise<void> {
  if (b.readonly) return;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes("text/html")) {
        const clip = clipFromHtml(await (await item.getType("text/html")).text());
        if (clip) return void insertClip(b, clip, { at });
      }
      const img = item.types.find((t) => t.startsWith("image/"));
      if (img) {
        const blob = await item.getType(img);
        const ext = img.split("/")[1] || "png";
        return void (await addFiles(b, [new File([blob], `Вставка.${ext}`, { type: img })], at));
      }
      if (item.types.includes("text/plain")) return pasteText(b, await (await item.getType("text/plain")).text(), at);
    }
  } catch {
    if (memo) return void insertClip(b, memo, { at });
    toasts.show("Браузер не дал доступ к буферу — нажмите Ctrl+V", { ms: 4000 });
  }
}

export function pasteText(b: Board, raw: string, at: Pt) {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 12 && lines.every(looksLikeUrl)) {
    const ids = lines.map((l, i) => addUrl(b, l, { x: at.x, y: at.y + i * 150 })).filter((x): x is string => !!x);
    b.store.selection.set(ids);
    return;
  }
  const lang = looksLikeCode(text);
  // из Excel / Google Таблиц приходит TSV — это таблица
  if (!lang && text.includes("\t")) {
    const grid = parseGrid(text, "\t");
    if (grid) {
      b.store.selection.set([addTable(b, grid, at)]);
      return;
    }
  }
  const id = lang ? place(b, "code", at, { text, lang, w: 520 }) : place(b, "note", at, { text, w: text.length > 400 ? 380 : 280 });
  b.store.selection.set([id]);
}
