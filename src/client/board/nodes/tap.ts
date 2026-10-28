/* Щелчок по «живой» части объекта — карточка переворачивается, сюрприз
   открывается. Доска сама решает, был ли это щелчок (а не перетаскивание),
   и присылает элементу с [data-tap] событие. */
import type { Attachment } from "svelte/attachments";

export const TAP_EVENT = "space:tap";

export function onTap(fn: () => void): Attachment<HTMLElement> {
  return (el) => {
    el.dataset.tap = "";
    el.addEventListener(TAP_EVENT, fn);
    return () => {
      el.removeEventListener(TAP_EVENT, fn);
      delete el.dataset.tap;
    };
  };
}
