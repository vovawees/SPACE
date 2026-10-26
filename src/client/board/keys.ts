/* Клавиатура. Сочетания читаются по физической клавише (e.code), а не по
   символу: на русской раскладке Ctrl+Z приходит как «я», и без этого
   отмена и все горячие клавиши молча не работали бы. */
import { copyStyle, pasteStyle } from "./style.ts";
import { RUN_LANGS, runs } from "./run.svelte.ts";
import { session } from "../lib/session.svelte.ts";
import { toasts } from "../lib/toast.svelte.ts";
import { menu } from "../ui/menu.svelte.ts";
import type { Board, Tool } from "./board.svelte.ts";
import { nextZoom } from "./camera.svelte.ts";
import { copyToEvent, pasteFromEvent } from "./clip.ts";
import { stickerMenu } from "./menus.ts";
import { rollDice } from "./nodes/games.ts";
import { duplicate, removeSelected, tidy, withChildren, wrapInFrame, zoomToFit, zoomToSelection } from "./ops.ts";
import type { Side } from "./connector.ts";
import { CONNECTABLE } from "./interact.svelte.ts";
import { TEXT_TYPES, TITLED_TYPES, WIDGET_EDIT_TYPES, type ShapeKind } from "./model.ts";

const TOOL_KEYS: Record<string, Tool> = {
  KeyV: "select",
  KeyH: "hand",
  KeyN: "note",
  KeyT: "text",
  KeyC: "code",
  KeyR: "shape",
  KeyO: "shape",
  KeyD: "draw",
  KeyP: "pen",
  KeyS: "pen",
  KeyA: "arrow",
  KeyL: "line",
  KeyF: "frame",
  KeyE: "eraser",
  KeyK: "laser",
};

function typingIn(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || !!el.closest?.(".cm-editor");
}

function dialogOpen(): boolean {
  return !!document.querySelector("[role='dialog'][aria-modal='true']");
}

const ARROW_SIDE: Record<string, Side> = { ArrowUp: "n", ArrowRight: "e", ArrowDown: "s", ArrowLeft: "w" };

/** Переключить направляющие выравнивания. */
export function toggleSnap() {
  const on = !session.settings.snap;
  session.settings.snap = on;
  toasts.show(on ? "Прилипание и направляющие включены" : "Прилипание выключено", { kind: "info", ms: 1600 });
}

export function attachKeys(b: Board): () => void {
  const ix = b.ix;
  const s = () => b.view;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Shift" || e.key === "Alt" || e.key === "Control" || e.key === "Meta") {
      ix.setMods(e);
      ix.refresh();
      if (e.key === "Alt" && ix.kind) e.preventDefault();
      return;
    }
    if (typingIn(e.target) || dialogOpen() || menu.open) return;
    const code = e.code;
    const mod = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const st = s();
    const sel = st.selection;

    if (code === "Space") {
      e.preventDefault();
      if (!e.repeat) b.spaceDown = true;
      return;
    }
    if (code === "Escape") {
      if (ix.cancelGesture()) return;
      if (b.ui.palette || b.ui.search || b.ui.history || b.ui.share || b.ui.shortcuts || b.ui.settings) return;
      if (ix.renaming) ix.renaming = null;
      else if (st.editing) ix.stopEditing();
      else if (b.tool !== "select") b.setTool("select");
      else if (b.following !== null) b.following = null;
      else if (sel.size) sel.clear();
      else if (b.ui.chat) b.ui.chat = false;
      return;
    }

    if (mod && e.altKey && (code === "KeyC" || code === "KeyV")) {
      // оформление: Ctrl+Alt+C — взять, Ctrl+Alt+V — применить к выделенному
      e.preventDefault();
      const list = st.selected();
      if (code === "KeyC") {
        if (list[0]) copyStyle(list[0]);
      } else if (!b.readonly && list.length) pasteStyle(b, list.map((v) => v.id));
      return;
    }

    if (mod) {
      switch (code) {
        case "KeyZ":
          e.preventDefault();
          if (b.readonly) return;
          ix.cancelGesture();
          if (shift) b.store.undo.redo();
          else b.store.undo.undo();
          return;
        case "KeyY":
          e.preventDefault();
          if (b.readonly) return;
          b.store.undo.redo();
          return;
        case "KeyA":
          e.preventDefault();
          sel.set(st.order.map((v) => v.id));
          return;
        case "KeyD":
          e.preventDefault();
          if (!b.readonly) duplicate(b, sel.list);
          return;
        case "KeyG":
          e.preventDefault();
          if (!b.readonly && sel.size) wrapInFrame(b, sel.list);
          return;
        case "KeyK":
          e.preventDefault();
          b.ui.palette = !b.ui.palette;
          return;
        case "KeyF":
          e.preventDefault();
          b.ui.search = true;
          return;
        case "KeyL":
          e.preventDefault();
          if (!b.readonly && sel.size) {
            const lock = !st.selected().every((v) => v.locked);
            st.updateMany(sel.list.map((id) => [id, { locked: lock || undefined }]));
          }
          return;
        case "BracketRight":
          e.preventDefault();
          if (!b.readonly) st.reorder(sel.list, shift ? "top" : "up");
          return;
        case "BracketLeft":
          e.preventDefault();
          if (!b.readonly) st.reorder(sel.list, shift ? "bottom" : "down");
          return;
        case "Digit0":
        case "Numpad0":
          e.preventDefault();
          b.camera.zoomTo(1);
          return;
        case "Equal":
        case "NumpadAdd":
          e.preventDefault();
          b.camera.zoomTo(nextZoom(b.camera.z, 1));
          return;
        case "Minus":
        case "NumpadSubtract":
          e.preventDefault();
          b.camera.zoomTo(nextZoom(b.camera.z, -1));
          return;
        case "Enter":
          if (st.editing) {
            e.preventDefault();
            ix.stopEditing();
          }
          return;
      }
      return;
    }

    // связанный объект рядом: Alt+стрелка — в ту сторону, Tab — вправо, Shift+Tab — вниз
    const linkSide = code === "Tab" ? (shift ? "s" : "e") : e.altKey && !shift ? ARROW_SIDE[code] : undefined;
    if (linkSide && !b.readonly && !st.editing) {
      const one = st.selected();
      const v = one.length === 1 ? one[0]! : null;
      if (v && CONNECTABLE.has(v.type) && !v.locked) {
        e.preventDefault();
        ix.quickCreate(v, linkSide);
        return;
      }
    }

    if (e.altKey) return;

    if (shift && code === "KeyS" && !e.repeat) {
      e.preventDefault();
      toggleSnap();
      return;
    }

    if (shift) {
      if (code === "Digit1") return void zoomToFit(b);
      if (code === "Digit2") return void zoomToSelection(b);
      if (code === "Digit0") return void b.camera.zoomTo(1);
    }
    if (e.key === "?" || (shift && code === "Slash")) {
      b.ui.shortcuts = true;
      return;
    }

    switch (code) {
      case "Delete":
      case "Backspace":
        e.preventDefault();
        if (!b.readonly) removeSelected(b);
        return;
      case "Enter": {
        const one = st.selected();
        if (one.length !== 1) return;
        const v = one[0]!;
        e.preventDefault();
        if (shift && v.type === "code" && RUN_LANGS.has(v.props.lang ?? "")) runs.run(v.id, v.textValue);
        else if (TEXT_TYPES.has(v.type)) ix.edit(v.id, "end");
        else if (v.type === "table") ix.edit(v.id, "end");
        else if (v.type === "frame" || v.type === "shelf" || TITLED_TYPES.has(v.type)) {
          if (!b.readonly) ix.renaming = v.id;
        } else if (WIDGET_EDIT_TYPES.has(v.type)) ix.edit(v.id, "end");
        else if (v.type === "dice") rollDice(b, [v.id]);
        else if (v.type === "image") b.ui.viewer = v.id;
        else if (v.type === "link" || v.type === "video") ix.activate(v.id);
        else if (v.type === "sticker" && !b.readonly) stickerMenu(b, [v.id], b.camera.toScreen(v.x + v.w / 2, v.y + v.h));
        return;
      }
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight": {
        if (!sel.size || b.readonly) return;
        e.preventDefault();
        const d = shift ? 10 : 1;
        const dx = code === "ArrowLeft" ? -d : code === "ArrowRight" ? d : 0;
        const dy = code === "ArrowUp" ? -d : code === "ArrowDown" ? d : 0;
        const ids = withChildren(b, sel.list).filter((id) => !st.get(id)?.locked);
        st.updateMany(
          ids.map((id) => {
            const v = st.get(id)!;
            return [id, { x: v.x + dx, y: v.y + dy }];
          }),
        );
        st.reflowPaths(ids);
        return;
      }
      case "KeyG":
        if (!b.readonly && sel.size > 1) tidy(b, sel.list);
        return;
      case "KeyB":
        if (!b.readonly && !e.repeat) session.settings.library = !session.settings.library;
        return;
      // общение: сообщение у курсора и чат доски
      case "Slash":
      case "NumpadDivide":
        e.preventDefault();
        b.social.openSay();
        return;
      case "KeyM":
        if (!e.repeat) {
          b.ui.chat = !b.ui.chat;
          if (b.ui.chat) b.ui.history = false;
        }
        return;
    }

    const tool = TOOL_KEYS[code];
    if (tool && !e.repeat) {
      if (b.readonly && tool !== "select" && tool !== "hand" && tool !== "laser") return;
      if (tool === "shape") b.shapeKind = (code === "KeyO" ? "ellipse" : code === "KeyR" ? "rect" : b.shapeKind) as ShapeKind;
      b.setTool(tool);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    ix.setMods(e);
    if (e.key === "Shift" || e.key === "Alt" || e.key === "Control" || e.key === "Meta") ix.refresh();
    if (e.code === "Space") b.spaceDown = false;
  };

  const onBlur = () => {
    b.spaceDown = false;
    ix.mods.shift = ix.mods.alt = ix.mods.ctrl = false;
    // щелчок внутрь плеера (Spotify, YouTube, Figma…): узел больше не
    // выгружается при прокрутке — музыка и видео не обрываются
    setTimeout(() => {
      const el = document.activeElement;
      if (el?.tagName !== "IFRAME") return;
      const id = el.closest<HTMLElement>(".node[data-id]")?.dataset.id;
      if (id && b.store.get(id)) b.live.add(id);
    });
  };

  const onCopy = (e: ClipboardEvent) => {
    if (typingIn(e.target) || dialogOpen() || !e.clipboardData) return;
    if (window.getSelection()?.toString()) return;
    if (copyToEvent(b, e.clipboardData)) e.preventDefault();
  };

  const onCut = (e: ClipboardEvent) => {
    if (typingIn(e.target) || dialogOpen() || !e.clipboardData || b.readonly) return;
    if (window.getSelection()?.toString()) return;
    if (copyToEvent(b, e.clipboardData)) {
      e.preventDefault();
      removeSelected(b);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if (typingIn(e.target) || dialogOpen() || !e.clipboardData || b.readonly) return;
    e.preventDefault();
    void pasteFromEvent(b, e.clipboardData, ix.pointerWorld());
  };

  addEventListener("keydown", onKeyDown);
  addEventListener("keyup", onKeyUp);
  addEventListener("blur", onBlur);
  document.addEventListener("copy", onCopy);
  document.addEventListener("cut", onCut);
  document.addEventListener("paste", onPaste);
  return () => {
    removeEventListener("keydown", onKeyDown);
    removeEventListener("keyup", onKeyUp);
    removeEventListener("blur", onBlur);
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("cut", onCut);
    document.removeEventListener("paste", onPaste);
  };
}
