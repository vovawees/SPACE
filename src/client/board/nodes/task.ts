/* Сроки задач: «сегодня», «завтра», «12 мая», просрочено. */

const DAY = 86_400_000;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Срок в виде YYYY-MM-DD → подписи и состояние. */
export function dueInfo(due: string, done: boolean, now = Date.now()): { short: string; full: string; late: boolean; soon: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.round((d.getTime() - startOfDay(now)) / DAY);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" }).replace(".", "");
  const short = days === 0 ? "Сегодня" : days === 1 ? "Завтра" : days === -1 ? "Вчера" : date;
  const full = `Срок: ${d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
  return { short, full, late: !done && days < 0, soon: !done && days >= 0 && days <= 1 };
}

/** Сегодня + n дней в формате YYYY-MM-DD (местное время). */
export function isoDay(offset = 0, now = Date.now()): string {
  const d = new Date(startOfDay(now) + offset * DAY + DAY / 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
