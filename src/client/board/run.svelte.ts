/* Запуск JavaScript из блока кода. Код работает в отдельном потоке —
   Worker из data:-адреса. У такого потока «пустое» происхождение: куки,
   хранилище и API доски ему недоступны, а бесконечный цикл обрывается
   по времени. Вывод — только у того, кто запустил (не синхронизируется). */
import { SvelteMap } from "svelte/reactivity";

export type RunKind = "log" | "info" | "warn" | "error" | "result";
export interface RunLine {
  k: RunKind;
  t: string;
}
export interface RunState {
  lines: RunLine[];
  running: boolean;
  ms?: number;
  /** Чем закончилось: без ошибок, с ошибкой или остановлено. */
  end?: "ok" | "error" | "stopped";
}

/** «22 мс», «1,4 с». */
export function runTime(ms: number): string {
  return ms < 1000 ? `${ms} мс` : `${(ms / 1000).toFixed(1).replace(".", ",")} с`;
}

export const RUN_LANGS = new Set(["javascript"]);
const LIMIT_MS = 5000;
const MAX_LINES = 200;

/* Внутри потока: console → сообщения, аккуратный вывод объектов. */
const PRELUDE = String.raw`
const seen = new WeakSet();
const fmt = (x, d = 0, top = true) => {
  if (typeof x === "string") return top ? x : JSON.stringify(x);
  if (typeof x === "bigint") return x + "n";
  if (typeof x === "symbol") return x.toString();
  if (typeof x === "function") return "ƒ " + (x.name || "anonymous") + "()";
  if (x === null || typeof x !== "object") return String(x);
  if (x instanceof Error) return x.name + ": " + x.message;
  if (x instanceof Date) return x.toISOString();
  if (x instanceof RegExp) return String(x);
  if (seen.has(x)) return "[Circular]";
  if (d > 2) return Array.isArray(x) ? "[…]" : "{…}";
  seen.add(x);
  try {
    if (Array.isArray(x)) {
      const a = x.slice(0, 50).map((v) => fmt(v, d + 1, false));
      if (x.length > 50) a.push("… ещё " + (x.length - 50));
      return "[" + a.join(", ") + "]";
    }
    if (x instanceof Map) return "Map(" + x.size + ") {" + [...x].slice(0, 30).map(([k, v]) => fmt(k, d + 1, false) + " => " + fmt(v, d + 1, false)).join(", ") + "}";
    if (x instanceof Set) return "Set(" + x.size + ") {" + [...x].slice(0, 30).map((v) => fmt(v, d + 1, false)).join(", ") + "}";
    const keys = Object.keys(x);
    const body = keys.slice(0, 30).map((k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + fmt(x[k], d + 1, false));
    if (keys.length > 30) body.push("…");
    const name = x.constructor && x.constructor !== Object ? x.constructor.name + " " : "";
    return name + "{ " + body.join(", ") + (body.length ? " }" : "}");
  } finally {
    seen.delete(x);
  }
};
const send = (k, args) => postMessage({ k, t: args.map((a) => fmt(a)).join(" ").slice(0, 4000) });
for (const k of ["log", "info", "warn", "error", "debug", "table"]) console[k] = (...a) => send(k === "debug" || k === "table" ? "log" : k, a);
self.onmessage = async (e) => {
  const code = e.data;
  try {
    if (/\bawait\b/.test(code)) await (0, eval)("(async () => {\n" + code + "\n})()");
    else {
      const r = (0, eval)(code);
      const v = r instanceof Promise ? await r : r;
      if (v !== undefined) postMessage({ k: "result", t: fmt(v, 0, false).slice(0, 4000) });
    }
  } catch (err) {
    postMessage({ k: "error", t: err instanceof Error ? err.name + ": " + err.message : String(err) });
  }
  postMessage({ done: true });
};
`;

class Runs {
  readonly state = new SvelteMap<string, RunState>();
  private workers = new Map<string, { w: Worker; timer: ReturnType<typeof setTimeout> }>();

  run(id: string, code: string) {
    this.stop(id, true);
    const st: RunState = $state({ lines: [], running: true });
    this.state.set(id, st);
    let w: Worker;
    try {
      w = new Worker(`data:text/javascript;charset=utf-8,${encodeURIComponent(PRELUDE)}`);
    } catch {
      st.lines.push({ k: "error", t: "Браузер не дал запустить код" });
      st.running = false;
      st.end = "error";
      return;
    }
    const t0 = performance.now();
    const finish = (end?: RunState["end"]) => {
      st.running = false;
      st.ms = Math.round(performance.now() - t0);
      st.end = end ?? (st.lines.some((l) => l.k === "error") ? "error" : "ok");
      this.stop(id, true);
    };
    w.onmessage = (e: MessageEvent<{ k?: RunKind; t?: string; done?: boolean }>) => {
      if (e.data.done) return finish();
      if (st.lines.length < MAX_LINES) st.lines.push({ k: e.data.k ?? "log", t: String(e.data.t ?? "") });
      else if (st.lines.length === MAX_LINES) st.lines.push({ k: "warn", t: "… вывод обрезан" });
    };
    w.onerror = (e) => {
      e.preventDefault();
      st.lines.push({ k: "error", t: e.message || "Ошибка" });
      finish("error");
    };
    const timer = setTimeout(() => {
      st.lines.push({ k: "error", t: `Код работал дольше ${LIMIT_MS / 1000} секунд и был остановлен` });
      finish("stopped");
    }, LIMIT_MS);
    this.workers.set(id, { w, timer });
    w.postMessage(code);
  }

  /** Остановить; keep — оставить вывод на экране. */
  stop(id: string, keep = false) {
    const it = this.workers.get(id);
    if (it) {
      clearTimeout(it.timer);
      it.w.terminate();
      this.workers.delete(id);
      const st = this.state.get(id);
      if (st?.running) {
        st.running = false;
        st.end = "stopped";
      }
    }
    if (!keep) this.state.delete(id);
  }

  stopAll() {
    for (const id of [...this.workers.keys()]) this.stop(id);
    this.state.clear();
  }
}

export const runs = new Runs();
