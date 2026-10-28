/* Общий таймер: состояние — длительность, время окончания (идёт) или
   остаток (на паузе). Каждый клиент сам досчитывает до нуля.
   Длительность — любая: от секунды до 999 дней. */
import type { NodeData, NodeProps } from "../model.ts";
import { playSound } from "./sound.ts";

export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** Предел длительности — 999 дней. */
export const MAX_DUR = 999 * DAY;

export const timerDur = (p: NodeProps) => Math.max(SEC, Math.min(MAX_DUR, p.dur ?? 5 * MIN));
export const timerStep = (p: NodeProps) => Math.max(SEC, Math.min(30 * DAY, p.tstep ?? MIN));

/** Сколько осталось. Таймер «по кругу» после окончания сразу идёт дальше:
    следующий круг вычисляется из того же времени окончания, поэтому
    у всех участников одинаковый и ничего не нужно записывать. */
export function timerLeft(p: NodeProps, now = Date.now()): number {
  if (typeof p.end === "number") {
    if (p.end > now) return p.end - now;
    const next = loopEnd(p, now);
    return next ? next - now : 0;
  }
  if (typeof p.left === "number") return Math.max(0, Math.min(p.left, MAX_DUR));
  return timerDur(p);
}

/** Сколько осталось: «04:59», «1:02:03», «3 д 02:00:05». */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  if (d) return `${d} д ${String(h).padStart(2, "0")}:${mm}:${ss}`;
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Длительность словами: «3 д 2 ч 5 с», «25 мин», «1 ч 30 мин». */
export function durText(ms: number): string {
  let s = Math.round(ms / 1000);
  const parts: string[] = [];
  for (const [n, u] of [
    [86400, "д"],
    [3600, "ч"],
    [60, "мин"],
    [1, "с"],
  ] as const) {
    const k = Math.floor(s / n);
    s -= k * n;
    if (k) parts.push(`${k} ${u}`);
  }
  return parts.join(" ") || "0 с";
}

/** Разбор длительности из текста: «3д 2ч 5с», «1:30:00», «90» (минуты), «1.5h». */
export function parseDur(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(",", ".");
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * MIN);
  const colon = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/.exec(t);
  if (colon) return ((Number(colon[1] ?? 0) * 60 + Number(colon[2])) * 60 + Number(colon[3])) * SEC;
  let ms = 0;
  let hit = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(дн|д|d|ч|h|мин|м|min|m|сек|с|s)[а-я]*/g)) {
    hit = true;
    const n = Number(m[1]);
    const u = m[2]!;
    ms += n * (u.startsWith("д") || u === "d" ? DAY : u.startsWith("ч") || u === "h" ? HOUR : u.startsWith("м") || u === "m" || u === "min" ? MIN : SEC);
  }
  return hit && ms > 0 ? Math.round(ms) : null;
}

export function timerPatch(p: NodeProps, kind: "toggle" | "reset" | "add" | "sub" | "set", now: number, ms = 0): Partial<NodeData> {
  const dur = timerDur(p);
  const left = timerLeft(p, now);
  const running = typeof p.end === "number" && left > 0;
  switch (kind) {
    case "toggle":
      return running ? { end: null, left } : { end: now + (left > 0 ? left : dur), left: null };
    case "reset":
      return { end: null, left: null };
    case "set":
      return { dur: Math.max(SEC, Math.min(MAX_DUR, ms)), end: null, left: null };
    case "add":
    case "sub": {
      const st = ms || timerStep(p);
      const d = kind === "add" ? st : -st;
      if (running) return { end: Math.max(now + 1000, (p.end as number) + d) };
      if (typeof p.left === "number") return { left: Math.max(SEC, Math.min(MAX_DUR, left + d)) };
      return { dur: Math.max(SEC, Math.min(MAX_DUR, dur + d)), left: null };
    }
  }
}

/** Таймер по кругу: ближайшее окончание после now (null — не по кругу или ещё идёт первый круг). */
export function loopEnd(p: NodeProps, now = Date.now()): number | null {
  if (!p.loop || typeof p.end !== "number" || p.end > now) return null;
  const dur = timerDur(p);
  const k = Math.max(1, Math.ceil((now - p.end) / dur + 1e-9));
  return p.end + k * dur;
}

/** Сигнал по окончании (без файлов). */
export function beep(kind?: string) {
  if (kind === "none") return;
  playSound(kind || "beep");
}

export const TIMER_SOUNDS: [string, string][] = [
  ["beep", "Сигнал"],
  ["bell", "Колокольчик"],
  ["chime", "Мелодия"],
  ["alarm", "Будильник"],
  ["none", "Без звука"],
];

export const TIMER_PRESETS_MS = [30 * SEC, MIN, 3 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 25 * MIN, 30 * MIN, 45 * MIN, HOUR, 2 * HOUR, DAY, 7 * DAY];
