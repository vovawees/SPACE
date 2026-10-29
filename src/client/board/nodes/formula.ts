/* Формулы кривой баланса: «100 * 1.5^(x-1)», «round(50 * log(x+1))»,
   «if(x < 10, 5x, 50 + 2x)». Свой маленький разбор — никакого eval:
   числа, x (и его синонимы), + − * / % ^, сравнения, скобки, функции и
   константы. Умножение можно не писать: «2x», «3(x+1)». Дробная часть —
   через точку; запятая между цифрами вне скобок функции — тоже дробь. */

type Ev = (x: number) => number;

export interface Compiled {
  ok: boolean;
  /** Значение при x (NaN — не определено). */
  at: Ev;
  err?: string;
}

const FN: Record<string, { n: [number, number]; f: (...a: number[]) => number }> = {
  abs: { n: [1, 1], f: Math.abs },
  sqrt: { n: [1, 1], f: Math.sqrt },
  cbrt: { n: [1, 1], f: Math.cbrt },
  exp: { n: [1, 1], f: Math.exp },
  ln: { n: [1, 1], f: Math.log },
  log: { n: [1, 2], f: (a, b) => (b === undefined ? Math.log10(a) : Math.log(a) / Math.log(b)) },
  log2: { n: [1, 1], f: Math.log2 },
  log10: { n: [1, 1], f: Math.log10 },
  sin: { n: [1, 1], f: Math.sin },
  cos: { n: [1, 1], f: Math.cos },
  tan: { n: [1, 1], f: Math.tan },
  floor: { n: [1, 1], f: Math.floor },
  ceil: { n: [1, 1], f: Math.ceil },
  round: {
    n: [1, 2],
    f: (a, d) => {
      const k = 10 ** Math.max(0, Math.min(8, Math.round(d ?? 0)));
      return Math.round(a * k) / k;
    },
  },
  trunc: { n: [1, 1], f: Math.trunc },
  sign: { n: [1, 1], f: Math.sign },
  min: { n: [1, 32], f: Math.min },
  max: { n: [1, 32], f: Math.max },
  pow: { n: [2, 2], f: Math.pow },
  clamp: { n: [3, 3], f: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) },
  lerp: { n: [3, 3], f: (a, b, t) => a + (b - a) * t },
  if: { n: [2, 3], f: (c, a, b) => (c ? a : (b ?? 0)) },
};
const CONST: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };
/** Имена переменной: x, кириллическая «х», n, lvl, level, t. */
const VARS = new Set(["x", "х", "n", "lvl", "level", "t", "ур"]);

type Tok = { k: "num"; v: number } | { k: "id"; v: string } | { k: "op"; v: string } | { k: "(" | ")" | "," };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  // скобки функций — там запятая разделяет аргументы, а не дробь
  const stack: boolean[] = [];
  let i = 0;
  const s = src.replace(/[×·]/g, "*").replace(/[−–]/g, "-").replace(/÷/g, "/").replace(/\*\*/g, "^").replace(/²/g, "^2").replace(/³/g, "^3");
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[\d.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j]!)) j++;
      // «1,5» вне аргументов функции — дробь
      if (s[j] === "," && /\d/.test(s[j + 1] ?? "") && !stack.at(-1)) {
        j++;
        while (j < s.length && /\d/.test(s[j]!)) j++;
      }
      if (/[eE]/.test(s[j] ?? "") && /[\d+-]/.test(s[j + 1] ?? "") && (/\d/.test(s[j + 1]!) || /\d/.test(s[j + 2] ?? ""))) {
        j += 2;
        while (j < s.length && /\d/.test(s[j]!)) j++;
      }
      const v = Number(s.slice(i, j).replace(",", "."));
      if (!Number.isFinite(v)) throw new Error(`странное число «${s.slice(i, j)}»`);
      out.push({ k: "num", v });
      i = j;
      continue;
    }
    if (/[a-zа-яёπ_]/i.test(ch)) {
      let j = i;
      while (j < s.length && /[a-zа-яё0-9_π]/i.test(s[j]!)) j++;
      out.push({ k: "id", v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "==" || two === "!=" || two === "&&" || two === "||") {
      out.push({ k: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%^<>!".includes(ch)) {
      out.push({ k: "op", v: ch === "!" ? "!" : ch });
      i++;
      continue;
    }
    if (ch === "(") {
      const prev = out.at(-1);
      stack.push(prev?.k === "id" && prev.v in FN);
      out.push({ k: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      stack.pop();
      out.push({ k: ")" });
      i++;
      continue;
    }
    if (ch === "," || ch === ";") {
      out.push({ k: "," });
      i++;
      continue;
    }
    throw new Error(`непонятный знак «${ch}»`);
  }
  return out;
}

const BIN: Record<string, [number, (a: number, b: number) => number]> = {
  "||": [1, (a, b) => (a || b ? 1 : 0)],
  "&&": [2, (a, b) => (a && b ? 1 : 0)],
  "<": [3, (a, b) => (a < b ? 1 : 0)],
  "<=": [3, (a, b) => (a <= b ? 1 : 0)],
  ">": [3, (a, b) => (a > b ? 1 : 0)],
  ">=": [3, (a, b) => (a >= b ? 1 : 0)],
  "==": [3, (a, b) => (Math.abs(a - b) < 1e-9 ? 1 : 0)],
  "!=": [3, (a, b) => (Math.abs(a - b) >= 1e-9 ? 1 : 0)],
  "+": [4, (a, b) => a + b],
  "-": [4, (a, b) => a - b],
  "*": [5, (a, b) => a * b],
  "/": [5, (a, b) => a / b],
  "%": [5, (a, b) => ((a % b) + b) % b],
};
const POW = 7;
const UNARY = 6;

function parse(toks: Tok[]): Ev {
  let i = 0;
  const peek = () => toks[i];
  const need = (k: Tok["k"], what: string) => {
    if (toks[i]?.k !== k) throw new Error(`ожидалась ${what}`);
    i++;
  };

  function primary(): Ev {
    const t = toks[i++];
    if (!t) throw new Error("формула оборвалась");
    if (t.k === "num") {
      const v = t.v;
      return () => v;
    }
    if (t.k === "(") {
      const e = expr(0);
      need(")", "закрывающая скобка");
      return e;
    }
    if (t.k === "op" && (t.v === "-" || t.v === "+" || t.v === "!")) {
      const e = expr(UNARY);
      return t.v === "-" ? (x) => -e(x) : t.v === "!" ? (x) => (e(x) ? 0 : 1) : e;
    }
    if (t.k === "id") {
      if (VARS.has(t.v)) return (x) => x;
      if (t.v in FN && peek()?.k === "(") {
        i++;
        const args: Ev[] = [];
        if (peek()?.k !== ")") {
          args.push(expr(0));
          while (peek()?.k === ",") {
            i++;
            args.push(expr(0));
          }
        }
        need(")", "закрывающая скобка");
        const def = FN[t.v]!;
        if (args.length < def.n[0] || args.length > def.n[1]) throw new Error(`у ${t.v}() ${def.n[0] === def.n[1] ? def.n[0] : `${def.n[0]}–${def.n[1]}`} арг.`);
        const f = def.f;
        if (t.v === "if") {
          const [c, a, b] = args;
          return (x) => (c!(x) ? a!(x) : b ? b(x) : 0);
        }
        if (args.length === 1) {
          const a = args[0]!;
          return (x) => f(a(x));
        }
        return (x) => f(...args.map((a) => a(x)));
      }
      if (t.v in CONST) {
        const v = CONST[t.v]!;
        return () => v;
      }
      throw new Error(`не знаю «${t.v}»`);
    }
    throw new Error("лишний знак");
  }

  /** Неявное умножение: «2x», «3(x+1)», «x(x+1)», «(x+1)(x-1)». */
  function implicit(left: Ev): Ev {
    let e = left;
    for (;;) {
      const t = peek();
      if (!t || !(t.k === "(" || t.k === "id" || t.k === "num")) return e;
      const r = power(primary());
      const l = e;
      e = (x) => l(x) * r(x);
    }
  }

  function power(base: Ev): Ev {
    const t = peek();
    if (t?.k === "op" && t.v === "^") {
      i++;
      const exp = expr(POW - 1); // правая ассоциативность: 2^3^2 = 2^9
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  function expr(min: number): Ev {
    let left = implicit(power(primary()));
    for (;;) {
      const t = peek();
      if (!t || t.k !== "op" || !(t.v in BIN)) break;
      const [prec, f] = BIN[t.v]!;
      if (prec <= min) break;
      i++;
      const right = expr(prec);
      const l = left;
      left = (x) => f(l(x), right(x));
    }
    return left;
  }

  const e = expr(0);
  if (i < toks.length) throw new Error("лишнее в конце");
  return e;
}

const cache = new Map<string, Compiled>();

/** Разобрать формулу (с запоминанием). */
export function compile(src: string): Compiled {
  const key = src.trim();
  const hit = cache.get(key);
  if (hit) return hit;
  let out: Compiled;
  try {
    if (!key) throw new Error("пустая формула");
    if (key.length > 400) throw new Error("слишком длинная");
    const ev = parse(tokenize(key));
    out = { ok: true, at: (x) => {
      const y = ev(x);
      return Number.isFinite(y) ? y : NaN;
    } };
  } catch (e) {
    out = { ok: false, at: () => NaN, err: (e as Error).message };
  }
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

/** Значение формулы при x; NaN — не определено или ошибка. */
export const evalAt = (src: string, x: number) => compile(src).at(x);

/** «Круглые» деления шкалы от lo до hi (примерно n штук). */
export function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi - lo < 1e-12) {
    const d = Math.abs(lo) || 1;
    lo -= d / 2;
    hi += d / 2;
  }
  const raw = (hi - lo) / Math.max(1, n);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  return out;
}

/** Короткая запись числа для подписей: 1 250 · 12,5 тыс. · 3,4 млн. */
export function shortNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const f = (v: number, d: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: d });
  if (a >= 1e9) return `${f(n / 1e9, 1)} млрд`;
  if (a >= 1e6) return `${f(n / 1e6, 1)} млн`;
  if (a >= 1e4) return `${f(n / 1e3, 1)} тыс`;
  if (a >= 100) return f(n, 0);
  if (a >= 1) return f(n, 2);
  return f(n, 3);
}
