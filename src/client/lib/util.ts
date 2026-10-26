/* Мелочи: форматирование, склонения, время. */

/** Русские склонения: plural(5, "доска", "доски", "досок") → "досок". */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1).replace(".", ",") : Math.round(v)} ${units[i]}`;
}

const dtf = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" });
const dtfYear = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" });
const tf = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" });

export function ago(t: number, now = Date.now()): string {
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "только что";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${plural(m, "минуту", "минуты", "минут")} назад`;
  const h = Math.round(m / 60);
  if (h < 24 && new Date(t).getDate() === new Date(now).getDate()) return `сегодня в ${tf.format(t)}`;
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  if (new Date(t).toDateString() === d.toDateString()) return `вчера в ${tf.format(t)}`;
  return new Date(t).getFullYear() === new Date(now).getFullYear() ? dtf.format(t) : dtfYear.format(t);
}

export function dateTime(t: number): string {
  const sameYear = new Date(t).getFullYear() === new Date().getFullYear();
  return `${(sameYear ? dtf : dtfYear).format(t)}, ${tf.format(t)}`;
}

export function timeOnly(t: number): string {
  return tf.format(t);
}

export function dayLabel(t: number): string {
  const d = new Date(t).toDateString();
  const today = new Date();
  if (d === today.toDateString()) return "Сегодня";
  today.setDate(today.getDate() - 1);
  if (d === today.toDateString()) return "Вчера";
  return new Date(t).getFullYear() === new Date().getFullYear() ? dtf.format(t) : dtfYear.format(t);
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const isTouch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
export const mod = isMac ? "⌘" : "Ctrl";

/** Человекочитаемая запись сочетания: "Mod+Shift+Z" → "Ctrl Shift Z". */
export function keyLabel(combo: string): string[] {
  return combo.split("+").map((k) => {
    if (k === "Mod") return mod;
    if (k === "Alt") return isMac ? "⌥" : "Alt";
    if (k === "Shift") return isMac ? "⇧" : "Shift";
    if (k === "Del") return isMac ? "⌫" : "Del";
    return k;
  });
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function download(data: Blob | string, name: string): void {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  if (typeof data !== "string") setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export const RANDOM_NAMES = [
  "Лис", "Ёж", "Сова", "Кит", "Рысь", "Барсук", "Енот", "Филин", "Выдра", "Пингвин", "Панда", "Тюлень",
];
