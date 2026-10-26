/* Свой цвет: палитра SPACE (оттенок, насыщенность, яркость, #hex, пипетка)
   и недавние цвета на этом устройстве. Раньше открывалось системное окно
   браузера через скрытое поле — на телефонах и в части браузеров оно не
   появлялось. Теперь палитра своя и работает одинаково везде. */
export type HexColor = `#${string}`;
const isHex = (c: unknown): c is HexColor => typeof c === "string" && /^#[\da-f]{6}$/i.test(c);

const KEY = "space:colors";
const MAX = 10;

/** Недавние свои цвета; текущий свой цвет выделения — первым. */
export function recentColors(current?: unknown, max = 6): HexColor[] {
  const list = readRecent();
  const out = isHex(current) && !list.includes(current.toLowerCase() as HexColor) ? [current.toLowerCase() as HexColor, ...list] : list;
  return out.slice(0, max);
}

function readRecent(): HexColor[] {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(a) ? a.filter(isHex).map((c) => c.toLowerCase() as HexColor).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberColor(hex: HexColor) {
  try {
    const h = hex.toLowerCase() as HexColor;
    localStorage.setItem(KEY, JSON.stringify([h, ...readRecent().filter((c) => c !== h)].slice(0, MAX)));
  } catch {
    /* приватный режим — без истории */
  }
}

export interface PickRequest {
  x: number;
  y: number;
  /** Что было до открытия: Esc возвращает это значение. */
  initial: string | undefined;
  /** Вызывается на лету (не чаще ~20 раз в секунду) и в конце. */
  pick: (color: string) => void;
  title?: string;
  /** Разрешить «Без цвета». */
  clear?: () => void;
}

class PickerState {
  open = $state<PickRequest | null>(null);
  /** Номер открытия — палитра пересоздаётся для нового запроса. */
  seq = $state(0);
}

export const picker = new PickerState();

/** Открыть палитру у точки (x, y). */
export function pickColor(initial: unknown, at: { x: number; y: number }, pick: (hex: string) => void, opts: { title?: string; clear?: () => void } = {}) {
  picker.open = { x: at.x, y: at.y, initial: typeof initial === "string" ? initial : undefined, pick, ...opts };
  picker.seq++;
}

export function closePicker() {
  picker.open = null;
}
