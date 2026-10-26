/* Свой цвет: системная палитра браузера и недавние цвета (на этом устройстве). */
type HexColor = `#${string}`;
const isHex = (c: unknown): c is HexColor => typeof c === "string" && /^#[\da-f]{6}$/i.test(c);

const KEY = "space:colors";
const MAX = 6;

/** Недавние свои цвета; текущий свой цвет выделения — первым. */
export function recentColors(current?: unknown): HexColor[] {
  const list = readRecent();
  return isHex(current) && !list.includes(current.toLowerCase() as HexColor) ? [current.toLowerCase() as HexColor, ...list].slice(0, MAX) : list;
}

function readRecent(): HexColor[] {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(a) ? a.filter(isHex).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberColor(hex: HexColor) {
  try {
    localStorage.setItem(KEY, JSON.stringify([hex, ...readRecent().filter((c) => c !== hex)].slice(0, MAX)));
  } catch {
    /* приватный режим — без истории */
  }
}

let open: HTMLInputElement | null = null;

/** Открыть палитру у точки (x, y). Вызывать из обработчика щелчка. */
export function pickColor(initial: unknown, at: { x: number; y: number }, done: (hex: HexColor) => void) {
  open?.remove();
  const input = document.createElement("input");
  input.type = "color";
  input.value = isHex(initial) ? initial : "#f08a4b";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  Object.assign(input.style, { position: "fixed", left: `${at.x}px`, top: `${at.y}px`, width: "1px", height: "1px", opacity: "0", pointerEvents: "none", border: "0", padding: "0" });
  document.body.append(input);
  open = input;
  input.addEventListener(
    "change",
    () => {
      const v = input.value.toLowerCase();
      if (isHex(v)) {
        rememberColor(v);
        done(v);
      }
      input.remove();
      if (open === input) open = null;
    },
    { once: true },
  );
  input.click();
}
