/* Звуки объектов — синтез на лету, без файлов: сигнал таймера, стук
   кубиков, звон монетки, «бзз» кнопки «кто первый»… Звучит только во
   вкладке, которую видно, и только если в настройках не выключено. */

import { session } from "../../lib/session.svelte.ts";

let audio: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (document.visibilityState !== "visible") return null;
  if (session.settings.sound === false) return null;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, f: number, t: number, len: number, type: OscillatorType = "sine", vol = 0.15, glide?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + len);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + len + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext, t: number, len: number, vol: number, freq: number, q = 1.2) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, Math.round(c.sampleRate * 0.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.3);
  src.stop(t + len + 0.02);
}

const SOUNDS: Record<string, (c: AudioContext, t: number) => void> = {
  beep: (c, t) => {
    tone(c, 880, t, 0.35, "sine", 0.18);
    tone(c, 1175, t + 0.22, 0.4, "sine", 0.18);
  },
  bell: (c, t) => {
    for (const [f, v] of [
      [1318.5, 0.16],
      [2637, 0.05],
      [3951, 0.03],
    ] as const)
      tone(c, f, t, 1.6, "sine", v);
    tone(c, 1318.5, t + 0.5, 1.4, "sine", 0.1);
  },
  chime: (c, t) => {
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(c, f, t + i * 0.16, 0.7, "triangle", 0.12));
  },
  alarm: (c, t) => {
    for (let i = 0; i < 6; i++) tone(c, i % 2 ? 1046 : 880, t + i * 0.16, 0.13, "square", 0.06);
  },
  dice: (c, t) => {
    // кубики катятся и стучат: несколько щелчков со случайными паузами
    let at = t;
    for (let i = 0; i < 7; i++) {
      at += 0.04 + Math.random() * 0.09 + i * 0.012;
      noise(c, at, 0.05, 0.22 - i * 0.02, 1800 + Math.random() * 2200, 2.5);
    }
  },
  coin: (c, t) => {
    tone(c, 2093, t, 0.5, "sine", 0.1);
    tone(c, 2637, t + 0.06, 0.45, "sine", 0.07);
    tone(c, 4186, t + 0.06, 0.25, "sine", 0.03);
  },
  flip: (c, t) => noise(c, t, 0.12, 0.12, 900, 0.8),
  card: (c, t) => {
    noise(c, t, 0.07, 0.14, 3200, 0.9);
    noise(c, t + 0.05, 0.06, 0.08, 2000, 0.9);
  },
  shuffle: (c, t) => {
    for (let i = 0; i < 10; i++) noise(c, t + i * 0.035, 0.04, 0.08, 2500 + Math.random() * 1500, 1);
  },
  buzz: (c, t) => {
    tone(c, 110, t, 0.45, "sawtooth", 0.09);
    tone(c, 220, t, 0.45, "square", 0.04);
  },
  pop: (c, t) => tone(c, 520, t, 0.12, "sine", 0.16, 980),
  click: (c, t) => noise(c, t, 0.025, 0.18, 2600, 3),
  tick: (c, t) => tone(c, 1800, t, 0.03, "square", 0.04),
  win: (c, t) => {
    [523.25, 659.25, 783.99].forEach((f, i) => tone(c, f, t + i * 0.1, 0.2, "triangle", 0.13));
    tone(c, 1046.5, t + 0.3, 0.6, "triangle", 0.15);
  },
  whoosh: (c, t) => noise(c, t, 0.35, 0.1, 700, 0.6),
};

export const SOUND_NAMES = Object.keys(SOUNDS);

export function playSound(kind: string) {
  const f = Object.hasOwn(SOUNDS, kind) ? SOUNDS[kind] : undefined;
  const c = f ? ctx() : null;
  if (!c || !f) return;
  try {
    f(c, c.currentTime + 0.01);
  } catch {
    /* звук недоступен */
  }
}
