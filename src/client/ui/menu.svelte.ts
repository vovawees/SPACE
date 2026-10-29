/* Меню: контекстное (правая кнопка / долгое нажатие) и выпадающее.
   Описывается данными, рисуется одним MenuHost в корне приложения. */
import type { Component } from "svelte";

export interface MenuItem {
  label: string;
  icon?: Component<Record<string, unknown>>;
  /** Небольшой SVG-образец справа (например, вид наконечника). Только свой код, не ввод пользователя. */
  glyph?: string;
  /** SVG-значок слева вместо icon (например, контур фигуры). */
  iconSvg?: string;
  keys?: string;
  /** Подпись своим шрифтом (CSS-семейство) — образец в выборе шрифта. */
  font?: string;
  /** font-size-adjust для образца (у рукописных строчные мелкие). */
  fontAdj?: number;
  run?: () => void;
  items?: MenuEntry[];
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Свой элемент вместо строки (например, ряд цветов или сетка эмодзи). */
  custom?: "colors" | "emoji";
  colors?: { value: string; css: string; label: string }[];
  /** Для ряда цветов: недавние свои цвета и «+» — системная палитра. */
  allowCustom?: boolean;
  emojis?: string[];
  current?: string;
  pick?: (value: string) => void;
}

export type MenuEntry = MenuItem | "-" | { heading: string };

export interface MenuRequest {
  x: number;
  y: number;
  items: MenuEntry[];
  /** Привязка к элементу (выпадающее меню) — иначе по точке. */
  anchor?: HTMLElement;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end" | "right-start";
  onClose?: () => void;
}

class MenuState {
  open = $state<MenuRequest | null>(null);

  show(req: MenuRequest) {
    this.open?.onClose?.();
    this.open = req;
  }

  at(e: { clientX: number; clientY: number }, items: MenuEntry[], onClose?: () => void) {
    this.show({ x: e.clientX, y: e.clientY, items, onClose });
  }

  dropdown(anchor: HTMLElement, items: MenuEntry[], placement: MenuRequest["placement"] = "bottom-start") {
    const r = anchor.getBoundingClientRect();
    this.show({ x: r.left, y: r.bottom, items, anchor, placement });
  }

  close() {
    const o = this.open;
    // фокус был в меню — возвращаем на кнопку, которая его открыла
    if (o?.anchor && document.activeElement?.closest(".menu")) o.anchor.focus({ preventScroll: true });
    this.open = null;
    o?.onClose?.();
  }
}

export const menu = new MenuState();
