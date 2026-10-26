/* Разовые эффекты на объекте — их видят все, у кого открыта доска:
   салют, сердечки и звёзды — частицы поверх узла; вспышка, встряска и
   пульс — класс на время; «дзынь» и фанфары — звук без файлов. */

const calm = () => document.documentElement.hasAttribute("data-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;

const GLYPHS: Record<string, string[]> = {
  hearts: ["💖", "❤️", "💕", "💗", "💘"],
  stars: ["⭐", "✨", "🌟", "💫"],
};
const CONFETTI = ["#f97316", "#facc15", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899", "#ef4444"];

export function playFx(el: HTMLElement, kind: string) {
  switch (kind) {
    case "confetti":
    case "hearts":
    case "stars":
      if (!calm()) burst(el, kind);
      else blink(el, "flash");
      break;
    case "flash":
    case "shake":
    case "pulse":
      blink(el, calm() ? "flash" : kind);
      break;
    case "ding":
      ding();
      blink(el, "pulse");
      break;
    case "fanfare":
      fanfare();
      if (!calm()) burst(el, "confetti");
      break;
  }
}

function blink(el: HTMLElement, kind: string) {
  const cls = `fxe-${kind}`;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 900);
}

function burst(el: HTMLElement, kind: string) {
  const box = document.createElement("div");
  box.className = "fx-burst";
  box.setAttribute("aria-hidden", "true");
  const w = el.offsetWidth || 200;
  const h = el.offsetHeight || 120;
  const reach = Math.max(90, Math.min(420, Math.max(w, h) * 0.75));
  const n = kind === "confetti" ? 34 : 18;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const d = reach * (0.55 + Math.random() * 0.6);
    p.style.setProperty("--dx", `${Math.cos(a) * d}px`);
    p.style.setProperty("--dy", `${Math.sin(a) * d - reach * 0.25}px`);
    p.style.setProperty("--r", `${Math.round((Math.random() - 0.5) * 720)}deg`);
    p.style.setProperty("--t", `${900 + Math.random() * 500}ms`);
    if (kind === "confetti") {
      p.className = "conf";
      p.style.background = CONFETTI[i % CONFETTI.length]!;
    } else {
      const g = GLYPHS[kind]!;
      p.className = "glyph";
      p.textContent = g[i % g.length]!;
      p.style.fontSize = `${Math.round(16 + Math.random() * 14)}px`;
    }
    box.append(p);
  }
  el.append(box);
  setTimeout(() => box.remove(), 1600);
}

/* --------------------------------- звук --------------------------------- */

let audio: AudioContext | null = null;

function tone(ctx: AudioContext, f: number, t: number, len: number, type: OscillatorType, vol: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + len + 0.05);
}

function withAudio(play: (ctx: AudioContext, t0: number) => void) {
  if (document.visibilityState !== "visible") return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    play(audio, audio.currentTime + 0.01);
  } catch {
    /* звук недоступен */
  }
}

export function ding() {
  withAudio((ctx, t) => {
    tone(ctx, 1568, t, 0.9, "sine", 0.16);
    tone(ctx, 3136, t, 0.5, "sine", 0.05);
  });
}

export function fanfare() {
  withAudio((ctx, t) => {
    [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, f, t + i * 0.12, 0.22, "triangle", 0.14));
    tone(ctx, 1046.5, t + 0.36, 0.7, "triangle", 0.16);
    tone(ctx, 783.99, t + 0.36, 0.7, "sine", 0.06);
  });
}
