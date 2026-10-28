/* Нижний край экрана: слева масштаб, по центру инструменты. Обе панели
   меряют себя, и если по центру инструментам тесно, они отодвигаются
   вправо; а если места нет совсем — масштаб поднимается над ними. */
import { innerWidth } from "svelte/reactivity/window";

export const bottom = $state({ zoomW: 0, dockW: 0 });

const EDGE = 10;
const GAP = 12;

/** Масштаб — над инструментами: рядом они не помещаются. */
export function zoomLifted(insetRight: number): boolean {
  const vw = innerWidth.current ?? 0;
  if (vw <= 640 || !bottom.zoomW || !bottom.dockW) return false;
  return EDGE + bottom.zoomW + GAP + bottom.dockW + EDGE > vw - insetRight;
}

/** Середина панели инструментов, px от левого края; null — как задано в CSS. */
export function dockCenter(insetRight: number): number | null {
  const vw = innerWidth.current ?? 0;
  if (vw <= 640 || !bottom.dockW) return null;
  const mid = Math.max((vw - insetRight) / 2, EDGE + bottom.dockW / 2);
  if (zoomLifted(insetRight)) return mid;
  return Math.max(mid, EDGE + bottom.zoomW + GAP + bottom.dockW / 2);
}

/** Слева от панели настроек инструменты не помещаются вовсе — прячем их,
    пока панель открыта (как на телефоне). */
export function dockSqueezed(insetRight: number): boolean {
  const vw = innerWidth.current ?? 0;
  return vw > 640 && insetRight > 0 && !!bottom.dockW && bottom.dockW + 2 * EDGE > vw - insetRight;
}

/** Следить за шириной элемента. */
export function measure(set: (w: number) => void) {
  return (el: HTMLElement) => {
    const ro = new ResizeObserver(() => set(el.offsetWidth));
    ro.observe(el);
    set(el.offsetWidth);
    return () => {
      ro.disconnect();
      set(0);
    };
  };
}
