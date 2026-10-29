/* Координаты внутри узла: для перетаскивания карточек канбана, этапов
   дорожной карты и рисования по карте уровня. Учитывают масштаб и
   поворот узла — работают так же, как перетаскивание самих узлов. */
import type { Board } from "../board.svelte.ts";
import type { Pt } from "../geometry.ts";
import type { NodeView } from "../store.svelte.ts";

/** Точка окна → точка узла в его собственных px (без поворота). */
export function nodeLocal(b: Board, v: NodeView, cx: number, cy: number): Pt {
  const w = b.ix.worldAt(cx, cy);
  const h = v.H;
  const dx = w.x - (v.x + v.w / 2);
  const dy = w.y - (v.y + h / 2);
  const c = Math.cos(-v.r);
  const s = Math.sin(-v.r);
  return { x: v.w / 2 + dx * c - dy * s, y: h / 2 + dx * s + dy * c };
}

/** Левый верхний угол элемента в px узла. */
export function offsetIn(el: HTMLElement): Pt {
  let x = 0;
  let y = 0;
  let e: HTMLElement | null = el;
  while (e && e.dataset.id === undefined) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
    // offsetLeft отсчитывается от внутреннего края рамки родителя
    if (e) {
      x += e.clientLeft;
      y += e.clientTop;
    }
  }
  return { x, y };
}

/** Точка окна → точка внутри элемента (px узла). */
export function localIn(b: Board, v: NodeView, el: HTMLElement, cx: number, cy: number): Pt {
  const p = nodeLocal(b, v, cx, cy);
  const o = offsetIn(el);
  return { x: p.x - o.x, y: p.y - o.y };
}

/** Сдвиг указателя на экране → сдвиг в px узла (масштаб и поворот). */
export function localDelta(b: Board, v: NodeView, dx: number, dy: number): Pt {
  const z = b.camera.z;
  const c = Math.cos(-v.r);
  const s = Math.sin(-v.r);
  return { x: (dx * c - dy * s) / z, y: (dx * s + dy * c) / z };
}
