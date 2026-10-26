/* Действия новых объектов: кнопка, переключатель, ползунок, оценка,
   колесо, статус, трекер, эффекты. Общие для всех участников; каждый
   пишет свои поля, поэтому одновременные нажатия не теряются. */
import type { Board } from "../board.svelte.ts";
import { markKey, rateKey, type NodeData } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";
import { randInt } from "./games.ts";
import { statusesOf } from "./values.ts";

type Patch = [string, Partial<NodeData>];
const P = (id: string, patch: Record<string, unknown>): Patch => [id, patch as Partial<NodeData>];

export function pressButton(b: Board, v: NodeView) {
  if (b.readonly) return;
  const me = b.me;
  b.view.update(v.id, { press: { s: (v.props.press?.s ?? 0) + 1, n: me.name, c: me.color } });
  const href = v.props.href?.trim();
  if (href) followHref(b, href);
}

/** Куда ведёт кнопка: #id объекта на доске или адрес. */
export function followHref(b: Board, href: string) {
  if (href.startsWith("#")) {
    const t = b.view.get(href.slice(1));
    if (t) b.camera.fit(b.view.bounds(t), { maxZoom: 1.2, animate: true });
    return;
  }
  if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
}

export function setSwitch(b: Board, ids: string[], on: boolean | "toggle") {
  b.view.updateMany(
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (!v) return [];
      const next = on === "toggle" ? !v.props.on : on;
      return [P(id, { on: next || undefined })];
    }),
  );
}

export function clampSlider(v: NodeView, val: number): number {
  const lo = v.props.min ?? 0;
  const hi = v.props.max ?? 100;
  const st = v.props.step && v.props.step > 0 ? v.props.step : 1;
  const k = Math.round((Math.max(lo, Math.min(hi, val)) - lo) / st) * st + lo;
  return Math.round(Math.max(lo, Math.min(hi, k)) * 1000) / 1000;
}

export function rate(b: Board, v: NodeView, n: number) {
  if (b.readonly) return;
  const k = rateKey(b.me.id);
  const cur = (v.props as Record<string, unknown>)[k];
  b.view.update(v.id, { [k]: cur === n ? undefined : n } as Partial<NodeData>);
}

export function clearRatings(b: Board, v: NodeView) {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(v.props)) if (k.startsWith("rt:")) patch[k] = undefined;
  b.view.update(v.id, patch as Partial<NodeData>);
}

/* -------------------------------- колесо -------------------------------- */

export const WHEEL_COLORS = ["#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#14b8a6", "#a855f7", "#84cc16", "#f43f5e"];
export const SPIN_MS = 4200;

export function wheelOptions(v: NodeView): { id: string; t: string }[] {
  const o = v.props.opts;
  return Array.isArray(o) && o.length ? o : [1, 2, 3, 4, 5, 6].map((i) => ({ id: `o${i}`, t: `Вариант ${i}` }));
}

export function spinWheel(b: Board, ids: string[]) {
  if (b.readonly) return;
  const me = b.me;
  b.view.updateMany(
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "wheel") return [];
      const opts = wheelOptions(v);
      const n = opts.length;
      const i = randInt(n) - 1;
      const seg = 360 / n;
      const jitter = (Math.random() - 0.5) * seg * 0.7;
      const target = (((360 - (i * seg + seg / 2 + jitter)) % 360) + 360) % 360;
      const prev = v.props.spin?.a ?? 0;
      const a = prev - (((prev % 360) + 360) % 360) + 360 * (5 + randInt(3)) + target;
      return [P(id, { spin: { s: (v.props.spin?.s ?? 0) + 1, a: Math.round(a * 100) / 100, i, n: me.name, c: me.color, at: Date.now() } })];
    }),
  );
}

/** Выпавший вариант (после остановки). */
export function wheelResult(v: NodeView): { id: string; t: string } | null {
  const sp = v.props.spin;
  if (!sp) return null;
  return wheelOptions(v)[sp.i] ?? null;
}

/* -------------------------------- статус -------------------------------- */

export function setStatus(b: Board, ids: string[], idx: number | "next") {
  b.view.updateMany(
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "status") return [];
      const n = statusesOf(v.props).length;
      const next = idx === "next" ? ((v.props.st ?? 0) + 1) % n : Math.max(0, Math.min(n - 1, idx));
      return [P(id, { st: next })];
    }),
  );
}

/* -------------------------------- трекер -------------------------------- */

export const cellsOf = (v: NodeView) => Math.max(1, Math.min(60, v.props.cells ?? 7));

export function toggleMark(b: Board, v: NodeView, i: number) {
  if (b.readonly) return;
  const k = markKey(i);
  b.view.update(v.id, { [k]: (v.props as Record<string, unknown>)[k] ? undefined : true } as Partial<NodeData>);
}

export function markPatch(v: NodeView, how: "next" | "last" | "clear"): Record<string, unknown> {
  const n = cellsOf(v);
  const p = v.props as Record<string, unknown>;
  if (how === "clear") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(p)) if (k.startsWith("k:")) out[k] = undefined;
    return out;
  }
  if (how === "next") {
    for (let i = 0; i < n; i++) if (!p[markKey(i)]) return { [markKey(i)]: true };
    return {};
  }
  for (let i = n - 1; i >= 0; i--) if (p[markKey(i)]) return { [markKey(i)]: undefined };
  return {};
}

/* -------------------------------- эффекты -------------------------------- */

export const FX_KINDS: [string, string][] = [
  ["confetti", "🎉 Салют"],
  ["hearts", "💖 Сердечки"],
  ["stars", "⭐ Звёзды"],
  ["flash", "✨ Вспышка"],
  ["shake", "📳 Встряска"],
  ["pulse", "💓 Пульс"],
  ["ding", "🔔 Звук «дзынь»"],
  ["fanfare", "🎺 Фанфары"],
];

export function fxPatch(v: NodeView, kind: string): Record<string, unknown> {
  return { fxe: { s: (v.props.fxe?.s ?? 0) + 1, k: kind } };
}

/* --------------------------------- часы --------------------------------- */

export const TIMEZONES: [string, string][] = [
  ["", "Моё время"],
  ["Europe/Kaliningrad", "Калининград"],
  ["Europe/Moscow", "Москва"],
  ["Europe/Samara", "Самара"],
  ["Asia/Yekaterinburg", "Екатеринбург"],
  ["Asia/Omsk", "Омск"],
  ["Asia/Novosibirsk", "Новосибирск"],
  ["Asia/Krasnoyarsk", "Красноярск"],
  ["Asia/Irkutsk", "Иркутск"],
  ["Asia/Vladivostok", "Владивосток"],
  ["Asia/Kamchatka", "Камчатка"],
  ["Europe/Minsk", "Минск"],
  ["Europe/Kyiv", "Киев"],
  ["Asia/Almaty", "Алматы"],
  ["Asia/Tashkent", "Ташкент"],
  ["Asia/Tbilisi", "Тбилиси"],
  ["Asia/Yerevan", "Ереван"],
  ["Asia/Baku", "Баку"],
  ["Europe/Istanbul", "Стамбул"],
  ["Europe/London", "Лондон"],
  ["Europe/Berlin", "Берлин"],
  ["Europe/Paris", "Париж"],
  ["Asia/Dubai", "Дубай"],
  ["Asia/Kolkata", "Дели"],
  ["Asia/Bangkok", "Бангкок"],
  ["Asia/Shanghai", "Пекин"],
  ["Asia/Tokyo", "Токио"],
  ["Australia/Sydney", "Сидней"],
  ["America/New_York", "Нью-Йорк"],
  ["America/Chicago", "Чикаго"],
  ["America/Los_Angeles", "Лос-Анджелес"],
  ["America/Sao_Paulo", "Сан-Паулу"],
  ["UTC", "UTC"],
];

export function tzLabel(tz: string | undefined): string {
  if (!tz) return "Моё время";
  return TIMEZONES.find(([z]) => z === tz)?.[1] ?? tz.split("/").pop()!.replace(/_/g, " ");
}

const fmts = new Map<string, Intl.DateTimeFormat>();

/** Часы, минуты, секунды и дата в нужном поясе (неизвестный пояс — свой). */
export function clockParts(now: number, tz: string | undefined): { h: number; m: number; s: number; date: string } {
  const key = tz || "";
  let f = fmts.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("ru-RU", { timeZone: tz || undefined, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "long", day: "numeric", month: "long" });
    } catch {
      f = new Intl.DateTimeFormat("ru-RU", { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "long", day: "numeric", month: "long" });
    }
    fmts.set(key, f);
  }
  const parts = f.formatToParts(now);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return { h: Number(get("hour")) % 24, m: Number(get("minute")), s: Number(get("second")), date: `${get("weekday")}, ${get("day")} ${get("month")}` };
}

/** Разница с моим временем: «+3 ч», «−1 ч 30 мин», пусто — совпадает. */
export function tzShift(now: number, tz: string | undefined): string {
  if (!tz) return "";
  const a = clockParts(now, tz);
  const b = clockParts(now, undefined);
  let d = a.h * 60 + a.m - (b.h * 60 + b.m);
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  if (!d) return "";
  const h = Math.trunc(Math.abs(d) / 60);
  const m = Math.abs(d) % 60;
  return `${d > 0 ? "+" : "−"}${h ? `${h} ч` : ""}${h && m ? " " : ""}${m ? `${m} мин` : ""}`;
}

/* --------------------------- обратный отсчёт --------------------------- */

export function countdownParts(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/** Значение для <input type="datetime-local"> в моём поясе. */
export function localInput(ms: number | null | undefined): string {
  if (typeof ms !== "number") return "";
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
