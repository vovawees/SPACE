/* Высота элемента через один общий ResizeObserver на всю доску. */
import type { Attachment } from "svelte/attachments";

type Cb = (h: number) => void;
const cbs = new WeakMap<Element, Cb>();
let ro: ResizeObserver | null = null;

function observer(): ResizeObserver {
  return (ro ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const size = e.borderBoxSize?.[0];
      const h = size ? size.blockSize : (e.target as HTMLElement).offsetHeight;
      cbs.get(e.target)?.(Math.round(h * 100) / 100);
    }
  }));
}

export function measureHeight(cb: Cb): Attachment<HTMLElement> {
  return (el) => {
    cbs.set(el, cb);
    observer().observe(el);
    return () => {
      ro?.unobserve(el);
      cbs.delete(el);
    };
  };
}
