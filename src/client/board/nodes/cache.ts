/* Готовый HTML содержимого кэшируется прямо в узле (NodeView.cache):
   при прокрутке узлы уходят из DOM и возвращаются, а Markdown и
   подсветка не пересчитываются, пока текст не изменился. */
import type { BoardStore, NodeView } from "../store.svelte.ts";
import { assets, highlight, renderMarkdown } from "../text.svelte.ts";

function cached(v: NodeView, slot: string, key: string, make: () => string): string {
  const c = v.cache[slot] as { key: string; out: string } | undefined;
  if (c && c.key === key) return c.out;
  const out = make();
  v.cache[slot] = { key, out };
  return out;
}

export function markdownOf(v: NodeView): string {
  return cached(v, "md", `${v.textRev}:${assets.rev}`, () => {
    const t = v.textValue;
    return t.trim() ? renderMarkdown(t) : "";
  });
}

export function highlightOf(v: NodeView, lang: string): string {
  return cached(v, "hl", `${v.textRev}:${assets.rev}:${lang}`, () => highlight(v.textValue, lang));
}

/** Флажок задачи: меняется один символ, поэтому не мешает чужому вводу. */
export function toggleTask(s: BoardStore, v: NodeView, line: number) {
  const t = v.text;
  if (!t || s.readonly) return;
  const lines = t.toString().split("\n");
  const l = lines[line];
  if (l === undefined) return;
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xXхХ])\]/.exec(l);
  if (!m) return;
  let off = 0;
  for (let i = 0; i < line; i++) off += lines[i]!.length + 1;
  const pos = off + m[1]!.length + 1;
  s.transact(() => {
    t.delete(pos, 1);
    t.insert(pos, m[2] === " " ? "x" : " ");
  });
  v.ownsHeight = true;
}

/** Иконка и цвет файла по типу и расширению. */
export type FileKind = "image" | "video" | "audio" | "pdf" | "archive" | "code" | "text" | "app" | "doc" | "sheet" | "file";

export function fileKind(name = "", mime = ""): FileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/") || /^(mp3|wav|flac|ogg|m4a|aac|opus)$/.test(ext)) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (/^(zip|rar|7z|tar|gz|tgz|bz2|xz|zst)$/.test(ext)) return "archive";
  if (/^(exe|msi|dmg|pkg|apk|appimage|deb|rpm|bat|cmd)$/.test(ext)) return "app";
  if (/^(docx?|odt|rtf|pages)$/.test(ext)) return "doc";
  if (/^(xlsx?|ods|csv|numbers)$/.test(ext)) return "sheet";
  if (/^(js|ts|tsx|jsx|py|rs|go|java|kt|c|h|cpp|hpp|cs|php|rb|swift|lua|sh|ps1|sql|json|ya?ml|toml|xml|html?|css|scss|vue|svelte)$/.test(ext)) return "code";
  if (mime.startsWith("text/") || /^(txt|md|log|ini|cfg|env)$/.test(ext)) return "text";
  return "file";
}

export const FILE_COLORS: Record<FileKind, string> = {
  image: "var(--c-violet)",
  video: "var(--c-pink)",
  audio: "var(--c-cyan)",
  pdf: "var(--c-red)",
  archive: "var(--c-yellow)",
  code: "var(--c-blue)",
  text: "var(--c-gray)",
  app: "var(--c-green)",
  doc: "var(--c-blue)",
  sheet: "var(--c-green)",
  file: "var(--c-gray)",
};

export function extOf(name = ""): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i > name.length - 8 ? name.slice(i + 1).toUpperCase() : "";
}
