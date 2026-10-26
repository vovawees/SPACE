/* Настройки сервера. Читаются из окружения и (если есть) из файла .env в папке
   проекта — встроенным process.loadEnvFile, без dotenv. Переменные окружения
   важнее .env. Относительные пути считаются от папки проекта, а не от текущей
   папки, поэтому сервер одинаково работает из npm start, службы systemd,
   ярлыка и Docker. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");

const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (err) {
    console.warn("[space] не удалось прочитать .env:", (err as Error).message);
  }
}

const env = process.env;
const flag = (v: string | undefined) => v === "1" || v === "true" || v === "yes";
/** ~/… — от домашней папки (в .env оболочка тильду не раскрывает), остальное — от папки проекта. */
const fromRoot = (p: string) => (p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : path.resolve(ROOT, p));

export const config = {
  port: Number(env.PORT) || 8787,
  host: env.HOST || "0.0.0.0",
  storageDir: fromRoot(env.STORAGE_DIR || "storage"),
  /** Папка данных по умолчанию (внутри проекта) — ей можно смело ставить права 700. */
  defaultStorage: !env.STORAGE_DIR,
  maxUploadBytes: Math.max(1, Number(env.MAX_UPLOAD_MB) || 512) * 1024 * 1024,
  inviteCode: (env.SPACE_INVITE_CODE || "").trim(),
  unfurlPrivate: flag(env.UNFURL_PRIVATE),
  trustProxy: flag(env.TRUST_PROXY),
  githubToken: (env.GITHUB_TOKEN || "").trim(),
  distDir: fromRoot(env.DIST_DIR || "dist"),
  version: "1.1.0",
};

export type Config = typeof config;
