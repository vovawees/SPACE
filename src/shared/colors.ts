/* Цвета людей: аватары, курсоры, выделения. Ровные по светлоте (OKLCH),
   чтобы ни один не «кричал» сильнее соседа и все читались на тёмном и светлом. */
export const PEOPLE_COLORS = [
  "#e5774f", // коралл
  "#e0a33a", // янтарь
  "#9fbe4a", // лайм
  "#3fb98a", // мята
  "#33b2c9", // бирюза
  "#5b9cf0", // небо
  "#8b84f3", // ирис
  "#c07be6", // сирень
  "#e36fa8", // фуксия
  "#9a958e", // тёплый серый
] as const;

export function randomPersonColor(): string {
  return PEOPLE_COLORS[Math.floor(Math.random() * PEOPLE_COLORS.length)]!;
}

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}
