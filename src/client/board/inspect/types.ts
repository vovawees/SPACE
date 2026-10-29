/* Описание панели настроек: из каких разделов и полей она состоит.
   Поля — простые объекты с get/set: панель сама рисует подходящий
   элемент, а запись идёт сразу во все выделенные объекты. */
import type { Component } from "svelte";
import type { MenuEntry } from "../../ui/menu.svelte.ts";

export type IconComp = Component<Record<string, unknown>>;
export type Opt = [value: string, label: string];

/** Строка списка: варианты опроса, игроки, пункты, грани кубика. */
export interface Row {
  id: string;
  t: string;
  c?: string;
  v?: number;
}

export interface Btn {
  label: string;
  icon?: IconComp;
  run: (e: MouseEvent) => void;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  /** Подсказка при наведении. */
  title?: string;
}

interface Base {
  /** Ключ для списка (по умолчанию — подпись). */
  key?: string;
  label?: string;
  hint?: string;
  /** Половина ширины: два поля в строку. */
  half?: boolean;
  disabled?: boolean;
}

export type Field =
  | (Base & { k: "text"; get: () => string; set: (v: string) => void; ph?: string; max?: number; lines?: number; mono?: boolean })
  | (Base & {
      k: "num";
      get: () => number | null;
      set: (v: number | null) => void;
      min?: number;
      max?: number;
      step?: number;
      ph?: string;
      unit?: string;
      /** Только целые. */
      int?: boolean;
      /** Можно оставить пустым (значение по умолчанию). */
      empty?: boolean;
      /** Кнопки −/+. */
      stepper?: boolean;
      /** Ползунок под полем. */
      slider?: boolean;
    })
  | (Base & { k: "toggle"; get: () => boolean; set: (v: boolean) => void })
  | (Base & { k: "seg"; opts: Opt[]; get: () => string; set: (v: string) => void })
  | (Base & { k: "chips"; opts: Opt[]; get: () => string | null; set: (v: string) => void; more?: Btn })
  | (Base & { k: "select"; opts: Opt[]; get: () => string; set: (v: string) => void })
  /** Кнопка-выбор с выпадающим меню (например, шрифт с образцами). */
  | (Base & { k: "menu"; get: () => { text: string; font?: string; adj?: number }; items: () => MenuEntry[] })
  | (Base & { k: "dur"; get: () => number; set: (ms: number) => void; presets?: number[]; min?: number })
  | (Base & { k: "when"; get: () => number | null; set: (ms: number | null) => void; presets?: [string, () => number][] })
  | (Base & { k: "date"; get: () => string | null; set: (iso: string | null) => void })
  | (Base & { k: "color"; get: () => string | undefined; set: (c: string | undefined) => void; none?: string })
  | (Base & { k: "emoji"; get: () => string | undefined; set: (e: string) => void })
  | (Base & { k: "icon"; get: () => string | undefined; set: (id: string) => void })
  | (Base & {
      k: "list";
      get: () => Row[];
      set: (rows: Row[]) => void;
      /** Цвет у строки, число у строки. */
      color?: boolean;
      num?: string;
      add?: string;
      ph?: string;
      min?: number;
      max?: number;
      /** Новая строка (номер — сколько уже есть). */
      make?: (n: number) => Row;
    })
  | (Base & { k: "btns"; btns: Btn[] })
  | (Base & { k: "info"; text: string });

export interface Section {
  id: string;
  title?: string;
  fields: Field[];
}
