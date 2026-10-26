/* Файлы на доске: загрузка с прогрессом, превью картинок и видео,
   текстовые файлы → блоки кода, zip → полка, ссылки → карточки/видео. */
import type { FileInfo, Unfurl } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { toasts } from "../lib/toast.svelte.ts";
import { bytes, download } from "../lib/util.ts";
import type { Board } from "./board.svelte.ts";
import { embedFor } from "./embeds.ts";
import type { Pt } from "./geometry.ts";
import { langFromName, type NodeData, type ShelfItem } from "./model.ts";
import { parseGrid, tableData } from "./nodes/table.svelte.ts";
import { QUIET } from "./store.svelte.ts";

/** Адрес файла: хеш из нашего хранилища или внешний URL. */
export function fileUrl(src: string | undefined, opts: { dl?: boolean; name?: string } = {}): string {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const q = new URLSearchParams();
  if (opts.dl) q.set("dl", "1");
  if (opts.name) q.set("name", opts.name);
  const qs = q.toString();
  return `/api/files/${src}${qs ? "?" + qs : ""}`;
}

/** Локальные превью, пока файл грузится (только на этом устройстве). */
export const localPreview = new Map<string, string>();

function keepLocal(id: string, blob: Blob | null | undefined) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  localPreview.set(id, url);
  // после загрузки оригинал придёт с сервера; превью держим, пока он не закэшировался
  setTimeout(() => {
    URL.revokeObjectURL(url);
    localPreview.delete(id);
  }, 120_000);
}

/* ------------------------------ загрузка ------------------------------ */

export function uploadBlob(blob: Blob, name: string, onProgress?: (k: number) => void): Promise<FileInfo> {
  const max = 1024 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    if (blob.size > max) return reject(new Error("Файл слишком большой"));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.setRequestHeader("x-space", "1");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(name));
    xhr.setRequestHeader("content-type", blob.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* пусто */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body as FileInfo);
      else reject(new Error((body as { error?: { message?: string } })?.error?.message || `Не удалось загрузить «${name}»`));
    };
    xhr.onerror = () => reject(new Error("Нет связи с сервером"));
    xhr.send(blob);
  });
}

/** Общий индикатор загрузки нескольких файлов. */
class UploadProgress {
  private toast = 0;
  private total = 0;
  private done = new Map<string, number>();
  private count = 0;

  add(key: string, size: number) {
    this.total += size;
    this.count++;
    this.done.set(key, 0);
    this.render();
  }
  progress(key: string, size: number, k: number) {
    this.done.set(key, size * k);
    this.render();
  }
  finish(key: string) {
    this.done.delete(key);
    this.count--;
    if (!this.count) {
      if (this.toast) toasts.close(this.toast);
      this.toast = 0;
      this.total = 0;
      this.done.clear();
    } else this.render();
  }
  private render() {
    if (this.total < 400_000 && !this.toast) return;
    let sent = 0;
    for (const v of this.done.values()) sent += v;
    const left = this.total - [...this.done.values()].length;
    void left;
    const text = this.count > 1 ? `Загрузка ${this.count} файлов…` : "Загрузка файла…";
    const progress = Math.min(1, sent / Math.max(1, this.total));
    if (!this.toast) this.toast = toasts.show(text, { progress, ms: 0 });
    else toasts.update(this.toast, { text, progress });
  }
}
const progress = new UploadProgress();

async function upload(blob: Blob, name: string): Promise<FileInfo> {
  const key = Math.random().toString(36).slice(2);
  progress.add(key, blob.size);
  try {
    return await uploadBlob(blob, name, (k) => progress.progress(key, blob.size, k));
  } finally {
    progress.finish(key);
  }
}

/* ------------------------------ медиа ------------------------------ */

async function imageSize(file: Blob): Promise<{ w: number; h: number; bitmap: ImageBitmap | null }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { w: bitmap.width, h: bitmap.height, bitmap };
  } catch {
    // SVG и экзотика — через <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { w: img.naturalWidth || 400, h: img.naturalHeight || 300, bitmap: null };
    } catch {
      return { w: 400, h: 300, bitmap: null };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Уменьшенная копия для дальнего плана, мини-карты и превью доски. */
async function thumbnail(src: CanvasImageSource, w: number, h: number, max = 512): Promise<Blob | null> {
  const k = Math.min(1, max / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * k));
  const th = Math.max(1, Math.round(h * k));
  const c = new OffscreenCanvas(tw, th);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, tw, th);
  try {
    return await c.convertToBlob({ type: "image/webp", quality: 0.8 });
  } catch {
    return null;
  }
}

async function videoInfo(file: Blob): Promise<{ w: number; h: number; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "metadata";
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("video"));
      setTimeout(() => rej(new Error("timeout")), 8000);
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 4);
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      setTimeout(res, 2500);
    });
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 360;
    return { w, h, poster: await thumbnail(v, w, h, 960) };
  } catch {
    return { w: 640, h: 360, poster: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Размер карточки медиа: длинная сторона ~ 420 при 100 %. */
export function fitMedia(w: number, h: number, max = 420): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.round(Math.max(40, w * k)), h: Math.round(Math.max(30, h * k)) };
}

/* ------------------------------ раскладка ------------------------------ */

const TEXT_MAX = 400_000;

function isTextFile(f: File): boolean {
  if (f.size > TEXT_MAX) return false;
  if (f.type.startsWith("text/") || /json|xml|javascript|yaml|toml|x-sh/.test(f.type)) return true;
  return !!langFromName(f.name);
}

/** Сетка для нескольких новых узлов вокруг точки. */
function gridSlots(n: number, at: Pt, cell = { w: 340, h: 260 }): Pt[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: at.x + (c - (cols - 1) / 2) * cell.w, y: at.y + (r - (rows - 1) / 2) * cell.h });
  }
  return out;
}

/* ------------------------------ основное ------------------------------ */

/**
 * Положить файлы на доску. Узел появляется сразу (с индикатором), файл
 * догружается в фоне — отмена создания (Ctrl+Z) просто уберёт узел.
 */
export async function addFiles(b: Board, files: File[], at: Pt): Promise<string[]> {
  if (b.readonly || !files.length) return [];
  const slots = gridSlots(files.length, at);
  const ids: string[] = [];
  await Promise.all(
    files.map(async (f, i) => {
      try {
        const id = await addFile(b, f, slots[i]!);
        if (id) ids.push(id);
      } catch (e) {
        toasts.error(e);
      }
    }),
  );
  if (ids.length) b.store.selection.set(ids);
  return ids;
}

async function addFile(b: Board, f: File, at: Pt): Promise<string | null> {
  const s = b.store;
  const name = f.name || "file";
  const lower = name.toLowerCase();

  if (f.type.startsWith("image/") && !/tiff|heic|heif/.test(f.type)) {
    const { w, h, bitmap } = await imageSize(f);
    const size = fitMedia(w, h);
    const id = s.create({ type: "image", x: Math.round(at.x - size.w / 2), y: Math.round(at.y - size.h / 2), ...size, natW: w, natH: h, name, mime: f.type, bytes: f.size, pending: true });
    keepLocal(id, f);
    s.reparent([id]);
    const thumbP = bitmap && Math.max(w, h) > 700 && f.type !== "image/gif" ? thumbnail(bitmap, w, h).then((t) => (t ? upload(t, "preview.webp") : null)) : Promise.resolve(null);
    const [info, thumb] = await Promise.all([upload(f, name), thumbP.catch(() => null)]);
    bitmap?.close();
    s.update(id, { src: info.hash, preview: thumb?.hash, pending: undefined }, QUIET);
    return id;
  }

  if (f.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/.test(lower)) {
    const id = s.create({ type: "video", x: Math.round(at.x - 240), y: Math.round(at.y - 135), w: 480, h: 270, name, mime: f.type || "video/mp4", bytes: f.size, pending: true });
    s.reparent([id]);
    const meta = await videoInfo(f);
    keepLocal(id, meta.poster);
    const size = fitMedia(meta.w, meta.h, 520);
    s.update(id, { ...size, x: Math.round(at.x - size.w / 2), y: Math.round(at.y - size.h / 2), natW: meta.w, natH: meta.h }, QUIET);
    const [info, poster] = await Promise.all([upload(f, name), meta.poster ? upload(meta.poster, "poster.webp").catch(() => null) : null]);
    s.update(id, { src: info.hash, preview: poster?.hash, pending: undefined }, QUIET);
    return id;
  }

  if (f.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus)$/.test(lower)) {
    const id = s.create({ type: "audio", x: Math.round(at.x - 160), y: Math.round(at.y - 42), w: 320, h: 84, fit: true, name, mime: f.type || guessMime(name), bytes: f.size, pending: true });
    s.reparent([id]);
    const info = await upload(f, name);
    s.update(id, { src: info.hash, mime: info.mime, pending: undefined }, QUIET);
    return id;
  }

  if (/\.(csv|tsv)$/.test(lower) && f.size < 2_000_000) {
    const grid = parseGrid(await f.text(), lower.endsWith(".tsv") ? "\t" : undefined);
    if (grid) return addTable(b, grid, at, name.replace(/\.(csv|tsv)$/i, ""));
  }

  if (lower.endsWith(".zip") && f.size < 200 * 1024 * 1024) {
    return addZip(b, f, at);
  }

  if (isTextFile(f)) {
    const text = await f.text();
    if (/\.(md|markdown)$/.test(lower)) {
      const id = s.create({ type: "note", x: Math.round(at.x - 180), y: Math.round(at.y - 120), w: 360, h: 240, fit: true, text });
      s.reparent([id]);
      return id;
    }
    const lang = langFromName(name) ?? "text";
    const id = s.create({ type: "code", x: Math.round(at.x - 260), y: Math.round(at.y - 160), w: 520, h: 320, fit: true, lang, title: name, text, view: "code" });
    s.reparent([id]);
    return id;
  }

  const id = s.create({ type: "file", x: Math.round(at.x - 140), y: Math.round(at.y - 36), w: 280, h: 72, fit: true, name, mime: f.type || "application/octet-stream", bytes: f.size, pending: true });
  s.reparent([id]);
  const info = await upload(f, name);
  s.update(id, { src: info.hash, mime: info.mime, pending: undefined }, QUIET);
  return id;
}

/** Таблица из готовых строк (CSV/TSV-файл, вставка из Excel или Google Таблиц). */
export function addTable(b: Board, grid: string[][], at: Pt, title?: string): string {
  const s = b.store;
  const data = tableData(grid, title ? { title } : {});
  const n = (data.cols as string[]).length;
  const w = Math.round(Math.max(280, Math.min(1400, n * 150)));
  const h = Math.min(2000, (data.rows as string[]).length * 35 + 2);
  const id = s.create({ type: "table", x: Math.round(at.x - w / 2), y: Math.round(at.y - Math.min(h, 400) / 2), w, h, fit: true, ...data } as NodeData);
  s.reparent([id]);
  return id;
}

async function addZip(b: Board, f: File, at: Pt): Promise<string | null> {
  let entries: Record<string, Uint8Array>;
  try {
    const { unzipSync } = await import("fflate");
    entries = unzipSync(new Uint8Array(await f.arrayBuffer()), {
      filter: (e) => !e.name.endsWith("/") && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.name) && e.originalSize < 512 * 1024 * 1024,
    });
  } catch {
    // не распаковался — обычный файл
    const id = b.store.create({ type: "file", x: Math.round(at.x - 140), y: Math.round(at.y - 36), w: 280, h: 72, fit: true, name: f.name, mime: "application/zip", bytes: f.size, pending: true });
    const info = await upload(f, f.name);
    b.store.update(id, { src: info.hash, pending: undefined }, QUIET);
    return id;
  }
  const names = Object.keys(entries).slice(0, 300);
  const id = b.store.create({ type: "shelf", x: Math.round(at.x - 160), y: Math.round(at.y - 100), w: 320, h: 200, fit: true, name: f.name.replace(/\.zip$/i, ""), items: [], pending: true });
  b.store.reparent([id]);
  const items: ShelfItem[] = [];
  for (const path of names) {
    const data = entries[path]!;
    const name = path.split("/").pop() || path;
    const info = await upload(new Blob([data as BlobPart], { type: guessMime(name) }), name);
    items.push({ src: info.hash, name: path, size: info.size, mime: info.mime });
  }
  b.store.update(id, { items, pending: undefined }, QUIET);
  return id;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  opus: "audio/opus",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  zip: "application/zip",
};

export function guessMime(name: string): string {
  return MIME[name.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";
}

/* ------------------------------ полки ------------------------------ */

export function fileItem(v: { props: { src?: string; name?: string; bytes?: number; mime?: string } }): ShelfItem | null {
  const p = v.props;
  if (!p.src) return null;
  return { src: p.src, name: p.name || "file", size: p.bytes ?? 0, mime: p.mime || "application/octet-stream" };
}

/** Полка одним архивом. */
export async function downloadShelf(name: string, items: ShelfItem[]) {
  if (!items.length) return;
  const id = toasts.show(`Собираю архив (${items.length})…`, { ms: 0, progress: 0 });
  try {
    const files: Record<string, Uint8Array> = {};
    let i = 0;
    const used = new Set<string>();
    for (const it of items) {
      const data = await api.bytes(fileUrl(it.src));
      let n = it.name.replace(/^\/+/, "") || "file";
      while (used.has(n)) n = n.replace(/(\.[^.]*)?$/, (ext) => ` (копия)${ext}`);
      used.add(n);
      files[n] = data;
      toasts.update(id, { progress: ++i / items.length });
    }
    const { zipSync } = await import("fflate");
    const zip = zipSync(files, { level: 0 });
    download(new Blob([zip as BlobPart], { type: "application/zip" }), `${name || "Полка"}.zip`);
  } catch (e) {
    toasts.error(e);
  } finally {
    toasts.close(id);
  }
}

export function shelfSize(items: ShelfItem[]): string {
  return bytes(items.reduce((s, x) => s + (x.size || 0), 0));
}

/* ------------------------------ ссылки ------------------------------ */

export interface Embed {
  embed: string;
  poster?: string;
  site: string;
}

/** Видео с площадок: YouTube, Vimeo, Rutube, VK. */
export function videoEmbed(raw: string): Embed | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
    else {
      const m = /^\/(shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname);
      if (m) id = m[2]!;
    }
    id = id.split("/")[0]!;
    if (!/^[\w-]{6,}$/.test(id)) return null;
    const t = u.searchParams.get("t");
    const start = t ? parseInt(t, 10) : 0;
    return { embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ""}`, poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, site: "YouTube" };
  }
  if (host === "vimeo.com") {
    const m = /^\/(\d+)/.exec(u.pathname);
    if (m) return { embed: `https://player.vimeo.com/video/${m[1]}`, site: "Vimeo" };
  }
  if (host === "rutube.ru") {
    const m = /^\/(?:video|shorts|play\/embed)\/([\da-f]{20,})/.exec(u.pathname);
    if (m) return { embed: `https://rutube.ru/play/embed/${m[1]}`, site: "Rutube" };
  }
  if (host === "vk.com" || host === "vkvideo.ru" || host === "vk.ru") {
    const m = /video(-?\d+)_(\d+)/.exec(u.pathname + u.search);
    if (m) return { embed: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`, site: "VK Видео" };
  }
  return null;
}

export function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t) || t.length > 2000) return false;
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(t) || /^(www\.)[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(t);
}

export function normalizeUrl(s: string): string {
  const t = s.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Создать карточку по ссылке: видео встраивается, картинка показывается, страница разворачивается. */
export function addUrl(b: Board, raw: string, at: Pt): string | null {
  if (b.readonly) return null;
  const url = normalizeUrl(raw);
  const s = b.store;
  const v = videoEmbed(url);
  if (v) {
    const id = s.create({ type: "video", x: Math.round(at.x - 240), y: Math.round(at.y - 135), w: 480, h: 270, url, embed: v.embed, image: v.poster, site: v.site });
    s.reparent([id]);
    void unfurlInto(b, id, url, true);
    return id;
  }
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(url)) {
    const id = s.create({ type: "image", x: Math.round(at.x - 160), y: Math.round(at.y - 120), w: 320, h: 240, src: url, url, name: url.split("/").pop()?.split("?")[0] });
    s.reparent([id]);
    void naturalSize(b, id, url);
    return id;
  }
  // сервис со встраиваемым плеером (Spotify, Figma, Google Документы…) — сразу плеер
  const e = embedFor(url);
  const w = e?.w ?? 340;
  const id = s.create({ type: "link", x: Math.round(at.x - w / 2), y: Math.round(at.y - 60), w, h: 120, fit: true, url, title: prettyUrl(url), pending: true, ...(e ? { live: true } : {}) });
  s.reparent([id]);
  void unfurlInto(b, id, url, false);
  return id;
}

async function naturalSize(b: Board, id: string, url: string) {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    const size = fitMedia(img.naturalWidth, img.naturalHeight);
    const v = b.store.get(id);
    if (!v) return;
    const c = { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    b.store.update(id, { ...size, x: Math.round(c.x - size.w / 2), y: Math.round(c.y - size.h / 2), natW: img.naturalWidth, natH: img.naturalHeight }, QUIET);
  } catch {
    /* оставим как есть */
  }
}

export async function unfurlInto(b: Board, id: string, url: string, video: boolean) {
  try {
    const u = await api.get<Unfurl>(`/api/unfurl?url=${encodeURIComponent(url)}`);
    if (!b.store.get(id)) return;
    if (video) {
      b.store.update(id, { title: u.title, site: u.site ?? b.store.get(id)?.props.site }, QUIET);
      return;
    }
    if (u.kind === "image") {
      b.store.update(id, { type: "image", src: u.url, fit: undefined, pending: undefined } as Partial<NodeData>, QUIET);
      void naturalSize(b, id, u.url);
      return;
    }
    b.store.update(
      id,
      {
        title: u.title || prettyUrl(url),
        desc: u.description,
        image: u.image,
        icon: u.icon,
        site: u.site || hostOf(url),
        embeddable: u.embeddable,
        facts: u.facts?.length ? u.facts.slice(0, 5) : undefined,
        pending: undefined,
      },
      QUIET,
    );
  } catch {
    if (b.store.get(id)) b.store.update(id, { pending: undefined, site: hostOf(url) }, QUIET);
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname).replace(/\/$/, "");
    return u.hostname.replace(/^www\./, "") + (p.length > 1 ? p : "");
  } catch {
    return url;
  }
}

/* ------------------------------ вставка ------------------------------ */

/** Похоже ли на код: отступы, скобки, ключевые слова. */
export function looksLikeCode(t: string): string | null {
  const lines = t.split("\n");
  if (lines.length < 2 && t.length < 60) return null;
  let score = 0;
  if (/^\s*(import|export|from|const|let|var|function|class|def|fn|pub|package|using|#include|SELECT|CREATE)\b/m.test(t)) score += 2;
  if (/[{};]\s*$/m.test(t)) score += 1;
  if (/=>|::|\)\s*{|<\/?\w+[^>]*>/.test(t)) score += 1;
  if (lines.filter((l) => /^( {2,}|\t)/.test(l)).length >= Math.max(2, lines.length / 4)) score += 1;
  if (score < 3) return null;
  if (/^\s*(def |import \w+$|from \w+ import)/m.test(t) && !/[{};]\s*$/m.test(t)) return "python";
  if (/^\s*<(!doctype|html|div|body|head)/im.test(t)) return "html";
  if (/^\s*(SELECT|INSERT|CREATE TABLE|UPDATE)\b/im.test(t)) return "sql";
  if (/^\s*[{[]/.test(t) && /[}\]]\s*$/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* не json */
    }
  }
  if (/\b(interface|type)\s+\w+\s*[={<]|:\s*(string|number|boolean)\b/.test(t)) return "typescript";
  if (/\bfn\s+\w+|let\s+mut\b/.test(t)) return "rust";
  if (/\bfunc\s+\w+\(|package\s+main/.test(t)) return "go";
  return "javascript";
}

/* ------------------------- полки из файлов ------------------------- */

/** Догрузить файлы на полку. */
export async function addToShelf(b: Board, shelfId: string, files: File[]) {
  if (b.readonly || !files.length) return;
  try {
    const items = await Promise.all(
      files.map((f) => upload(f, f.name).then((info): ShelfItem => ({ src: info.hash, name: f.name || "file", size: info.size, mime: info.mime }))),
    );
    const v = b.store.get(shelfId);
    if (!v) return;
    b.store.update(shelfId, { items: [...(v.props.items ?? []), ...items] });
  } catch (e) {
    toasts.error(e);
  }
}

function itemsOf(v: { type: string; props: { items?: ShelfItem[]; src?: string; name?: string; bytes?: number; mime?: string } }): ShelfItem[] {
  if (v.type === "shelf") return v.props.items ?? [];
  const it = fileItem(v);
  return it ? [it] : [];
}

/** Файл, брошенный на файл, — полка из обоих; на полку — добавляется в неё. */
export function mergeIntoShelf(b: Board, targetId: string, ids: string[]): string | null {
  const s = b.store;
  const t = s.get(targetId);
  if (!t || b.readonly) return null;
  const moving = ids.map((id) => s.get(id)).filter((v) => !!v && v.id !== targetId && (v.type === "file" || v.type === "shelf"));
  if (!moving.length) return null;
  const items = moving.flatMap((v) => itemsOf(v!));
  let result = t.id;
  s.transact(() => {
    if (t.type === "shelf") {
      s.update(t.id, { items: [...(t.props.items ?? []), ...items] });
    } else {
      result = s.create({
        type: "shelf",
        x: t.x,
        y: t.y,
        w: Math.max(300, t.w),
        h: 200,
        fit: true,
        name: "Полка",
        items: [...itemsOf(t), ...items],
        parent: t.parent,
      });
      s.remove([t.id]);
    }
    s.remove(moving.map((v) => v!.id));
  });
  s.selection.set([result]);
  return result;
}

/** Файлы с компьютера на файл-узел: сначала полка, затем догрузка. */
export async function dropOnFileNode(b: Board, targetId: string, files: File[]) {
  const s = b.store;
  const t = s.get(targetId);
  if (!t) return;
  let shelfId = targetId;
  if (t.type === "file") {
    s.transact(() => {
      shelfId = s.create({ type: "shelf", x: t.x, y: t.y, w: Math.max(300, t.w), h: 200, fit: true, name: "Полка", items: itemsOf(t), parent: t.parent });
      s.remove([t.id]);
    });
    s.selection.set([shelfId]);
  }
  await addToShelf(b, shelfId, files);
}

/** Вынуть элемент полки обратно на доску отдельным файлом. */
export function takeFromShelf(b: Board, shelfId: string, index: number, at?: Pt) {
  const s = b.store;
  const v = s.get(shelfId);
  const items = v?.props.items ?? [];
  const it = items[index];
  if (!v || !it) return;
  const pos = at ?? { x: v.x + v.w + 40, y: v.y + index * 20 };
  s.transact(() => {
    const id = s.create({ type: "file", x: Math.round(pos.x), y: Math.round(pos.y), w: 280, h: 72, fit: true, name: it.name.split("/").pop() || it.name, mime: it.mime, bytes: it.size, src: it.src, parent: v.parent });
    s.update(shelfId, { items: items.filter((_, i) => i !== index) });
    s.selection.set([id]);
  });
}
