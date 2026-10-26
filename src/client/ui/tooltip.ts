/* Подсказки: одна общая всплывашка для всего приложения.
   Использование: <button {@attach tip("Отменить", "Mod+Z")}> */
import { computePosition, flip, offset, shift, type Placement } from "@floating-ui/dom";
import type { Attachment } from "svelte/attachments";
import { isTouch, keyLabel } from "../lib/util.ts";

let el: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let current: Element | null = null;
let warm = 0;

function ensure(): HTMLDivElement {
  if (el) return el;
  el = document.createElement("div");
  el.className = "tooltip";
  el.setAttribute("role", "tooltip");
  document.body.append(el);
  return el;
}

function show(target: Element, text: string, keys: string | undefined, placement: Placement) {
  const t = ensure();
  t.replaceChildren();
  const label = document.createElement("span");
  label.textContent = text;
  t.append(label);
  if (keys) {
    const k = document.createElement("span");
    k.className = "tooltip-keys";
    for (const part of keyLabel(keys)) {
      const s = document.createElement("span");
      s.textContent = part;
      k.append(s);
    }
    t.append(k);
  }
  t.dataset.show = "1";
  current = target;
  void computePosition(target, t, {
    placement,
    middleware: [offset(8), flip(), shift({ padding: 6 })],
  }).then(({ x, y }) => {
    if (current !== target) return;
    t.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  });
}

export function hideTip() {
  clearTimeout(timer);
  current = null;
  if (el) delete el.dataset.show;
}

export function tip(text: string | (() => string), keys?: string, placement: Placement = "top"): Attachment<HTMLElement> {
  return (node) => {
    if (isTouch) return;
    const enter = () => {
      clearTimeout(timer);
      const delay = Date.now() - warm < 600 ? 60 : 450;
      timer = setTimeout(() => show(node, typeof text === "function" ? text() : text, keys, placement), delay);
    };
    const leave = () => {
      if (current === node) warm = Date.now();
      hideTip();
    };
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("pointerdown", leave);
    if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", typeof text === "function" ? text() : text);
    return () => {
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("pointerdown", leave);
      if (current === node) hideTip();
    };
  };
}
