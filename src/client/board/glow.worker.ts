/* Свечение считается в отдельном потоке: перетаскивание и прокрутка не
   ждут его. Задание — кусок общей сетки и карточки рядом с ним; ответ —
   пиксели куска. Задания выполняются по порядку, поэтому поздняя правка
   всегда ложится поверх ранней. */
import { runGlowJobs, type GlowReply, type GlowRequest } from "./glow.ts";

const ctx = self as unknown as { onmessage: ((e: MessageEvent<GlowRequest>) => void) | null; postMessage(m: GlowReply, t?: Transferable[]): void };

ctx.onmessage = (e) => {
  const { id, jobs, tint, cap } = e.data;
  const results = runGlowJobs(jobs, tint, cap);
  ctx.postMessage({ id, results }, results.flatMap((r) => (r.buf ? [r.buf] : [])));
};
