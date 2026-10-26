/* Общий таймер: состояние — длительность, время окончания (идёт) или
   остаток (на паузе). Каждый клиент сам досчитывает до нуля. */
import type { NodeData, NodeProps } from "../model.ts";

export function timerLeft(p: NodeProps, now = Date.now()): number {
  const dur = Math.max(1000, p.dur ?? 300_000);
  if (typeof p.end === "number") return Math.max(0, p.end - now);
  if (typeof p.left === "number") return Math.max(0, Math.min(p.left, 24 * 3600_000));
  return dur;
}

export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

export function timerPatch(p: NodeProps, kind: "toggle" | "reset" | "add" | "sub" | "set", now: number, ms = 0): Partial<NodeData> {
  const dur = Math.max(1000, p.dur ?? 300_000);
  const left = timerLeft(p, now);
  const running = typeof p.end === "number" && left > 0;
  switch (kind) {
    case "toggle":
      return running ? { end: null, left } : { end: now + (left > 0 ? left : dur), left: null };
    case "reset":
      return { end: null, left: null };
    case "set":
      return { dur: ms, end: null, left: null };
    case "add":
    case "sub": {
      const d = kind === "add" ? 60_000 : -60_000;
      if (running) return { end: Math.max(now + 1000, (p.end as number) + d) };
      const next = Math.max(1000, (typeof p.left === "number" ? left : dur) + d);
      return typeof p.left === "number" ? { left: next } : { dur: Math.max(60_000, dur + d), left: null };
    }
  }
}

let audio: AudioContext | null = null;

/** Короткий двойной сигнал (без файлов). */
export function beep() {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const t0 = ctx.currentTime;
    for (const [i, f] of [880, 1175].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = t0 + i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    }
  } catch {
    /* звук недоступен */
  }
}
