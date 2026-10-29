/* Поле свечения считается в отдельном потоке: перетаскивание и прокрутка
   не ждут его. Прямоугольники приходят плоским массивом [x, y, w, h, …]. */
import { computeGlow } from "./glow.ts";
import type { Rect } from "./geometry.ts";

export interface GlowRequest {
  id: number;
  rects: Float64Array;
  area: Rect;
  tint: [number, number, number];
  cap: number;
}

export interface GlowReply {
  id: number;
  f: { x: number; y: number; step: number; bw: number; bh: number; buf: ArrayBuffer } | null;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<GlowRequest>) => void) | null; postMessage(m: GlowReply, t?: Transferable[]): void };

ctx.onmessage = (e) => {
  const { id, rects, area, tint, cap } = e.data;
  const list: Rect[] = [];
  for (let i = 0; i + 3 < rects.length; i += 4) list.push({ x: rects[i]!, y: rects[i + 1]!, w: rects[i + 2]!, h: rects[i + 3]! });
  const f = computeGlow(list, area, tint, cap);
  if (!f) return ctx.postMessage({ id, f: null });
  const buf = f.data.data.buffer as ArrayBuffer;
  ctx.postMessage({ id, f: { x: f.x, y: f.y, step: f.step, bw: f.bw, bh: f.bh, buf } }, [buf]);
};
