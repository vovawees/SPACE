/* Файлы: адресуются по содержимому (sha256). Одинаковый файл, брошенный
   дважды, хранится один раз. Отдача — потоком, с поддержкой Range
   (перемотка видео) и вечным кэшем: содержимое по адресу не меняется. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Context } from "hono";
import type { FileInfo } from "../shared/types.ts";
import type { UserRow } from "./auth.ts";
import { config } from "./config.ts";
import { now, q } from "./db.ts";
import { bad, HttpError, notFound } from "./http.ts";

const filesDir = path.join(config.storageDir, "files");
const tmpDir = path.join(config.storageDir, "tmp");
fs.mkdirSync(filesDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { force: true });

const HASH_RE = /^[a-f0-9]{64}$/;
export const filePath = (hash: string) => path.join(filesDir, hash.slice(0, 2), hash);

/* Типы, которые браузер мог бы исполнить как страницу: отдаём их в песочнице. */
const RISKY = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/x-javascript)$/;

function cleanName(raw: string | undefined): string {
  let name = "file";
  if (raw) {
    try {
      name = decodeURIComponent(raw);
    } catch {
      name = raw;
    }
  }
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
  return name.slice(0, 200) || "file";
}

function cleanMime(raw: string | undefined): string {
  const m = (raw || "").split(";")[0]!.trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) ? m : "application/octet-stream";
}

export async function receiveUpload(c: Context, user: UserRow): Promise<FileInfo> {
  const name = cleanName(c.req.header("x-file-name"));
  const mime = cleanMime(c.req.header("content-type"));
  const declared = Number(c.req.header("content-length") || 0);
  if (declared > config.maxUploadBytes) throw tooLarge();
  const body = c.req.raw.body;
  if (!body) throw bad("Пустой файл");

  const tmp = path.join(tmpDir, crypto.randomBytes(12).toString("hex"));
  const hash = crypto.createHash("sha256");
  let size = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > config.maxUploadBytes) return cb(tooLarge());
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), meter, fs.createWriteStream(tmp));
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    if (err instanceof HttpError) throw err;
    throw bad("Загрузка прервалась");
  }
  const digest = hash.digest("hex");
  const dest = filePath(digest);
  if (fs.existsSync(dest)) fs.rmSync(tmp, { force: true });
  else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(tmp, dest);
  }
  q("INSERT OR IGNORE INTO files (hash, size, mime, name, uploader, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    digest,
    size,
    mime,
    name,
    user.id,
    now(),
  );
  return { hash: digest, size, mime, name };
}

function tooLarge() {
  return new HttpError(413, "too_large", `Файл больше ${Math.round(config.maxUploadBytes / 1048576)} МБ`);
}

function disposition(kind: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function serveFile(c: Context, hash: string): Response {
  if (!HASH_RE.test(hash)) throw notFound("Файл не найден");
  const row = q("SELECT size, mime, name FROM files WHERE hash = ?").get(hash) as
    | { size: number; mime: string; name: string }
    | undefined;
  const file = filePath(hash);
  if (!row || !fs.existsSync(file)) throw notFound("Файл не найден");

  const etag = `"${hash.slice(0, 32)}"`;
  const headers = new Headers({
    "content-type": row.mime.startsWith("text/") ? `${row.mime}; charset=utf-8` : row.mime,
    etag,
    "cache-control": "private, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
  });
  const name = c.req.query("name") ? cleanName(c.req.query("name")) : row.name;
  headers.set("content-disposition", disposition(c.req.query("dl") ? "attachment" : "inline", name));
  if (RISKY.test(row.mime)) headers.set("content-security-policy", "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const size = row.size;
  const range = c.req.header("range");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      } else {
        start = Math.max(0, size - Number(m[2]));
      }
      if (start > end || start >= size) {
        headers.set("content-range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      status = 206;
      headers.set("content-range", `bytes ${start}-${end}/${size}`);
    }
  }
  headers.set("content-length", String(end - start + 1));
  if (c.req.method === "HEAD" || size === 0) return new Response(null, { status, headers });
  const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
  return new Response(stream, { status, headers });
}

export function fileInfo(hash: string): FileInfo | null {
  if (!HASH_RE.test(hash)) return null;
  const row = q("SELECT hash, size, mime, name FROM files WHERE hash = ?").get(hash) as FileInfo | undefined;
  return row ?? null;
}
