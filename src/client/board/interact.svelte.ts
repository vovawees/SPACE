/* Указатель, касания и колесо: всё, что человек делает руками на доске.

   Каждое нажатие превращается в «жест» — маленький объект с move/up/cancel.
   Жест выбирается по инструменту и по тому, во что попали: ручка
   выделения, подпись рамки, узел, пустое место. Попадание сначала
   ищется в DOM (точно для сложных форм), а если DOM-узлов нет (дальний
   план рисуется на холсте) — геометрически. */
import { session } from "../lib/session.svelte.ts";
import { toasts } from "../lib/toast.svelte.ts";
import { menu } from "../ui/menu.svelte.ts";
import { hideTip } from "../ui/tooltip.ts";
import type { Board } from "./board.svelte.ts";
import { clampZoom } from "./camera.svelte.ts";
import { addFiles, addToShelf, addUrl, dropOnFileNode, fileUrl, looksLikeUrl, mergeIntoShelf } from "./files.ts";
import { BARBED, DEFAULT_BARBS, SIDE_N, fractionAt, magnetsOf, nearestOnOutline, outlineOf, routeOf, snapEnd, uvOf, uvPoint, type Side, type SnapHit } from "./connector.ts";
import { boundsOf, center, containsPt, dist, expand, fromPoints, intersects, rotate, simplify, snapAngle, type Pt, type Rect } from "./geometry.ts";
import { eraseHits, frameLabelHit, hitTest, insideNode, nodesInRect } from "./hit.ts";
import { canvasMenu, linkEndMenu, nodeMenu, stickerMenu } from "./menus.ts";
import { ASPECT_TYPES, TEXT_TYPES, TITLED_TYPES, WIDGET_EDIT_TYPES, WIDGET_TYPES, defaults, type Binding, type Color, type ColorName, type Head, type NodeData, type NodeProps, type NodeType, type ShapeKind, type StrokeSize } from "./model.ts";
import { duplicate, place, withChildren } from "./ops.ts";
import { recognize } from "./recognize.ts";
import { inkPx } from "./shapes.ts";
import { embedFor } from "./embeds.ts";
import { LIB_MIME, insertLib } from "./library.ts";
import { snapRect, type Guide } from "./snap.ts";
import type { NodeView } from "./store.svelte.ts";

export type GestureKind = "pan" | "press" | "move" | "marquee" | "resize" | "rotate" | "create" | "connect" | "ink" | "erase" | "laser" | "pinch" | "point";
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type EditorAt = { x: number; y: number } | "end" | "all";

export interface Ptr {
  /** Экран относительно доски. */
  sx: number;
  sy: number;
  /** Координаты окна (для меню и редактора). */
  cx: number;
  cy: number;
  /** Мир. */
  w: Pt;
  pressure: number;
  type: string;
  t: number;
  e?: PointerEvent;
}

interface Gesture {
  kind: GestureKind;
  /** Прокручивать доску, когда указатель у края экрана. */
  autopan?: boolean;
  move(p: Ptr): void;
  up(p: Ptr): void;
  cancel(): void;
}

export interface InkDraft {
  /** Плоский массив мировых точек [x, y, нажим, …]. */
  pts: number[];
  color: Color;
  size: StrokeSize;
  smart: boolean;
}

export type CreatePreview =
  | { kind: "shape"; shape: ShapeKind; rect: Rect }
  | { kind: "frame"; rect: Rect }
  | { kind: "line"; pts: Pt[]; b0: Binding | null; b1: Binding | null; props: NodeProps };

/** Куда сядет конец линии: магниты сторон и «бусина» на краю узла. */
export interface AnchorHint {
  id: string;
  dot: Pt | null;
  side: Side | null;
  magnets: { side: Side; p: Pt }[];
}

/** У каких узлов есть «+» для связей. */
export const CONNECTABLE = new Set<NodeType>(["note", "text", "code", "image", "video", "file", "shelf", "link", "shape", "sticker", "table", "task", "poll", "timer", "audio", "counter", "dice", "progress", ...WIDGET_TYPES]);

const LONG_PRESS = 520;

export class Interact {
  readonly b: Board;
  root: HTMLElement | null = null;

  /* ---- то, что рисует слой поверх доски ---- */
  kind = $state<GestureKind | null>(null);
  marquee = $state.raw<Rect | null>(null);
  /** Пальцем: касания добавляют к выделению и убирают из него (как с Shift). */
  multiSelect = $state(false);
  /** Отклик на долгое нажатие пальцем (экранные координаты). */
  pressRing = $state.raw<{ x: number; y: number; n: number } | null>(null);
  private pressSeq = 0;
  guides = $state.raw<Guide[]>([]);
  ink: InkDraft | null = null;
  inkRev = $state(0);
  create = $state.raw<CreatePreview | null>(null);
  /** Цель привязки линии или бросания файла. */
  hot = $state<string | null>(null);
  /** Подсказка привязки конца линии. */
  anchor = $state.raw<AnchorHint | null>(null);
  /** Узел под указателем — у него видны «+» для связей. */
  hoverNode = $state<string | null>(null);
  /** Рамка, в которую попадут перетаскиваемые узлы. */
  hotFrame = $state<string | null>(null);
  erasing = $state.raw<ReadonlySet<string>>(new Set());
  laser = $state.raw<Pt[]>([]);
  /** Рамка или полка, у которой сейчас правят название. */
  renaming = $state<string | null>(null);
  dragOver = $state(false);
  /** Указатель над доской (для курсора и присутствия). */
  hover = $state<Pt | null>(null);

  editAt: EditorAt = "end";
  mods = { shift: false, alt: false, ctrl: false };
  last: Ptr | null = null;

  private g: Gesture | null = null;
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private primary = -1;
  private ox = 0;
  private oy = 0;
  private lastTap = { t: 0, x: 0, y: 0, id: null as string | null };
  private linkOk = false;
  private rightPanned = false;
  /** Правая кнопка ещё зажата: на Linux и macOS меню приходит при нажатии — откроем его при отпускании, если не было прокрутки. */
  private rightDown = false;
  private pendingMenu: { cx: number; cy: number; el: Element; w: Pt } | null = null;
  private lastType = "mouse";
  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  /** Касание несколькими пальцами без движения: два — отменить, три — вернуть. */
  private multi: { t0: number; n: number; moved: boolean; x: number; y: number; d: number } | null = null;
  private down: { x: number; y: number; moved: boolean } | null = null;
  private autopanRaf = 0;
  private recentLines: { id: string; t: number }[] = [];
  private glide = { z: 1, sx: 0, sy: 0, raf: 0 };
  private lastTrackpad = 0;
  private inertiaRaf = 0;
  private hoverRaf = 0;
  private onHandle = false;

  constructor(b: Board) {
    this.b = b;
  }

  /* ============================== подключение ============================== */

  attach(root: HTMLElement): () => void {
    this.root = root;
    this.measure();
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions | boolean) => {
      root.addEventListener(type, fn as EventListener, opts);
      return () => root.removeEventListener(type, fn as EventListener, opts);
    };
    const prevent = (e: Event) => e.preventDefault();
    const offs = [
      on("pointerdown", this.onDown),
      on("pointermove", this.onMove),
      on("pointerup", this.onUp),
      on("pointercancel", this.onCancel),
      on("lostpointercapture", this.onLost),
      on("pointerleave", this.onLeave),
      on("wheel", this.onWheel, { passive: false }),
      on("contextmenu", this.onContext),
      on("click", this.onClick, true),
      on("dragstart", (e) => {
        if (!(e.target as Element).closest?.("[data-ui]")) e.preventDefault();
      }),
      on("dragenter", this.onDragOver),
      on("dragover", this.onDragOver),
      on("dragleave", this.onDragLeave),
      on("drop", this.onDrop),
      on("gesturestart" as keyof HTMLElementEventMap, prevent),
      on("gesturechange" as keyof HTMLElementEventMap, prevent),
      on("scroll", this.onScroll),
    ];
    return () => {
      offs.forEach((off) => off());
      this.stopAnim();
      clearTimeout(this.pressTimer);
      this.root = null;
    };
  }

  measure() {
    const r = this.root?.getBoundingClientRect();
    this.ox = r?.left ?? 0;
    this.oy = r?.top ?? 0;
  }

  private stopAnim() {
    cancelAnimationFrame(this.autopanRaf);
    cancelAnimationFrame(this.glide.raf);
    cancelAnimationFrame(this.inertiaRaf);
    cancelAnimationFrame(this.hoverRaf);
    this.autopanRaf = this.glide.raf = this.inertiaRaf = this.hoverRaf = 0;
  }

  get z() {
    return this.b.camera.z;
  }

  get busy(): boolean {
    return this.kind !== null && this.kind !== "press" && this.kind !== "point";
  }

  /** Мировая точка под координатами окна. */
  worldAt(cx: number, cy: number): Pt {
    return this.b.camera.toWorld(cx - this.ox, cy - this.oy);
  }

  /** Где появится вставленное: под указателем, если он над доской, иначе в центре экрана. */
  pointerWorld(): Pt {
    return this.hover ?? this.b.camera.center;
  }

  private ptr(e: PointerEvent | MouseEvent): Ptr {
    const sx = e.clientX - this.ox;
    const sy = e.clientY - this.oy;
    const pe = e as PointerEvent;
    const type = pe.pointerType || "mouse";
    return {
      sx,
      sy,
      cx: e.clientX,
      cy: e.clientY,
      w: this.b.camera.toWorld(sx, sy),
      pressure: type === "pen" ? pe.pressure || 0.5 : 0.5,
      type,
      t: performance.now(),
      e: pe,
    };
  }

  setMods(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    this.mods.shift = e.shiftKey;
    this.mods.alt = e.altKey;
    this.mods.ctrl = e.ctrlKey || e.metaKey;
  }

  /** Модификатор нажат/отпущен посреди жеста — пересчитать. */
  refresh() {
    if (this.g && this.last) this.g.move({ ...this.last, w: this.b.camera.toWorld(this.last.sx, this.last.sy), t: performance.now() });
    else if (!this.g) this.updateHover();
  }

  cancelGesture(): boolean {
    if (!this.g) return false;
    const g = this.g;
    this.g = null;
    this.kind = null;
    g.cancel();
    this.primary = -1;
    return true;
  }

  /* ============================== указатель ============================== */

  private onDown = (e: PointerEvent) => {
    const t = e.target as Element;
    if (t.closest("[data-chrome]")) return;
    this.setMods(e);
    this.lastType = e.pointerType;
    this.stopInertia();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === "touch" && this.pointers.size === 2) {
      this.startPinch();
      const [a, c] = [...this.pointers.values()];
      this.multi = a && c ? { t0: performance.now(), n: 2, moved: false, x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, d: Math.hypot(a.x - c.x, a.y - c.y) } : null;
      return;
    }
    if (e.pointerType === "touch" && this.pointers.size === 3 && this.multi) {
      this.multi.n = 3;
      return;
    }
    if (this.g || this.pointers.size > 1) return;
    menu.close();
    hideTip();
    const p = this.ptr(e);
    this.last = p;
    if (this.isLiveUi(t, e)) return;
    const s = this.b.view;
    if (s.editing && !t.closest(`[data-id="${s.editing}"]`)) this.stopEditing();
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae !== document.body && !this.root?.contains(ae)) ae.blur?.();
    else if (ae && ae.closest?.("[data-id]") && !t.closest("[data-ui]")) ae.blur?.();
    e.preventDefault();
    this.primary = e.pointerId;
    try {
      this.root?.setPointerCapture(e.pointerId);
    } catch {
      /* указатель уже ушёл */
    }
    this.down = { x: e.clientX, y: e.clientY, moved: false };
    this.g = this.route(e, t, p);
    this.kind = this.g?.kind ?? null;
    if (this.g && e.pointerType !== "mouse" && (this.g.kind === "press" || this.g.kind === "pan" || this.g.kind === "marquee")) {
      clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => this.longPress(p, t), LONG_PRESS);
    }
  };

  private onMove = (e: PointerEvent) => {
    const known = this.pointers.get(e.pointerId);
    if (known) {
      known.x = e.clientX;
      known.y = e.clientY;
    }
    if (this.g?.kind === "pinch") {
      this.g.move(this.ptr(e));
      const m = this.multi;
      if (m && !m.moved) {
        const [a, c] = [...this.pointers.values()];
        if (a && c && (Math.hypot((a.x + c.x) / 2 - m.x, (a.y + c.y) / 2 - m.y) > 14 || Math.abs(Math.hypot(a.x - c.x, a.y - c.y) - m.d) > 18)) m.moved = true;
      }
      return;
    }
    const p = this.ptr(e);
    if (e.pointerType !== "touch") this.trackHover(p, !this.g && !!(e.target as Element).closest?.("[data-handle^='conn']"));
    if (!this.g || e.pointerId !== this.primary) return;
    this.setMods(e);
    if (this.down && !this.down.moved && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) {
      this.down.moved = true;
      clearTimeout(this.pressTimer);
    }
    this.last = p;
    this.g.move(p);
    if (this.g?.autopan) this.maybeAutopan();
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (e.pointerType === "touch" && this.multi && this.pointers.size === 0) this.multiTap();
    if (this.g?.kind === "pinch") {
      if (this.pointers.size < 2) {
        this.g = null;
        this.kind = null;
      }
      return;
    }
    if (e.pointerId !== this.primary) return;
    this.finish(e, false);
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.multi = null;
    if (this.g?.kind === "pinch") {
      if (this.pointers.size < 2) {
        this.g = null;
        this.kind = null;
      }
      return;
    }
    if (e.pointerId !== this.primary) return;
    this.finish(e, true);
  };

  private onLost = (e: PointerEvent) => {
    if (e.pointerId === this.primary && this.g && this.g.kind !== "pinch") {
      this.pointers.delete(e.pointerId);
      this.finish(e, false);
    }
  };

  private finish(e: PointerEvent, cancel: boolean) {
    clearTimeout(this.pressTimer);
    cancelAnimationFrame(this.autopanRaf);
    this.autopanRaf = 0;
    this.primary = -1;
    const g = this.g;
    this.g = null;
    this.kind = null;
    this.down = null;
    if (!g) return;
    const p = this.ptr(e);
    this.last = p;
    if (cancel) g.cancel();
    else g.up(p);
  }

  /** Браузер сам прокрутил доску (фокус в редактор у края, курсор ушёл за край
      при наборе): прокрутку — в ноль, а сдвиг — камере. Содержимое остаётся
      видно, а экранные координаты не съезжают относительно мира. */
  private onScroll = () => {
    const r = this.root;
    if (!r) return;
    const dx = r.scrollLeft;
    const dy = r.scrollTop;
    if (!dx && !dy) return;
    r.scrollLeft = 0;
    r.scrollTop = 0;
    this.b.camera.pan(-dx, -dy);
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (!this.g) {
      this.hover = null;
      this.hoverNode = null;
      this.anchor = null;
      this.hot = null;
      this.b.setPresence({ pointer: null });
    }
  };

  /** Положение указателя для других людей и подсказки под ним. */
  private trackHover(p: Ptr, onHandle = false) {
    this.hover = p.w;
    this.onHandle = onHandle;
    this.b.setPresence({ pointer: { x: Math.round(p.w.x), y: Math.round(p.w.y) } });
    if (this.g || this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(() => {
      this.hoverRaf = 0;
      if (!this.g) this.updateHover();
    });
  }

  /** «+» у узла под указателем; у инструментов «стрелка» и «линия» — куда сядет начало. */
  updateHover(w: Pt | null = this.hover) {
    const b = this.b;
    const s = b.view;
    const tool = b.spaceDown ? "hand" : b.tool;
    const linking = !b.readonly && (tool === "arrow" || tool === "line");
    if (!w || !linking) {
      if (this.anchor) this.anchor = null;
      if (this.hot && !this.g) this.hot = null;
    }
    if (!w) {
      this.hoverNode = null;
      return;
    }
    if (linking) {
      if (this.hoverNode) this.hoverNode = null;
      this.showSnap(snapEnd(s.order, w, this.z, { exact: this.mods.alt }));
      return;
    }
    let id: string | null = null;
    if (!b.readonly && tool === "select" && !s.editing) {
      const z = this.z;
      const keep = this.hoverNode ? s.get(this.hoverNode) : undefined;
      const under = this.onHandle ? undefined : hitTest(s, w, 2 / z, { frames: "none" });
      const one = s.selection.size === 1 ? s.get(s.selection.list[0]!) : undefined;
      if (under && CONNECTABLE.has(under.type) && !under.locked) id = under.id;
      // «+» у края не пропадает, пока указатель идёт к ней
      else if (keep && !keep.locked && containsPt(s.bounds(keep), w, 50 / z)) id = keep.id;
      // к выделенному можно подойти и снаружи
      else if (one && CONNECTABLE.has(one.type) && !one.locked && containsPt(s.bounds(one), w, 50 / z)) id = one.id;
    }
    if (id !== this.hoverNode) this.hoverNode = id;
  }

  private showSnap(hit: SnapHit | null) {
    const hot = hit && !hit.bind.precise ? hit.node.id : null;
    if (hot !== this.hot) this.hot = hot;
    if (!hit && !this.anchor) return;
    this.anchor = hit ? { id: hit.node.id, dot: hit.dot, side: hit.side, magnets: magnetsOf(hit.node) } : null;
  }

  /** Кнопки, поля и ссылки внутри узлов работают как обычно. */
  private isLiveUi(t: Element, e: PointerEvent): boolean {
    if (e.button !== 0) return false;
    if (t.closest("[data-ui]") || t.closest("input.task")) return true;
    const a = t.closest("a[href]");
    if (a) {
      const id = a.closest<HTMLElement>("[data-id]")?.dataset.id;
      if (id && (this.b.view.selection.has(id) || e.ctrlKey || e.metaKey)) {
        this.linkOk = true;
        return true;
      }
    }
    return false;
  }

  private onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest?.("a[href]");
    if (a && a.closest("[data-id]") && !this.linkOk) e.preventDefault();
    this.linkOk = false;
  };

  /** Что делает нажатие — по инструменту и цели. */
  private route(e: PointerEvent, t: Element, p: Ptr): Gesture | null {
    const b = this.b;
    const tool = b.spaceDown ? "hand" : b.tool;
    if (e.button === 1 || (e.button === 0 && tool === "hand")) return this.panGesture(p, false);
    if (e.button === 2) return this.rightGesture(p);
    if (e.button === 5 || (e.pointerType === "pen" && e.buttons === 32)) return this.eraseGesture(p);
    if (e.button !== 0) return null;
    const handle = t.closest<HTMLElement>("[data-handle]");
    if (handle && !b.readonly) return this.handleGesture(handle.dataset.handle!, p);
    const label = t.closest<HTMLElement>("[data-path-label]");
    if (label && !b.readonly && (tool === "select" || tool === "hand")) {
      const v = b.view.get(label.dataset.pathLabel);
      if (v && !v.locked) return this.labelGesture(v, p);
    }
    if (b.readonly) return tool === "laser" ? this.laserGesture(p) : this.selectRoute(t, p, true);
    switch (tool) {
      case "note":
      case "text":
      case "code":
        return this.tapCreate(tool, p);
      case "shape":
      case "frame":
        return this.dragCreate(tool, p);
      case "arrow":
      case "line":
        return this.connectGesture(p, snapEnd(b.view.order, p.w, this.z, { exact: this.mods.alt }), this.lineProps(tool));
      case "draw":
      case "pen":
        return this.inkGesture(p, tool === "draw");
      case "eraser":
        return this.eraseGesture(p);
      case "laser":
        return this.laserGesture(p);
      default:
        return this.selectRoute(t, p, false);
    }
  }

  /** Узел под указателем: DOM, затем геометрия. */
  nodeAtEvent(t: Element, w: Pt): NodeView | undefined {
    const s = this.b.view;
    const label = t.closest<HTMLElement>("[data-frame-label]");
    if (label) return s.get(label.dataset.frameLabel);
    const el = t.closest<HTMLElement>("[data-id]");
    if (el) return s.get(el.dataset.id);
    const tol = 4 / this.z;
    if (this.b.lod === "far") return hitTest(s, w, tol, { frames: "all" });
    // мелкая рамка (или её подпись) выделяется щелчком внутри
    for (let i = s.order.length - 1; i >= 0; i--) {
      const v = s.order[i]!;
      if (v.type !== "frame") continue;
      if (frameLabelHit(v, w, tol)) return v;
      if (containsPt(v.rect, w) && Math.min(v.w, v.h) * this.z < 140) return v;
    }
    return undefined;
  }

  private selectRoute(t: Element, p: Ptr, readonly: boolean): Gesture | null {
    const v = this.nodeAtEvent(t, p.w);
    if (v) return this.pressNode(v, p, readonly);
    if (p.type === "touch") return this.panGesture(p, true);
    return this.marqueeGesture(p);
  }

  /* ============================== двойной щелчок ============================== */

  private tap(q: Ptr, id: string | null) {
    const now = performance.now();
    const l = this.lastTap;
    const near = Math.hypot(q.cx - l.x, q.cy - l.y) < (q.type === "touch" ? 26 : 8);
    const dbl = now - l.t < 420 && near && l.id === id;
    this.lastTap = dbl ? { t: 0, x: 0, y: 0, id: null } : { t: now, x: q.cx, y: q.cy, id };
    if (dbl) this.onDouble(id, q);
  }

  private onDouble(id: string | null, q: Ptr) {
    const b = this.b;
    const s = b.view;
    if (!id) {
      if (b.tool === "select" && !b.readonly) {
        const nid = place(b, "note", q.w);
        this.edit(nid, "end");
      }
      return;
    }
    if (id.startsWith("pt:")) {
      const [, pid, i] = id.split(":");
      if (!b.readonly && pid) this.removePathPoint(pid, Number(i));
      return;
    }
    if (id.startsWith("elbow:")) {
      const pid = id.slice(6);
      const v = s.get(pid);
      if (!b.readonly && v) {
        const c = s.pathPoints(v);
        if (c.length > 2) s.update(pid, s.pathPatch([c[0]!, c[c.length - 1]!], v.props.b0, v.props.b1));
      }
      return;
    }
    if (id.startsWith("barb:")) {
      const [, pid, end] = id.split(":");
      if (!b.readonly && pid) s.update(pid, end === "0" ? { hb0: undefined } : { hb1: undefined });
      return;
    }
    const v = s.get(id);
    if (!v) return;
    if (TITLED_TYPES.has(v.type)) {
      if (!b.readonly && !v.locked) this.renaming = id;
      return;
    }
    if (WIDGET_EDIT_TYPES.has(v.type)) {
      this.edit(id, "end");
      return;
    }
    switch (v.type) {
      case "note":
      case "text":
      case "shape":
      case "task":
      case "poll":
      case "table":
        this.edit(id, { x: q.cx, y: q.cy });
        break;
      case "sticker":
        if (!b.readonly) stickerMenu(b, [id], { x: q.cx, y: q.cy });
        break;
      case "path":
        // подпись на линии
        this.edit(id, "end");
        break;
      case "code":
        if (v.props.view === "preview" && !b.readonly) s.update(id, { view: "code" });
        this.edit(id, { x: q.cx, y: q.cy });
        break;
      case "frame":
      case "shelf":
        if (!b.readonly) this.renaming = id;
        break;
      case "image":
        b.ui.viewer = id;
        break;
      case "link":
        // страницы, запрещающие встраивание, открываются во вкладке
        if (v.props.embeddable === false && !embedFor(v.props.url ?? "")) {
          if (v.props.url) window.open(v.props.url, "_blank", "noopener");
        } else this.activate(id);
        break;
      case "video":
        this.activate(id);
        break;
      case "file":
        if (v.props.src) window.open(fileUrl(v.props.src, { name: v.props.name }), "_blank", "noopener");
        break;
    }
  }

  /* ============================== редактирование ============================== */

  edit(id: string, at: EditorAt = "end") {
    const s = this.b.view;
    const v = s.get(id);
    if (!v || this.b.readonly || v.locked) return;
    this.editAt = at;
    s.selection.set([id]);
    s.editing = id;
  }

  /** Живой режим без текста: видео, страница по ссылке. Не связан с
      редактированием — продолжает играть, пока его не закроют. */
  activate(id: string) {
    const s = this.b.view;
    s.selection.set([id]);
    if (s.editing && s.editing !== id) this.stopEditing();
    this.b.live.add(id);
  }

  deactivate(id: string) {
    this.b.live.delete(id);
  }

  stopEditing() {
    const s = this.b.view;
    const id = s.editing;
    if (!id) return;
    s.editing = null;
    // курсор ввода не должен остаться мигать в уже закрытом редакторе
    const ae = document.activeElement as HTMLElement | null;
    if (ae?.closest?.(".cm-editor, [contenteditable]")) ae.blur();
    const sel = getSelection();
    if (sel && sel.rangeCount && this.root?.contains(sel.anchorNode)) sel.removeAllRanges();
    const v = s.get(id);
    if (v && v.type === "text" && !v.textValue.trim() && !this.b.readonly) s.remove([id]);
  }

  /* ============================== выделение и перенос ============================== */

  private pressNode(v: NodeView, p: Ptr, readonly: boolean): Gesture {
    const s = this.b.view;
    const sel = s.selection;
    const was = sel.has(v.id);
    const toggle = this.mods.shift || this.mods.ctrl || this.multiSelect;
    if (toggle) {
      if (!was) sel.add([v.id]);
    } else if (!was) sel.set([v.id]);
    let drag: Gesture | null = null;
    const thr = p.type === "touch" ? 8 : 4;
    const self = this;
    return {
      kind: "press",
      get autopan() {
        return !!drag?.autopan;
      },
      move: (q) => {
        if (drag) return drag.move(q);
        if (Math.hypot(q.sx - p.sx, q.sy - p.sy) < thr) return;
        drag = readonly ? this.panGesture(p, false) : this.moveGesture(p, this.mods.alt);
        if (!drag) return;
        self.kind = drag.kind;
        drag.move(q);
      },
      up: (q) => {
        if (drag) return drag.up(q);
        if (toggle && was) sel.remove([v.id]);
        else if (!toggle && was && sel.size > 1) sel.set([v.id]);
        this.tap(q, v.id);
      },
      cancel: () => drag?.cancel(),
    };
  }

  private moveGesture(start: Ptr, alt: boolean): Gesture | null {
    const b = this.b;
    const s = b.view;
    let ids = s.selection.list.filter((id) => {
      const v = s.get(id);
      return v && !v.locked;
    });
    if (!ids.length) return null;
    if (alt) {
      duplicate(b, ids, { x: 0, y: 0 });
      ids = s.selection.list;
    }
    const moving = withChildren(b, ids).filter((id) => !s.get(id)?.locked);
    const movingSet = new Set(moving);
    s.beginTransient(moving);
    // линии, привязанные к тому, что остаётся на месте, отвязываются
    s.transact(() => {
      for (const id of moving) {
        const v = s.get(id);
        if (v?.type !== "path") continue;
        const patch: Partial<NodeData> = {};
        if (v.props.b0 && !movingSet.has(v.props.b0.id)) patch.b0 = null;
        if (v.props.b1 && !movingSet.has(v.props.b1.id)) patch.b1 = null;
        if ("b0" in patch || "b1" in patch) s.update(id, { ...patch, ...s.pathPatchOf(v, "b0" in patch ? null : v.props.b0, "b1" in patch ? null : v.props.b1) });
      }
    });
    const starts = moving.map((id) => {
      const v = s.get(id)!;
      return { v, x: v.x, y: v.y };
    });
    const box0 = s.boundsOfIds(ids) ?? { x: start.w.x, y: start.w.y, w: 0, h: 0 };
    // прилипание: по настройке, Ctrl во время перетаскивания — наоборот
    const snapOn = session.settings.snap;
    const cull = b.camera.cull;
    const others: Rect[] = [];
    for (const v of s.order) {
      if (movingSet.has(v.id) || v.type === "path" || v.type === "ink") continue;
      const r = s.bounds(v);
      if (intersects(r, cull)) others.push(r);
      if (others.length > 600) break;
    }
    const single = ids.length === 1 ? s.get(ids[0]) : undefined;
    const fileDrop = ids.every((id) => {
      const t = s.get(id)?.type;
      return t === "file" || t === "shelf";
    });
    void single;
    let lastFlush = 0;
    const restore = () => {
      for (const st of starts) {
        st.v.x = st.x;
        st.v.y = st.y;
      }
    };
    return {
      kind: "move",
      autopan: true,
      move: (q) => {
        let dx = q.w.x - start.w.x;
        let dy = q.w.y - start.w.y;
        if (this.mods.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let guides: Guide[] = [];
        if (snapOn !== this.mods.ctrl && others.length) {
          const res = snapRect({ x: box0.x + dx, y: box0.y + dy, w: box0.w, h: box0.h }, others, 6 / this.z, {
            x: !this.mods.shift || dx !== 0,
            y: !this.mods.shift || dy !== 0,
          });
          dx += res.dx;
          dy += res.dy;
          guides = res.guides;
        }
        this.guides = guides;
        for (const st of starts) {
          st.v.x = st.x + dx;
          st.v.y = st.y + dy;
        }
        if (fileDrop) {
          const t = s.nodeAt(q.w, (v) => (v.type === "file" || v.type === "shelf") && !movingSet.has(v.id));
          this.hot = t?.id ?? null;
        }
        const f = s.frameAt(q.w, movingSet);
        this.hotFrame = f && !f.locked && ids.some((id) => s.get(id)?.parent !== f.id && s.get(id)?.type !== "frame") ? f.id : null;
        if (q.t - lastFlush > 50) {
          lastFlush = q.t;
          s.flushTransient(moving);
        }
      },
      up: () => {
        this.guides = [];
        const hot = this.hot;
        this.hot = null;
        this.hotFrame = null;
        if (hot && fileDrop) {
          restore();
          s.flushTransient(moving);
          mergeIntoShelf(b, hot, ids);
          s.endTransient(moving);
          return;
        }
        s.flushTransient(moving);
        s.reflowPaths(moving);
        s.reparent(moving);
        s.endTransient(moving);
      },
      cancel: () => {
        this.guides = [];
        this.hot = null;
        this.hotFrame = null;
        restore();
        s.endTransient(moving);
      },
    };
  }

  private marqueeGesture(p: Ptr): Gesture {
    const s = this.b.view;
    const add = this.mods.shift || this.mods.ctrl;
    const base = add ? [...s.selection.ids] : [];
    if (!add) s.selection.clear();
    let moved = false;
    return {
      kind: "marquee",
      autopan: true,
      move: (q) => {
        if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 3) return;
        moved = true;
        const r = fromPoints(p.w, q.w);
        this.marquee = r;
        const hits = nodesInRect(s, r);
        s.selection.set(base.length ? [...base, ...hits] : hits);
      },
      up: (q) => {
        this.marquee = null;
        if (!moved) this.tap(q, null);
      },
      cancel: () => (this.marquee = null),
    };
  }

  private panGesture(p: Ptr, touchTap: boolean): Gesture {
    const cam = this.b.camera;
    let lx = p.sx;
    let ly = p.sy;
    let moved = false;
    const samples: { t: number; x: number; y: number }[] = [];
    this.b.following = null;
    return {
      kind: "pan",
      move: (q) => {
        if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < (q.type === "touch" ? 6 : 2)) return;
        moved = true;
        cam.pan(q.sx - lx, q.sy - ly);
        lx = q.sx;
        ly = q.sy;
        samples.push({ t: q.t, x: q.sx, y: q.sy });
        while (samples.length > 2 && q.t - samples[0]!.t > 90) samples.shift();
      },
      up: (q) => {
        if (!moved) {
          if (touchTap) {
            this.b.view.selection.clear();
            this.multiSelect = false;
            this.tap(q, null);
          }
          return;
        }
        if (q.type === "touch" && samples.length >= 2) {
          const a = samples[0]!;
          const c = samples[samples.length - 1]!;
          const dt = Math.max(1, c.t - a.t);
          if (q.t - c.t < 60) this.inertia((c.x - a.x) / dt, (c.y - a.y) / dt);
        }
      },
      cancel: () => {},
    };
  }

  private inertia(vx: number, vy: number) {
    if (Math.hypot(vx, vy) < 0.25) return;
    const cam = this.b.camera;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(40, t - last);
      last = t;
      cam.pan(vx * dt, vy * dt);
      const k = Math.pow(0.9945, dt);
      vx *= k;
      vy *= k;
      if (Math.hypot(vx, vy) > 0.02) this.inertiaRaf = requestAnimationFrame(step);
      else this.inertiaRaf = 0;
    };
    this.inertiaRaf = requestAnimationFrame(step);
  }

  private stopInertia() {
    cancelAnimationFrame(this.inertiaRaf);
    this.inertiaRaf = 0;
  }

  /** Правая кнопка: тянуть — двигать доску, щёлкнуть — меню. */
  private rightGesture(p: Ptr): Gesture {
    const cam = this.b.camera;
    let lx = p.sx;
    let ly = p.sy;
    let panning = false;
    this.rightPanned = false;
    this.rightDown = true;
    this.pendingMenu = null;
    return {
      kind: "point",
      move: (q) => {
        if (!panning && Math.hypot(q.sx - p.sx, q.sy - p.sy) > 5) {
          panning = true;
          this.rightPanned = true;
          this.b.following = null;
          this.kind = "pan";
          menu.close();
        }
        if (!panning) return;
        cam.pan(q.sx - lx, q.sy - ly);
        lx = q.sx;
        ly = q.sy;
      },
      up: () => {
        this.rightDown = false;
        const m = this.pendingMenu;
        this.pendingMenu = null;
        if (!m) return;
        this.rightPanned = false; // меню этого нажатия уже пришло — следующее не глушить
        if (!panning) this.openContextMenu(m.cx, m.cy, m.el, m.w);
      },
      cancel: () => {
        this.rightDown = false;
        this.pendingMenu = null;
      },
    };
  }

  private startPinch() {
    clearTimeout(this.pressTimer);
    if (this.g) {
      const g = this.g;
      this.g = null;
      if ((g.kind === "move" || g.kind === "resize" || g.kind === "rotate") && this.last) g.up(this.last);
      else g.cancel();
    }
    this.primary = -1;
    const cam = this.b.camera;
    const pair = () => {
      const [a, c] = [...this.pointers.values()];
      if (!a || !c) return null;
      return { x: (a.x + c.x) / 2 - this.ox, y: (a.y + c.y) / 2 - this.oy, d: Math.max(1, Math.hypot(a.x - c.x, a.y - c.y)) };
    };
    const p0 = pair();
    if (!p0) return;
    const w0 = cam.toWorld(p0.x, p0.y);
    const z0 = cam.z;
    this.b.following = null;
    this.g = {
      kind: "pinch",
      move: () => {
        const p = pair();
        if (!p) return;
        const z = clampZoom((z0 * p.d) / p0.d);
        cam.stop();
        cam.set(p.x - w0.x * z, p.y - w0.y * z, z);
      },
      up: () => {},
      cancel: () => {},
    };
    this.kind = "pinch";
  }

  /** Все пальцы сняты: короткое касание двумя — отменить, тремя — вернуть. */
  private multiTap() {
    const m = this.multi;
    this.multi = null;
    if (!m || m.moved || performance.now() - m.t0 > 380 || this.b.readonly) return;
    const u = this.b.store.undo;
    if (m.n === 2 ? !u.canUndo() : !u.canRedo()) return void toasts.show(m.n === 2 ? "Нечего отменять" : "Нечего возвращать", { ms: 1200 });
    if (m.n === 2) u.undo();
    else u.redo();
    navigator.vibrate?.(10);
    toasts.show(m.n === 2 ? "Отменено · два пальца" : "Возвращено · три пальца", { ms: 1200 });
  }

  private longPress(p: Ptr, t: Element) {
    if (!this.g || this.down?.moved) return;
    const g = this.g;
    // пустое место пальцем: подержать и повести — рамка выделения, отпустить — меню
    if (g.kind === "pan" && p.type === "touch" && !t.closest("[data-id]")) {
      g.cancel();
      navigator.vibrate?.(12);
      const mg = this.marqueeGesture(p);
      let moved = false;
      this.g = {
        kind: "marquee",
        autopan: true,
        move: (q) => {
          if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 8) return;
          moved = true;
          mg.move(q);
        },
        up: (q) => {
          if (moved) return mg.up(q);
          mg.cancel();
          this.openContextMenu(p.cx, p.cy, t, p.w);
        },
        cancel: () => mg.cancel(),
      };
      this.kind = "marquee";
      this.pressRing = { x: p.sx, y: p.sy, n: ++this.pressSeq };
      return;
    }
    this.g = null;
    this.kind = null;
    this.primary = -1;
    g.cancel();
    navigator.vibrate?.(8);
    this.openContextMenu(p.cx, p.cy, t, p.w);
  }

  /** Автопрокрутка, пока указатель у края экрана. */
  private maybeAutopan() {
    if (this.autopanRaf) return;
    const tick = () => {
      this.autopanRaf = 0;
      const g = this.g;
      const l = this.last;
      if (!g?.autopan || !l) return;
      const cam = this.b.camera;
      const m = 28;
      let dx = 0;
      let dy = 0;
      if (l.sx < m) dx = m - l.sx;
      else if (l.sx > cam.vw - m) dx = cam.vw - m - l.sx;
      if (l.sy < m) dy = m - l.sy;
      else if (l.sy > cam.vh - m) dy = cam.vh - m - l.sy;
      if (!dx && !dy) return;
      cam.pan(dx * 0.4, dy * 0.4);
      const q = { ...l, w: cam.toWorld(l.sx, l.sy), t: performance.now() };
      this.last = q;
      g.move(q);
      this.autopanRaf = requestAnimationFrame(tick);
    };
    const l = this.last;
    if (!l) return;
    const cam = this.b.camera;
    if (l.sx < 28 || l.sy < 28 || l.sx > cam.vw - 28 || l.sy > cam.vh - 28) this.autopanRaf = requestAnimationFrame(tick);
  }

  /* ============================== ручки ============================== */

  private handleGesture(h: string, p: Ptr): Gesture | null {
    if (h === "rot") return this.rotateGesture(p);
    if (/^(n|s|e|w|ne|nw|se|sw)$/.test(h)) return this.resizeGesture(h as Handle, p);
    const [kind, arg, arg2, arg3, arg4] = h.split(":");
    if (kind === "conn") {
      const src = this.b.view.get(arg2) ?? this.b.view.selected()[0];
      const at = arg3 !== undefined && arg4 !== undefined ? { u: Number(arg3), v: Number(arg4) } : undefined;
      return src ? this.connectorGesture(src, arg as Side, p, at && Number.isFinite(at.u) && Number.isFinite(at.v) ? at : undefined) : null;
    }
    const v = this.b.view.selected()[0];
    if (!v) return null;
    if (kind === "end0") return this.pathPointGesture(v, 0, false, p);
    if (kind === "end1") return this.pathPointGesture(v, -1, false, p);
    if (kind === "pt") return this.pathPointGesture(v, Number(arg), false, p);
    if (kind === "mid") return this.pathPointGesture(v, Number(arg), true, p);
    if (kind === "elbow") return this.elbowGesture(v, p);
    if (kind === "barb") return this.barbGesture(v, arg === "1" ? 1 : 0, arg2 === "1" ? 1 : 0, p);
    return null;
  }

  private resizeGesture(h: Handle, p: Ptr): Gesture | null {
    const views = this.b.view.selected().filter((v) => !v.locked);
    if (!views.length) return null;
    if (views.length === 1 && views[0]!.type !== "path") return this.resizeOne(views[0]!, h);
    return this.resizeGroup(views, h, p);
  }

  private resizeOne(v: NodeView, h: Handle): Gesture {
    const s = this.b.view;
    const r0 = { x: v.x, y: v.y, w: v.w, h: v.H };
    const h0 = v.h;
    const c0 = center(r0);
    const rot = v.r;
    const fit0 = v.fit;
    const aspect = ASPECT_TYPES.has(v.type);
    const corner = h.length === 2;
    const minW = MIN_W[v.type] ?? 16;
    const minH = MIN_H[v.type] ?? 16;
    const hx = h.includes("e") || h.includes("w");
    const hy = h.includes("n") || h.includes("s");
    const before = v.type === "frame" ? { ...r0 } : null;
    s.beginTransient([v.id]);
    let unfit = false;
    let lastFlush = 0;
    return {
      kind: "resize",
      autopan: true,
      move: (q) => {
        const lp = rot ? rotate(q.w, c0, -rot) : q.w;
        const fromCenter = this.mods.alt;
        let x0 = r0.x;
        let y0 = r0.y;
        let x1 = r0.x + r0.w;
        let y1 = r0.y + r0.h;
        if (h.includes("w")) x0 = lp.x;
        if (h.includes("e")) x1 = lp.x;
        if (h.includes("n")) y0 = lp.y;
        if (h.includes("s")) y1 = lp.y;
        if (fromCenter) {
          if (h.includes("w")) x1 = 2 * c0.x - x0;
          if (h.includes("e")) x0 = 2 * c0.x - x1;
          if (h.includes("n")) y1 = 2 * c0.y - y0;
          if (h.includes("s")) y0 = 2 * c0.y - y1;
        }
        let w = hx ? Math.max(minW, x1 - x0) : r0.w;
        let hh = hy ? Math.max(minH, y1 - y0) : r0.h;
        if (corner && aspect !== this.mods.shift) {
          const k = Math.max(w / r0.w, hh / r0.h);
          w = Math.max(minW, r0.w * k);
          hh = w * (r0.h / r0.w);
        }
        let nx: number;
        let ny: number;
        if (fromCenter) {
          nx = c0.x - w / 2;
          ny = c0.y - hh / 2;
        } else {
          nx = h.includes("w") ? r0.x + r0.w - w : r0.x;
          ny = h.includes("n") ? r0.y + r0.h - hh : r0.y;
        }
        const lc = { x: nx + w / 2, y: ny + hh / 2 };
        const wc = rot ? rotate(lc, c0, rot) : lc;
        if (fit0 && hy && !unfit) {
          unfit = true;
          s.update(v.id, { fit: false });
        }
        v.x = wc.x - w / 2;
        v.y = wc.y - hh / 2;
        v.w = w;
        if (!fit0 || unfit) v.h = hh;
        if (q.t - lastFlush > 50) {
          lastFlush = q.t;
          s.flushTransient([v.id], GEO4);
        }
      },
      up: () => {
        s.flushTransient([v.id], GEO4);
        s.reflowPaths([v.id]);
        if (before) {
          const area = expand({ x: Math.min(before.x, v.x), y: Math.min(before.y, v.y), w: Math.max(before.w, v.w) + Math.abs(before.x - v.x), h: Math.max(before.h, v.h) + Math.abs(before.y - v.y) }, 10);
          s.reparent(s.order.filter((n) => n.type !== "frame" && intersects(s.bounds(n), area)).map((n) => n.id));
        }
        s.endTransient([v.id], GEO4);
      },
      cancel: () => {
        v.x = r0.x;
        v.y = r0.y;
        v.w = r0.w;
        v.h = h0;
        if (unfit) s.update(v.id, { fit: true });
        s.endTransient([v.id], GEO4);
      },
    };
  }

  private resizeGroup(views: NodeView[], h: Handle, p: Ptr): Gesture | null {
    void p;
    const s = this.b.view;
    const ids = withChildren(this.b, views.map((v) => v.id)).filter((id) => !s.get(id)?.locked);
    const box0 = s.boundsOfIds(ids);
    if (!box0) return null;
    const starts = ids.map((id) => {
      const v = s.get(id)!;
      return { v, x: v.x, y: v.y, w: v.w, h: v.h, H: v.H, props: v.props, pts: v.type === "path" ? s.pathPoints(v) : null };
    });
    s.beginTransient(ids);
    let lastFlush = 0;
    const apply = (nb: Rect) => {
      const sx = nb.w / Math.max(1, box0.w);
      const sy = nb.h / Math.max(1, box0.h);
      const X = (x: number) => nb.x + (x - box0.x) * sx;
      const Y = (y: number) => nb.y + (y - box0.y) * sy;
      // сначала узлы, потом линии: изломы линий считаются от уже сдвинутых концов
      for (const st of starts) {
        const v = st.v;
        if (st.pts) continue;
        if (ASPECT_TYPES.has(v.type)) {
          const k = Math.min(sx, sy);
          const cx = X(st.x + st.w / 2);
          const cy = Y(st.y + st.H / 2);
          v.w = st.w * k;
          v.h = st.h * k;
          v.x = cx - v.w / 2;
          v.y = cy - v.h / 2;
          continue;
        }
        v.x = X(st.x);
        v.y = Y(st.y);
        v.w = Math.max(MIN_W[v.type] ?? 8, st.w * sx);
        if (!v.fit) v.h = Math.max(8, st.h * sy);
      }
      for (const st of starts) {
        if (!st.pts) continue;
        const v = st.v;
        const pp = s.pathPatch(
          st.pts.map((q) => ({ x: X(q.x), y: Y(q.y) })),
          v.props.b0,
          v.props.b1,
        );
        v.x = pp.x!;
        v.y = pp.y!;
        v.w = pp.w!;
        v.h = pp.h!;
        v.props = { ...v.props, pts: pp.pts, rf: pp.rf };
      }
    };
    return {
      kind: "resize",
      autopan: true,
      move: (q) => {
        let x0 = box0.x;
        let y0 = box0.y;
        let x1 = box0.x + box0.w;
        let y1 = box0.y + box0.h;
        if (h.includes("w")) x0 = Math.min(q.w.x, x1 - 10);
        if (h.includes("e")) x1 = Math.max(q.w.x, x0 + 10);
        if (h.includes("n")) y0 = Math.min(q.w.y, y1 - 10);
        if (h.includes("s")) y1 = Math.max(q.w.y, y0 + 10);
        if (this.mods.shift && h.length === 2) {
          const k = Math.max((x1 - x0) / Math.max(1, box0.w), (y1 - y0) / Math.max(1, box0.h));
          const w = box0.w * k;
          const hh = box0.h * k;
          if (h.includes("w")) x0 = x1 - w;
          else x1 = x0 + w;
          if (h.includes("n")) y0 = y1 - hh;
          else y1 = y0 + hh;
        }
        apply({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        if (q.t - lastFlush > 60) {
          lastFlush = q.t;
          s.flushTransient(ids, GEO4);
        }
      },
      up: () => {
        s.transact(() => {
          for (const st of starts) if (st.pts) s.update(st.v.id, { pts: st.v.props.pts, rf: st.v.props.rf });
        });
        s.flushTransient(ids, GEO4);
        s.reflowPaths(ids);
        s.endTransient(ids, GEO4);
      },
      cancel: () => {
        for (const st of starts) {
          st.v.x = st.x;
          st.v.y = st.y;
          st.v.w = st.w;
          st.v.h = st.h;
          st.v.props = st.props;
        }
        s.endTransient(ids, GEO4);
      },
    };
  }

  private rotateGesture(p: Ptr): Gesture | null {
    const s = this.b.view;
    const sel = s.selected().filter((v) => !v.locked && v.type !== "path" && v.type !== "frame");
    if (sel.length !== 1) return null;
    const v = sel[0]!;
    const c = center(v.rect);
    const a0 = Math.atan2(p.w.y - c.y, p.w.x - c.x);
    const r0 = v.r;
    s.beginTransient([v.id]);
    let lastFlush = 0;
    return {
      kind: "rotate",
      move: (q) => {
        let r = r0 + Math.atan2(q.w.y - c.y, q.w.x - c.x) - a0;
        if (this.mods.shift) r = snapAngle(r, Math.PI / 12);
        else {
          const sn = snapAngle(r, Math.PI / 2);
          if (Math.abs(sn - r) < 0.06) r = sn;
        }
        r = Math.atan2(Math.sin(r), Math.cos(r));
        v.r = Math.abs(r) < 1e-4 ? 0 : r;
        if (q.t - lastFlush > 50) {
          lastFlush = q.t;
          s.flushTransient([v.id], ["r"]);
        }
      },
      up: () => {
        s.flushTransient([v.id], ["r"]);
        s.reflowPaths([v.id]);
        s.endTransient([v.id], ["r"]);
      },
      cancel: () => {
        v.r = r0;
        s.endTransient([v.id], ["r"]);
      },
    };
  }

  /** Конец, излом или середина отрезка линии. */
  private pathPointGesture(v: NodeView, index: number, insert: boolean, p: Ptr): Gesture | null {
    const s = this.b.view;
    if (v.type !== "path" || v.locked) return null;
    const geo = s.connector(v);
    const abs = geo.ctrl.map((q) => ({ ...q }));
    let i = index < 0 ? abs.length - 1 : index;
    if (insert) {
      const a = abs[i];
      const c = abs[i + 1];
      if (!a || !c) return null;
      abs.splice(i + 1, 0, geo.mids[i] ?? { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
      i += 1;
    }
    if (!abs[i]) return null;
    const isEnd = i === 0 || i === abs.length - 1;
    let b0 = v.props.b0 ?? null;
    let b1 = v.props.b1 ?? null;
    const props0 = v.props;
    const geo0 = { x: v.x, y: v.y, w: v.w, h: v.h };
    s.beginTransient([v.id]);
    const apply = () => {
      const pp = s.pathPatch(abs, b0, b1);
      v.x = pp.x!;
      v.y = pp.y!;
      v.w = pp.w!;
      v.h = pp.h!;
      v.props = { ...v.props, pts: pp.pts, rf: pp.rf, b0, b1 };
    };
    if (insert) apply();
    let moved = false;
    const id = v.id;
    const done = () => {
      this.hot = null;
      this.anchor = null;
    };
    return {
      kind: "point",
      autopan: true,
      move: (q) => {
        if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 2) return;
        moved = true;
        let w = q.w;
        const nb = abs[i === 0 ? 1 : i - 1];
        if (this.mods.shift && nb) {
          const a = snapAngle(Math.atan2(w.y - nb.y, w.x - nb.x));
          const l = dist(nb, w);
          w = { x: nb.x + Math.cos(a) * l, y: nb.y + Math.sin(a) * l };
        }
        if (isEnd) {
          const other = i === 0 ? b1 : b0;
          const hit = snapEnd(s.order, w, this.z, { exclude: other?.id, exact: this.mods.alt });
          if (i === 0) b0 = hit?.bind ?? null;
          else b1 = hit?.bind ?? null;
          this.showSnap(hit);
          if (hit?.dot) w = hit.dot;
        }
        abs[i] = w;
        apply();
      },
      up: (q) => {
        done();
        if (!moved && !insert) {
          s.endTransient([id], GEO4);
          this.tap(q, `pt:${id}:${i}`);
          return;
        }
        s.update(id, { ...s.pathPatch(s.resolve(abs, b0, b1, v.props), b0, b1), b0, b1 });
        s.endTransient([id], GEO4);
      },
      cancel: () => {
        done();
        v.props = props0;
        v.x = geo0.x;
        v.y = geo0.y;
        v.w = geo0.w;
        v.h = geo0.h;
        s.endTransient([id], GEO4);
      },
    };
  }

  /** Среднее колено ломаной: тянется поперёк себя. */
  private elbowGesture(v: NodeView, p: Ptr): Gesture | null {
    const s = this.b.view;
    if (v.type !== "path" || v.locked) return null;
    const geo = s.connector(v);
    const el = geo.elbow;
    if (!el) return null;
    const c0 = geo.ctrl[0]!;
    const c1 = geo.ctrl[geo.ctrl.length - 1]!;
    const b0 = v.props.b0 ?? null;
    const b1 = v.props.b1 ?? null;
    const props0 = v.props;
    const geo0 = { x: v.x, y: v.y, w: v.w, h: v.h };
    const id = v.id;
    // колено хранится отрезком [m1, m2]: так понятно, какая координата закреплена
    let m1 = el.a;
    let m2 = el.b;
    let moved = false;
    s.beginTransient([id]);
    const restore = () => {
      v.props = props0;
      v.x = geo0.x;
      v.y = geo0.y;
      v.w = geo0.w;
      v.h = geo0.h;
    };
    return {
      kind: "point",
      autopan: true,
      move: (q) => {
        if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 2) return;
        moved = true;
        const dx = el.axis === "x" ? q.w.x - p.w.x : 0;
        const dy = el.axis === "y" ? q.w.y - p.w.y : 0;
        m1 = { x: el.a.x + dx, y: el.a.y + dy };
        m2 = { x: el.b.x + dx, y: el.b.y + dy };
        const pp = s.pathPatch([c0, m1, m2, c1], b0, b1);
        v.x = pp.x!;
        v.y = pp.y!;
        v.w = pp.w!;
        v.h = pp.h!;
        v.props = { ...v.props, pts: pp.pts, rf: pp.rf };
      },
      up: (q) => {
        if (!moved) {
          s.endTransient([id], GEO4);
          this.tap(q, `elbow:${id}`);
          return;
        }
        const patch = s.pathPatch([c0, m1, m2, c1], b0, b1);
        restore();
        s.update(id, patch);
        s.endTransient([id], GEO4);
      },
      cancel: () => {
        restore();
        s.endTransient([id], GEO4);
      },
    };
  }

  /** «Ус» наконечника: длина и угол. Обычно оба симметрично, с Alt — один. */
  private barbGesture(v: NodeView, end: 0 | 1, i: 0 | 1, p: Ptr): Gesture | null {
    const s = this.b.view;
    if (v.type !== "path" || v.locked) return null;
    const h = s.connector(v).heads[end];
    if (!h || !BARBED.has(h.head)) return null;
    const key = end ? "hb1" : "hb0";
    const own = v.props[key];
    const cur = (own && own.length === 4 ? own : DEFAULT_BARBS[h.head]!).slice();
    const props0 = v.props;
    const heading = Math.atan2(h.t.y, h.t.x);
    let moved = false;
    return {
      kind: "point",
      move: (q) => {
        if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 2) return;
        moved = true;
        const rx = q.w.x - h.tip.x;
        const ry = q.w.y - h.tip.y;
        const len = Math.max(0.25, Math.min(5, Math.hypot(rx, ry) / h.len));
        let ang = Math.atan2(ry, rx) - heading;
        ang = Math.atan2(Math.sin(ang), Math.cos(ang));
        cur[i * 2] = round2(len);
        cur[i * 2 + 1] = round2(ang);
        if (!this.mods.alt) {
          cur[(1 - i) * 2] = cur[i * 2]!;
          cur[(1 - i) * 2 + 1] = -cur[i * 2 + 1]!;
        }
        v.props = { ...props0, [key]: cur.slice() };
      },
      up: (q) => {
        if (!moved) {
          this.tap(q, `barb:${v.id}:${end}`);
          return;
        }
        const val = cur.slice();
        v.props = props0;
        s.update(v.id, { [key]: val });
      },
      cancel: () => {
        v.props = props0;
      },
    };
  }

  /** Подпись линии: тянуть — сдвинуть вдоль неё, двойной щелчок — править. */
  private labelGesture(v: NodeView, p: Ptr): Gesture {
    const s = this.b.view;
    if (!s.selection.has(v.id)) s.selection.set([v.id]);
    const props0 = v.props;
    const track = s.pathTrack(v);
    let moved = false;
    return {
      kind: "point",
      move: (q) => {
        if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 4) return;
        moved = true;
        v.props = { ...props0, lt: Math.round(fractionAt(track, q.w) * 1000) / 1000 };
      },
      up: (q) => {
        if (!moved) return this.tap(q, v.id);
        const lt = v.props.lt;
        v.props = props0;
        s.update(v.id, { lt: lt === undefined || Math.abs(lt - 0.5) < 0.01 ? undefined : lt });
      },
      cancel: () => {
        v.props = props0;
      },
    };
  }

  /** Двойной щелчок по излому убирает его. */
  removePathPoint(id: string, i: number) {
    const s = this.b.view;
    const v = s.get(id);
    if (!v || v.type !== "path") return;
    const abs = s.pathPoints(v).slice();
    if (abs.length <= 2 || i <= 0 || i >= abs.length - 1) return;
    abs.splice(i, 1);
    s.update(id, s.pathPatch(abs, v.props.b0, v.props.b1));
  }

  /* ============================== линии и связи ============================== */

  /** Стиль новой линии для инструмента. */
  lineProps(tool: "arrow" | "line"): NodeProps {
    const st = this.b.style;
    if (tool === "line") return { head0: "none", head1: "none", route: "straight", stroke: st.stroke, dash: st.dash, color: st.color };
    return { head0: st.head0, head1: st.head1 === "none" ? "arrow" : st.head1, route: st.route, hs: st.hs === "m" ? undefined : st.hs, stroke: st.stroke, dash: st.dash, color: st.color };
  }

  /** «+» у узла: тянуть — стрелка от этой стороны, щёлкнуть — связанный узел рядом. */
  /** «+» у края: щелчок — связанный объект, перетаскивание — стрелка из точки края
      (at — доли рамки; без него или у середины стороны — из «магнита»). */
  private connectorGesture(src: NodeView, side: Side, p: Ptr, at?: { u: number; v: number }): Gesture {
    let drag: Gesture | null = null;
    const self = this;
    return {
      kind: "press",
      get autopan() {
        return !!drag;
      },
      move: (q) => {
        if (drag) return drag.move(q);
        if (Math.hypot(q.sx - p.sx, q.sy - p.sy) < 4) return;
        const mid = !at || Math.abs((side === "e" || side === "w" ? at.v : at.u) - 0.5) < 0.002;
        const m = mid
          ? (magnetsOf(src).find((x) => x.side === side) ?? { side, p: center(src.rect) })
          : { side, p: nearestOnOutline(outlineOf(src), uvPoint(src, at.u, at.v)).p };
        const uv = mid ? uvOf(src, m.p) : at;
        const start: SnapHit = { node: src, bind: { id: src.id, u: uv.u, v: uv.v, precise: true, edge: true }, dot: m.p, side };
        drag = this.connectGesture({ ...p, w: m.p }, start, this.lineProps("arrow"), { offer: true });
        self.kind = "connect";
        drag.move(q);
      },
      up: (q) => {
        if (drag) return drag.up(q);
        this.quickCreate(src, side);
      },
      cancel: () => drag?.cancel(),
    };
  }

  /** Связанный узел рядом с исходным: «+», Tab, Alt+стрелка. Занятое место обходится. */
  quickCreate(src: NodeView, side: Side): string | null {
    const b = this.b;
    const s = b.view;
    if (b.readonly) return null;
    const sr = s.bounds(src);
    const data = linkedData(b, src);
    const w = data.w;
    const h = data.h;
    const dir = SIDE_N[side];
    const gap = 76;
    const c = center(sr);
    const base = { x: c.x + dir.x * (sr.w / 2 + gap + w / 2), y: c.y + dir.y * (sr.h / 2 + gap + h / 2) };
    // по оси стороны, затем поочерёдно по обе стороны от неё
    const step = dir.x ? h + 32 : w + 32;
    let at = base;
    for (let k = 0; k < 14; k++) {
      const off = k === 0 ? 0 : Math.ceil(k / 2) * step * (k % 2 ? 1 : -1);
      const cand = dir.x ? { x: base.x, y: base.y + off } : { x: base.x + off, y: base.y };
      const r = { x: cand.x - w / 2, y: cand.y - h / 2, w, h };
      at = cand;
      const busy = s.order.some((v) => v.type !== "frame" && v.type !== "path" && v.type !== "ink" && v.id !== src.id && intersects(expand(r, 16), s.bounds(v)));
      if (!busy) break;
    }
    let id = "";
    const props = this.lineProps("arrow");
    s.transact(() => {
      id = s.create({ ...data, x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), parent: src.parent });
      const b0: Binding = { id: src.id, u: 0.5, v: 0.5, precise: false };
      const b1: Binding = { id, u: 0.5, v: 0.5, precise: false };
      const pts = s.resolve([c, at], b0, b1, props);
      s.create({ type: "path", ...s.pathPatch(pts, b0, b1), ...props, b0, b1 } as NodeData);
    });
    b.camera.reveal({ x: at.x - w / 2, y: at.y - h / 2, w, h });
    if (TEXT_TYPES.has(data.type)) this.edit(id, "end");
    else s.selection.set([id]);
    return id;
  }

  /** Линия от точки (или узла) к точке (или узлу). */
  private connectGesture(p: Ptr, start: SnapHit | null, props: NodeProps, opts: { offer?: boolean } = {}): Gesture {
    const b = this.b;
    const s = b.view;
    const b0: Binding | null = start?.bind ?? null;
    const p0 = start?.dot ?? p.w;
    const startId = start?.node.id;
    let b1: Binding | null = null;
    let end = p0;
    let moved = false;
    const clear = () => {
      this.create = null;
      this.hot = null;
      this.anchor = null;
    };
    return {
      kind: "connect",
      autopan: true,
      move: (q) => {
        if (!moved && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 3) return;
        moved = true;
        let w = q.w;
        if (this.mods.shift) {
          const a = snapAngle(Math.atan2(w.y - p0.y, w.x - p0.x));
          const l = dist(p0, w);
          w = { x: p0.x + Math.cos(a) * l, y: p0.y + Math.sin(a) * l };
        }
        const hit = snapEnd(s.order, w, this.z, { exclude: startId, exact: this.mods.alt });
        b1 = hit?.bind ?? null;
        end = hit?.dot ?? w;
        this.showSnap(hit);
        this.create = { kind: "line", pts: [p0, end], b0, b1, props };
      },
      up: (q) => {
        clear();
        if (!moved || (dist(p0, end) * this.z < 10 && !b1)) return;
        const pts = s.resolve([p0, end], b0, b1, props);
        const id = s.create({ type: "path", ...s.pathPatch(pts, b0, b1), ...props, b0, b1 } as NodeData);
        this.recentLines.push({ id, t: Date.now() });
        s.selection.set([id]);
        b.doneCreating();
        if (!b1 && start && opts.offer) this.offerEnd(id, start.node, q);
      },
      cancel: clear,
    };
  }

  /** Стрелку отпустили в пустоте: что поставить на её конце. */
  private offerEnd(pathId: string, src: NodeView, q: Ptr) {
    const b = this.b;
    const s = b.view;
    menu.at(
      { clientX: q.cx, clientY: q.cy },
      linkEndMenu(src, (data) => {
        const path = s.get(pathId);
        if (!path) return;
        const geo = s.connector(path);
        const tip = geo.ctrl[geo.ctrl.length - 1]!;
        const t = geo.heads[1]?.t ?? (geo.track.length > 1 ? norm(geo.track[geo.track.length - 1]!, geo.track[geo.track.length - 2]!) : { x: 1, y: 0 });
        const full = data === "same" ? linkedData(b, src) : { color: b.style.color, ...data };
        const w = full.w;
        const h = full.h;
        const horiz = Math.abs(t.x) >= Math.abs(t.y);
        const cx = horiz ? tip.x + Math.sign(t.x || 1) * (w / 2 + 6) : tip.x;
        const cy = horiz ? tip.y : tip.y + Math.sign(t.y || 1) * (h / 2 + 6);
        let id = "";
        s.transact(() => {
          id = s.create({ ...full, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), parent: src.parent });
          const b1: Binding = { id, u: 0.5, v: 0.5, precise: false };
          const b0 = path.props.b0 ?? null;
          s.update(pathId, { ...s.pathPatch(s.resolve([geo.ctrl[0]!, { x: cx, y: cy }], b0, b1, path.props), b0, b1), b1 });
        });
        if (TEXT_TYPES.has(full.type)) this.edit(id, "end");
        else s.selection.set([id]);
      }),
    );
  }

  /* ============================== создание ============================== */

  private tapCreate(tool: "note" | "text" | "code", p: Ptr): Gesture {
    return {
      kind: "create",
      move: () => {},
      up: () => {
        const b = this.b;
        let at = p.w;
        if (tool === "text") at = { x: p.w.x + (defaults("text").w ?? 320) / 2 - 6, y: p.w.y };
        const id = place(b, tool, at);
        this.edit(id, "end");
        b.doneCreating();
      },
      cancel: () => {},
    };
  }

  private dragCreate(tool: "shape" | "frame", p: Ptr): Gesture {
    const b = this.b;
    let r: Rect | null = null;
    return {
      kind: "create",
      autopan: true,
      move: (q) => {
        if (!r && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 4) return;
        let w = q.w.x - p.w.x;
        let h = q.w.y - p.w.y;
        if (this.mods.shift) {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * m;
          h = Math.sign(h || 1) * m;
        }
        r = this.mods.alt
          ? { x: p.w.x - Math.abs(w), y: p.w.y - Math.abs(h), w: Math.abs(w) * 2, h: Math.abs(h) * 2 }
          : fromPoints(p.w, { x: p.w.x + w, y: p.w.y + h });
        this.create = tool === "frame" ? { kind: "frame", rect: r } : { kind: "shape", shape: b.shapeKind, rect: r };
      },
      up: () => {
        this.create = null;
        const s = b.view;
        let rect = r;
        if (!rect || rect.w * this.z < 6 || rect.h * this.z < 6) {
          const d = defaults(tool);
          rect = { x: p.w.x - d.w! / 2, y: p.w.y - d.h! / 2, w: d.w!, h: d.h! };
        }
        const R = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(Math.max(8, rect.w)), h: Math.round(Math.max(8, rect.h)) };
        let id = "";
        s.transact(() => {
          if (tool === "frame") {
            id = s.create({ type: "frame", ...R, name: frameName(b) });
            for (const v of s.order) {
              if (v.id === id || v.type === "frame") continue;
              const vb = s.bounds(v);
              if (vb.x >= R.x && vb.y >= R.y && vb.x + vb.w <= R.x + R.w && vb.y + vb.h <= R.y + R.h) s.update(v.id, { parent: id });
            }
          } else {
            id = s.create({ type: "shape", ...R, kind: b.shapeKind, fill: b.style.fill, stroke: b.style.stroke, dash: b.style.dash, color: b.style.color });
            s.reparent([id]);
          }
        });
        s.selection.set([id]);
        b.doneCreating();
      },
      cancel: () => (this.create = null),
    };
  }

  /* ============================== рисование ============================== */

  private inkGesture(p: Ptr, smart: boolean): Gesture {
    const b = this.b;
    const draft: InkDraft = { pts: [round1(p.w.x), round1(p.w.y), round2(p.pressure)], color: b.style.color, size: b.style.stroke, smart };
    this.ink = draft;
    this.inkRev++;
    let lastSend = 0;
    const push = (x: number, y: number, pr: number) => {
      const n = draft.pts.length;
      if (Math.hypot(x - draft.pts[n - 3]!, y - draft.pts[n - 2]!) * this.z < 1.2) return;
      draft.pts.push(round1(x), round1(y), round2(pr));
    };
    return {
      kind: "ink",
      move: (q) => {
        const evs = q.e?.getCoalescedEvents?.() ?? [];
        if (evs.length > 1) {
          for (const ev of evs) {
            const w = b.camera.toWorld(ev.clientX - this.ox, ev.clientY - this.oy);
            push(w.x, w.y, ev.pointerType === "pen" ? ev.pressure || 0.5 : 0.5);
          }
        } else push(q.w.x, q.w.y, q.pressure);
        this.inkRev++;
        if (q.t - lastSend > 45) {
          lastSend = q.t;
          b.setPresence({ stroke: { pts: draft.pts.slice(-900), color: draft.color, size: draft.size } });
        }
      },
      up: () => this.finishInk(),
      cancel: () => {
        this.ink = null;
        this.inkRev++;
        b.setPresence({ stroke: null });
      },
    };
  }

  private finishInk() {
    const b = this.b;
    const s = b.view;
    const draft = this.ink;
    this.ink = null;
    this.inkRev++;
    b.setPresence({ stroke: null });
    if (!draft || b.readonly) return;
    const raw: InkPt[] = [];
    for (let i = 0; i + 2 < draft.pts.length; i += 3) raw.push({ x: draft.pts[i]!, y: draft.pts[i + 1]!, p: draft.pts[i + 2]! });
    if (!raw.length) return;
    const pts = raw.length > 6 ? (simplify(raw, 0.3 / this.z) as InkPt[]) : raw;
    const box = expand(boundsOf(pts), inkPx(draft.size) / 2);
    const w = Math.max(1, round1(box.w));
    const h = Math.max(1, round1(box.h));
    const local = pts.map((q) => [round1(q.x - box.x), round1(q.y - box.y), round2(q.p)]);
    s.undo.stopCapturing();
    const id = s.create({ type: "ink", x: round1(box.x), y: round1(box.y), w, h, ow: w, oh: h, pts: local, color: draft.color, stroke: draft.size });
    s.reparent([id]);
    if (draft.smart && session.settings.smartDraw) this.smartReplace(id, raw);
  }

  /**
   * Умное рисование: штрих уже лёг на доску, распознанная фигура заменяет
   * его отдельной правкой — Ctrl+Z вернёт штрих «как нарисовано».
   */
  private smartReplace(inkId: string, raw: InkPt[]) {
    const b = this.b;
    const s = b.view;
    const z = this.z;
    const st = b.style;
    const pts: Pt[] = raw.map((q) => ({ x: q.x, y: q.y }));
    const rec = recognize(pts, z);
    let made: string | null = null;
    const replace = (fn: () => string | null) => {
      s.undo.stopCapturing();
      s.transact(() => {
        made = fn();
        if (made) s.remove([inkId]);
      });
      s.undo.stopCapturing();
    };
    if (rec?.kind === "line") {
      replace(() => this.createLine(rec.a, rec.b, rec.head0 ? "arrow" : "none", rec.head1 ? "arrow" : "none"));
    } else if (rec?.kind === "shape") {
      const r = rec.rect;
      replace(() => {
        const id = s.create({
          type: "shape",
          kind: rec.shape,
          x: round1(r.x),
          y: round1(r.y),
          w: Math.max(8, round1(r.w)),
          h: Math.max(8, round1(r.h)),
          r: rec.r || 0,
          pts: rec.pts,
          color: st.color,
          fill: st.fill,
          stroke: st.stroke,
          dash: st.dash,
        });
        s.reparent([id]);
        return id;
      });
    } else if (rec?.kind === "chevron") {
      const hit = this.lineEndNear(rec.apex, rec.dir, Math.max(30 / z, rec.size * 1.2));
      if (hit) {
        replace(() => {
          s.update(hit.id, hit.end === 0 ? { head0: "arrow" } : { head1: "arrow" });
          return hit.id;
        });
      }
    } else if (!rec && pts.length > 3) {
      // кривая от карточки к карточке — связь
      const a = snapEnd(s.order, pts[0]!, z)?.node;
      const c = snapEnd(s.order, pts[pts.length - 1]!, z, { exclude: a?.id })?.node;
      if (a && c && a.id !== c.id && a.type !== "frame" && c.type !== "frame") {
        let simp = simplify(pts, 9 / z);
        if (simp.length > 9) simp = simplify(pts, 18 / z);
        const mid = simp.slice(1, -1).filter((q) => !insideNode(a, q, 4 / z) && !insideNode(c, q, 4 / z));
        simp = [simp[0]!, ...mid, simp[simp.length - 1]!];
        replace(() => {
          const b0: Binding = { id: a.id, u: 0.5, v: 0.5, precise: false };
          const b1: Binding = { id: c.id, u: 0.5, v: 0.5, precise: false };
          const props: NodeProps = { ...this.lineProps("arrow"), route: simp.length > 2 ? "curve" : st.route };
          return s.create({ type: "path", ...s.pathPatch(s.resolve(simp, b0, b1, props), b0, b1), ...props, b0, b1 } as NodeData);
        });
      }
    }
    if (made) this.hintSmart();
  }

  private hintSmart() {
    const key = "space:smart-hint";
    const n = Number(localStorage.getItem(key) || 0);
    if (n >= 3) return;
    localStorage.setItem(key, String(n + 1));
    toasts.show("Штрих распознан. Ctrl+Z — вернуть как нарисовано", { ms: 3800 });
  }

  private createLine(a: Pt, c: Pt, head0: Head, head1: Head): string {
    const b = this.b;
    const s = b.view;
    const z = this.z * 0.7;
    let h0 = snapEnd(s.order, a, z);
    let h1 = snapEnd(s.order, c, z, { exclude: h0?.node.id });
    if (h0?.node.type === "frame") h0 = null;
    if (h1?.node.type === "frame") h1 = null;
    const b0: Binding | null = h0 ? h0.bind : null;
    const b1: Binding | null = h1 ? h1.bind : null;
    const props: NodeProps = { ...this.lineProps("arrow"), head0, head1, route: b0 && b1 ? b.style.route : "straight" };
    const id = s.create({ type: "path", ...s.pathPatch(s.resolve([h0?.dot ?? a, h1?.dot ?? c], b0, b1, props), b0, b1), ...props, b0, b1 } as NodeData);
    this.recentLines.push({ id, t: Date.now() });
    if (this.recentLines.length > 20) this.recentLines.shift();
    return id;
  }

  /** Конец линии рядом с «галочкой», смотрящей вдоль линии. */
  private lineEndNear(apex: Pt, dir: Pt, tol: number): { id: string; end: 0 | 1 } | null {
    const s = this.b.view;
    const now = Date.now();
    this.recentLines = this.recentLines.filter((l) => now - l.t < 120_000 && s.get(l.id));
    const view = this.b.camera.view;
    const seen = new Set<string>();
    const list: NodeView[] = [];
    for (const l of [...this.recentLines].reverse()) {
      const v = s.get(l.id);
      if (v && !seen.has(v.id)) {
        seen.add(v.id);
        list.push(v);
      }
    }
    for (const v of s.order) if (v.type === "path" && !seen.has(v.id) && intersects(s.bounds(v), view)) list.push(v);
    let best: { id: string; end: 0 | 1; d: number } | null = null;
    for (const v of list) {
      if (v.type !== "path" || v.locked) continue;
      const pts = s.pathTrack(v);
      if (pts.length < 2) continue;
      for (const end of [0, 1] as const) {
        const tip = end ? pts[pts.length - 1]! : pts[0]!;
        const d = dist(tip, apex);
        if (d > tol) continue;
        const t = end ? norm(tip, pts[pts.length - 2]!) : norm(tip, pts[1]!);
        if (t.x * dir.x + t.y * dir.y < 0.3) continue;
        if (!best || d < best.d) best = { id: v.id, end, d };
      }
    }
    return best;
  }

  private eraseGesture(p: Ptr): Gesture {
    const s = this.b.view;
    const hits = new Set<string>();
    let last = p.w;
    eraseHits(s, last, last, 7 / this.z, hits);
    this.erasing = new Set(hits);
    return {
      kind: "erase",
      move: (q) => {
        eraseHits(s, last, q.w, 7 / this.z, hits);
        last = q.w;
        if (hits.size !== this.erasing.size) this.erasing = new Set(hits);
      },
      up: () => {
        this.erasing = new Set();
        if (hits.size && !this.b.readonly) s.remove([...hits]);
      },
      cancel: () => (this.erasing = new Set()),
    };
  }

  private laserGesture(p: Ptr): Gesture {
    const b = this.b;
    const trail: { x: number; y: number; t: number }[] = [{ x: p.w.x, y: p.w.y, t: p.t }];
    let active = true;
    const tick = () => {
      const now = performance.now();
      while (trail.length && now - trail[0]!.t > 650) trail.shift();
      this.laser = trail.map((q) => ({ x: q.x, y: q.y }));
      b.setPresence({ laser: trail.slice(-40).flatMap((q) => [Math.round(q.x), Math.round(q.y)]) });
      if (trail.length || active) requestAnimationFrame(tick);
      else {
        this.laser = [];
        b.setPresence({ laser: [] });
      }
    };
    requestAnimationFrame(tick);
    return {
      kind: "laser",
      move: (q) => {
        trail.push({ x: q.w.x, y: q.w.y, t: q.t });
      },
      up: () => (active = false),
      cancel: () => (active = false),
    };
  }

  /* ============================== колесо ============================== */

  private onWheel = (e: WheelEvent) => {
    const t = e.target as Element;
    if (t.closest("[data-chrome]")) return;
    const s = this.b.view;
    // прокручиваемое содержимое выбранного узла крутится само
    const sc = t.closest<HTMLElement>("[data-scroll]");
    if (sc && !e.ctrlKey && !e.metaKey) {
      const id = sc.closest<HTMLElement>("[data-id]")?.dataset.id;
      const room = sc.scrollHeight - sc.clientHeight;
      const roomX = sc.scrollWidth - sc.clientWidth;
      const canY = room > 2 && ((e.deltaY < 0 && sc.scrollTop > 0) || (e.deltaY > 0 && sc.scrollTop < room - 1));
      const canX = roomX > 2 && ((e.deltaX < 0 && sc.scrollLeft > 0) || (e.deltaX > 0 && sc.scrollLeft < roomX - 1));
      if (id && (s.selection.has(id) || s.editing === id) && (canY || canX)) return;
    }
    e.preventDefault();
    this.stopInertia();
    this.b.following = null;
    const sx = e.clientX - this.ox;
    const sy = e.clientY - this.oy;
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 33;
      dy *= 33;
    } else if (e.deltaMode === 2) {
      dx *= this.b.camera.vw;
      dy *= this.b.camera.vh;
    }
    const mode = session.settings.wheel;
    const mouse = this.isMouseWheel(e);
    const zoom = e.ctrlKey || e.metaKey || (!e.shiftKey && (mode === "zoom" || (mode === "auto" && mouse)));
    const cam = this.b.camera;
    if (zoom) {
      if (mouse || Math.abs(dy) >= 40) this.glideZoom(sx, sy, Math.exp(-Math.max(-160, Math.min(160, dy)) * 0.0024));
      else cam.zoomAt(sx, sy, Math.exp(-Math.max(-50, Math.min(50, dy)) * 0.011));
    } else {
      if (e.shiftKey && !dx) {
        dx = dy;
        dy = 0;
      }
      cam.pan(-dx, -dy);
    }
  };

  /** Мышь крутит рывками по 100 (или строками), тачпад — мелко и по двум осям. */
  private isMouseWheel(e: WheelEvent): boolean {
    if (e.deltaMode !== 0) return true;
    const now = performance.now();
    if (e.deltaX !== 0 && !e.shiftKey) {
      this.lastTrackpad = now;
      return false;
    }
    if (now - this.lastTrackpad < 500) return false;
    const ay = Math.abs(e.deltaY);
    if (!Number.isInteger(e.deltaY) && !Number.isInteger(e.deltaY * devicePixelRatio)) {
      this.lastTrackpad = now;
      return false;
    }
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    if (typeof legacy === "number" && legacy !== 0 && Math.abs(legacy) % 120 === 0 && ay >= 50) return true;
    return ay >= 50;
  }

  /** Плавный масштаб колесом мыши: копим цель и подъезжаем к ней. */
  private glideZoom(sx: number, sy: number, factor: number) {
    const g = this.glide;
    const cam = this.b.camera;
    if (!g.raf) g.z = cam.z;
    g.z = clampZoom(g.z * factor);
    g.sx = sx;
    g.sy = sy;
    if (session.settings.reduceMotion) {
      cam.zoomAt(sx, sy, g.z / cam.z);
      return;
    }
    if (g.raf) return;
    const step = () => {
      const lz = Math.log(cam.z);
      const lt = Math.log(g.z);
      if (Math.abs(lt - lz) < 0.003) {
        cam.zoomAt(g.sx, g.sy, g.z / cam.z);
        g.raf = 0;
        return;
      }
      const next = Math.exp(lz + (lt - lz) * 0.3);
      cam.zoomAt(g.sx, g.sy, next / cam.z);
      g.raf = requestAnimationFrame(step);
    };
    g.raf = requestAnimationFrame(step);
  }

  /* ============================== меню ============================== */

  private onContext = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t.closest("[data-chrome]")) return;
    if (t.closest(".cm-editor, input, textarea, [contenteditable='true']")) return;
    e.preventDefault();
    if (this.rightPanned) {
      this.rightPanned = false;
      return;
    }
    if (this.lastType === "touch") return;
    // при захвате указателя событие приходит на корень — ищем настоящую цель
    const el = document.elementFromPoint(e.clientX, e.clientY) ?? t;
    const w = this.b.camera.toWorld(e.clientX - this.ox, e.clientY - this.oy);
    if (this.rightDown) {
      // Linux и macOS: кнопка ещё зажата — может, это прокрутка правой кнопкой
      this.pendingMenu = { cx: e.clientX, cy: e.clientY, el, w };
      return;
    }
    this.openContextMenu(e.clientX, e.clientY, el, w);
  };

  openContextMenu(cx: number, cy: number, t: Element, w: Pt) {
    const b = this.b;
    const s = b.view;
    const v = this.nodeAtEvent(t, w);
    if (v) {
      if (!s.selection.has(v.id)) s.selection.set([v.id]);
      menu.show({ x: cx, y: cy, items: nodeMenu(b, this) });
    } else {
      menu.show({ x: cx, y: cy, items: canvasMenu(b, this, w) });
    }
  }

  /* ============================== перетаскивание файлов ============================== */

  private onDragOver = (e: DragEvent) => {
    const dt = e.dataTransfer;
    if (!dt || this.b.readonly) return;
    const types = [...dt.types];
    // элемент из библиотеки: без «зоны сброса», только точка вставки
    if (types.includes(LIB_MIME)) {
      e.preventDefault();
      dt.dropEffect = "copy";
      this.hover = this.b.camera.toWorld(e.clientX - this.ox, e.clientY - this.oy);
      return;
    }
    if (!types.includes("Files") && !types.includes("text/uri-list") && !types.includes("text/plain")) return;
    e.preventDefault();
    dt.dropEffect = "copy";
    this.dragOver = true;
    const w = this.b.camera.toWorld(e.clientX - this.ox, e.clientY - this.oy);
    this.hover = w;
    if (types.includes("Files")) this.hot = this.b.view.nodeAt(w, (v) => v.type === "file" || v.type === "shelf")?.id ?? null;
  };

  private onDragLeave = (e: DragEvent) => {
    if (e.relatedTarget && this.root?.contains(e.relatedTarget as Node)) return;
    this.dragOver = false;
    this.hot = null;
  };

  private onDrop = (e: DragEvent) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    e.preventDefault();
    this.dragOver = false;
    const hot = this.hot;
    this.hot = null;
    const b = this.b;
    if (b.readonly) return;
    const at = b.camera.toWorld(e.clientX - this.ox, e.clientY - this.oy);
    const lib = dt.getData(LIB_MIME);
    if (lib) {
      const r = insertLib(b, lib, at, { drop: true });
      if (r?.edit) this.edit(r.edit, "end");
      return;
    }
    const files = [...dt.files];
    if (files.length) {
      const t = hot ? b.view.get(hot) : undefined;
      if (t?.type === "shelf") void addToShelf(b, t.id, files);
      else if (t?.type === "file") void dropOnFileNode(b, t.id, files);
      else void addFiles(b, files, at);
      return;
    }
    const uri = dt
      .getData("text/uri-list")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    const text = dt.getData("text/plain").trim();
    const url = uri && looksLikeUrl(uri) ? uri : looksLikeUrl(text) ? text : null;
    let id: string | null = null;
    if (url) id = addUrl(b, url, at);
    else if (text) id = place(b, "note", at, { text });
    if (id) b.view.selection.set([id]);
  };
}

/* ============================== вспомогательное ============================== */

export type { Side };
type InkPt = Pt & { p: number };

/** Единичный вектор из b в a. */
function norm(a: Pt, b: Pt): Pt {
  const l = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  return { x: (a.x - b.x) / l, y: (a.y - b.y) / l };
}

/** Узел «такой же, как этот» — для быстрых связей. */
function linkedData(b: Board, src: NodeView): NodeData & { w: number; h: number } {
  const p = src.props;
  if (src.type === "shape") {
    return { type: "shape", x: 0, y: 0, w: src.w, h: src.h, kind: p.kind === "poly" ? "rect" : p.kind, fill: p.fill, stroke: p.stroke, dash: p.dash, color: p.color, size: p.size, align: p.align };
  }
  if (src.type === "note") return { type: "note", x: 0, y: 0, w: src.w, h: Math.min(src.H, 160), fit: true, color: p.color, size: p.size };
  if (src.type === "task") return { type: "task", x: 0, y: 0, w: src.w, h: Math.min(src.H, 120), fit: true, color: p.color };
  if (src.type === "text") return { type: "text", x: 0, y: 0, w: Math.max(160, Math.min(src.w, 420)), h: 40, fit: true, size: p.size, color: p.color };
  const d = defaults("note");
  return { type: "note", x: 0, y: 0, w: d.w ?? 260, h: d.h ?? 120, fit: true, color: b.style.color };
}

const GEO4 = ["x", "y", "w", "h"] as const;

const MIN_W: Partial<Record<NodeType, number>> = {
  sticker: 24,
  table: 120,
  task: 160,
  poll: 200,
  timer: 140,
  audio: 200,
  counter: 120,
  dice: 120,
  progress: 160,
  note: 120,
  text: 40,
  code: 200,
  link: 200,
  file: 160,
  shelf: 200,
  frame: 80,
  image: 24,
  video: 120,
  shape: 8,
  ink: 4,
  button: 80,
  switch: 140,
  slider: 160,
  rating: 140,
  clock: 120,
  countdown: 200,
  chart: 160,
  qr: 80,
  wheel: 140,
  status: 110,
  tracker: 120,
  calc: 110,
  gate: 90,
};
const MIN_H: Partial<Record<NodeType, number>> = { button: 36, switch: 48, slider: 76, rating: 70, clock: 60, countdown: 90, chart: 120, qr: 90, wheel: 160, status: 40, tracker: 70, calc: 80, gate: 80, counter: 90, dice: 100, progress: 64, sticker: 24, table: 36, task: 44, poll: 80, timer: 90, audio: 60, note: 44, code: 60, link: 60, shelf: 80, frame: 60, video: 68, image: 16, shape: 8, ink: 4, text: 24, file: 56 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;


function frameName(b: Board): string {
  const n = b.view.order.filter((v) => v.type === "frame").length + 1;
  return `Рамка ${n}`;
}

