/* Перенести элемент в body: нужно всему, что position: fixed внутри
   слоя мира (transform создаёт свою систему координат для fixed). */
import type { Attachment } from "svelte/attachments";

export const portal: Attachment<HTMLElement> = (el) => {
  document.body.appendChild(el);
  return () => el.remove();
};

/** Фокус и выделение текста в поле при появлении. */
export const focusSelect: Attachment<HTMLInputElement | HTMLTextAreaElement> = (el) => {
  requestAnimationFrame(() => {
    el.focus({ preventScroll: true });
    el.select();
  });
};
