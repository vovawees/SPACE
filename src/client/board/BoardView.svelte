<script lang="ts">
  /* Открытая доска: создаёт Board, раздаёт его через контекст и собирает
     экран — холст и плавающие панели вокруг него. */
  import { onMount, untrack } from "svelte";
  import type { BoardSummary } from "../../shared/types.ts";
  import { api } from "../lib/api.ts";
  import { applyLook } from "../lib/look.svelte.ts";
  import { freshThumbs } from "../lib/thumbs.svelte.ts";
  import { router } from "../lib/router.svelte.ts";
  import { session } from "../lib/session.svelte.ts";
  import SettingsDialog from "../ui/SettingsDialog.svelte";
  import { Board, provideBoard } from "./board.svelte.ts";
  import ContextBar from "./chrome/ContextBar.svelte";
  import Chat from "./chrome/Chat.svelte";
  import CommentThread from "./chrome/CommentThread.svelte";
  import HistoryPanel from "./chrome/HistoryPanel.svelte";
  import Library from "./chrome/Library.svelte";
  import Minimap from "./chrome/Minimap.svelte";
  import Palette from "./chrome/Palette.svelte";
  import ShareDialog from "./chrome/ShareDialog.svelte";
  import ShortcutsDialog from "./chrome/ShortcutsDialog.svelte";
  import Toolbar from "./chrome/Toolbar.svelte";
  import TopBar from "./chrome/TopBar.svelte";
  import Viewer from "./chrome/Viewer.svelte";
  import ZoomBar from "./chrome/ZoomBar.svelte";
  import { Interact } from "./interact.svelte.ts";
  import { attachKeys } from "./keys.ts";
  import { useLibItem } from "./library.ts";
  import { renderThumb } from "./scene.ts";
  import Canvas from "./ui/Canvas.svelte";

  let { id, focus, summary }: { id: string; focus?: string; summary: BoardSummary | null } = $props();

  const b = untrack(() => new Board(id));
  b.ix = new Interact(b);
  untrack(() => {
    if (summary) {
      b.summary = summary;
      b.role = summary.role;
      if (summary.perms) b.perms = summary.perms;
    }
  });
  provideBoard(b);
  // отладка и e2e-тесты: localStorage["space:debug"] = "1" → window.__board
  if (import.meta.env.DEV || localStorage.getItem("space:debug")) (window as unknown as { __board?: Board }).__board = b;

  const cam = b.camera;
  const CAM_KEY = untrack(() => `space:cam:${id}`);
  const focusId = untrack(() => focus);

  /* ------------------------------ камера ------------------------------ */

  /** Камера уже поставлена по содержимому/сохранённому положению. */
  let placed = false;

  function savedCamera(): { x: number; y: number; z: number } | null {
    try {
      const c = JSON.parse(localStorage.getItem(CAM_KEY) || "null");
      return c && [c.x, c.y, c.z].every((n) => Number.isFinite(n)) && c.z > 0 ? c : null;
    } catch {
      return null;
    }
  }

  // как только есть содержимое (с устройства или с сервера) — показать его
  $effect(() => {
    if (placed) return;
    const n = b.store.order.length;
    const synced = b.synced;
    if (!synced && !(b.localReady && n > 0)) return;
    untrack(() => {
      if (focusId) {
        const v = b.store.get(focusId);
        if (v) {
          placed = true;
          b.store.selection.set([v.id]);
          cam.fit(b.store.bounds(v), { maxZoom: 1, animate: false });
          return;
        }
        if (!synced) return;
      }
      placed = true;
      // доска создана с главной «из шаблона» — поставить его, пока она пуста
      const tplKey = `space:tpl:${b.id}`;
      const tpl = synced ? sessionStorage.getItem(tplKey) : null;
      if (tpl) {
        sessionStorage.removeItem(tplKey);
        if (!n && !b.readonly) {
          useLibItem(b, `tpl:${tpl}`, { animate: false });
          b.store.selection.set([]);
          return;
        }
      }
      const all = b.store.allBounds();
      if (all) cam.fit(all, { maxZoom: 1, animate: false });
    });
  });

  // положение камеры запоминается на устройстве
  let camTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const x = cam.x;
    const y = cam.y;
    const z = cam.z;
    clearTimeout(camTimer);
    camTimer = setTimeout(() => {
      if (placed) localStorage.setItem(CAM_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y), z: Math.round(z * 1e4) / 1e4 }));
    }, 400);
  });

  // что я вижу — для «следовать за мной» у других (не чаще 10 раз в секунду)
  let viewTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void cam.view;
    if (viewTimer) return;
    viewTimer = setTimeout(() => {
      viewTimer = undefined;
      const v = cam.view;
      b.setPresence({ view: { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h) } });
    }, 100);
  });

  /* ------------------------------ заголовок ------------------------------ */

  $effect(() => {
    document.title = `${b.store.title.trim() || "Без названия"} · SPACE`;
  });

  // выделена одна булавка — рядом обсуждение
  const commentId = $derived.by(() => {
    const l = b.view.selection.list;
    if (l.length !== 1 || b.preview) return null;
    return b.view.get(l[0]!)?.type === "comment" ? l[0]! : null;
  });

  // фон доски — общий для всех; на главной снова стандартный
  $effect(() => {
    applyLook("bg", b.view.bg);
    return () => applyLook("bg", null);
  });

  /* ------------------------------ превью ------------------------------ */

  let dirty = false;
  let thumbBusy = false;
  async function saveThumb() {
    if (!dirty || thumbBusy || b.role === "viewer" || b.status !== "online") return;
    dirty = false;
    thumbBusy = true;
    try {
      const blob = await renderThumb(b.store);
      if (blob) {
        const r = await api.raw<{ thumb: string }>("PUT", `/api/boards/${b.id}/thumb`, blob, blob.type || "image/webp");
        if (r?.thumb) freshThumbs[b.id] = r.thumb;
      }
    } catch {
      dirty = true;
    } finally {
      thumbBusy = false;
    }
  }

  /** Превью — в простое: не во время движения камеры или перетаскивания. */
  function saveThumbIdle() {
    if (!dirty || thumbBusy) return;
    const run = () => (cam.moving || b.ix.busy ? setTimeout(saveThumbIdle, 1500) : void saveThumb());
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 300);
  }

  onMount(() => {
    const offKeys = attachKeys(b);
    const c = focusId ? null : savedCamera();
    if (c) {
      cam.set(c.x, c.y, c.z);
      placed = true;
    } else cam.set(Math.round(cam.vw / 2), Math.round(cam.vh / 2), 1);

    const onUpdate = (_u: Uint8Array, origin: unknown) => {
      if (origin !== b.provider && origin !== b.local) dirty = true;
    };
    b.doc.on("update", onUpdate);
    const thumbTimer = setInterval(saveThumbIdle, 30_000);
    // у доски ещё нет превью (импорт, старая версия) — сделать, когда всё загрузится
    const firstThumb = setTimeout(() => {
      if (!b.summary?.thumb && b.store.order.length) {
        dirty = true;
        saveThumbIdle();
      }
    }, 2500);

    // Ctrl+колесо над панелями не должно масштабировать страницу
    const noZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const noGesture = (e: Event) => e.preventDefault();
    addEventListener("wheel", noZoom, { passive: false });
    document.addEventListener("gesturestart", noGesture);
    const hide = () => {
      if (document.visibilityState === "hidden") void saveThumb();
    };
    document.addEventListener("visibilitychange", hide);

    return () => {
      offKeys();
      clearInterval(thumbTimer);
      clearTimeout(firstThumb);
      clearTimeout(camTimer);
      clearTimeout(viewTimer);
      removeEventListener("wheel", noZoom);
      document.removeEventListener("gesturestart", noGesture);
      document.removeEventListener("visibilitychange", hide);
      b.doc.off("update", onUpdate);
      if (!b.summary?.thumb && !freshThumbs[b.id] && b.store.order.length) dirty = true;
      void saveThumb().finally(() => b.destroy());
      document.title = "SPACE";
    };
  });
</script>

<Canvas />

<div class="chrome" data-chrome>
  <TopBar />
  <Library />
  <Toolbar />
  <ContextBar />
  <ZoomBar />
  {#if session.settings.minimap}
    <Minimap />
  {/if}
</div>

{#if b.ui.palette || b.ui.search}
  <Palette />
{/if}
{#if b.ui.share}
  <ShareDialog />
{/if}
{#if commentId}
  {#key commentId}<CommentThread id={commentId} />{/key}
{/if}
{#if b.ui.history}
  <HistoryPanel />
{:else if b.ui.chat}
  <Chat />
{/if}
{#if b.ui.shortcuts}
  <ShortcutsDialog />
{/if}
{#if b.ui.settings}
  <SettingsDialog onclose={() => (b.ui.settings = false)} />
{/if}
{#if b.ui.viewer}
  <Viewer />
{/if}

{#if b.denied}
  <div class="denied">
    <div class="denied-card">
      <h2>Нет доступа к доске</h2>
      <p>{b.denied === "permission-denied" ? "Владелец закрыл доступ." : b.denied}</p>
      <button class="btn" onclick={() => router.go("/")}>К моим доскам</button>
    </div>
  </div>
{/if}

<style>
  .chrome {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: var(--z-chrome);
  }
  .denied {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    display: grid;
    place-items: center;
    background: color-mix(in oklab, var(--bg) 82%, transparent);
    backdrop-filter: blur(6px);
  }
  .denied-card {
    text-align: center;
    display: grid;
    gap: 10px;
    justify-items: center;
  }
  .denied-card h2 {
    margin: 0;
    font-size: 18px;
  }
  .denied-card p {
    margin: 0 0 6px;
    color: var(--ink-2);
  }
</style>
