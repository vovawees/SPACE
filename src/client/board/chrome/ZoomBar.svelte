<script lang="ts">
  /* Левый нижний угол: отмена/повтор и масштаб. */
  import Magnet from "@lucide/svelte/icons/magnet";
  import MapIcon from "@lucide/svelte/icons/map";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import Redo2 from "@lucide/svelte/icons/redo-2";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import { session } from "../../lib/session.svelte.ts";
  import { menu } from "../../ui/menu.svelte.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { nextZoom } from "../camera.svelte.ts";
  import { toggleSnap } from "../keys.ts";
  import { zoomToFit, zoomToSelection } from "../ops.ts";

  const b = useBoard();
  const cam = b.camera;
  const s = b.store;
  const pct = $derived(Math.round(cam.z * 100));

  function zoomMenu(e: MouseEvent) {
    menu.dropdown(
      e.currentTarget as HTMLElement,
      [
        { label: "Показать всё", keys: "Shift+1", run: () => zoomToFit(b) },
        { label: "Показать выделенное", keys: "Shift+2", disabled: !b.view.selection.size, run: () => zoomToSelection(b) },
        "-",
        { label: "50 %", run: () => cam.zoomTo(0.5) },
        { label: "100 %", keys: "Mod+0", run: () => cam.zoomTo(1) },
        { label: "200 %", run: () => cam.zoomTo(2) },
        "-",
        { label: "Мини-карта", checked: session.settings.minimap, run: () => (session.settings.minimap = !session.settings.minimap) },
        { label: "Прилипание и направляющие", keys: "Shift+S", checked: session.settings.snap, run: toggleSnap },
      ],
      "top-start",
    );
  }
</script>

<div class="zoom panel">
  {#if !b.readonly}
    <button class="icon-btn" aria-label="Отменить" disabled={!s.canUndo} onclick={() => s.undo.undo()} {@attach tip("Отменить", "Mod+Z", "top")}>
      <Undo2 size={17} />
    </button>
    <button class="icon-btn" aria-label="Повторить" disabled={!s.canRedo} onclick={() => s.undo.redo()} {@attach tip("Повторить", "Mod+Shift+Z", "top")}>
      <Redo2 size={17} />
    </button>
    <div class="tb-sep zoom-only"></div>
  {/if}
  <button class="icon-btn zoom-only" aria-label="Отдалить" onclick={() => cam.zoomTo(nextZoom(cam.z, -1))} {@attach tip("Отдалить", "Mod+-", "top")}>
    <Minus size={17} />
  </button>
  <button class="pct zoom-only" onclick={zoomMenu} aria-label="Масштаб {pct}%" {@attach tip("Масштаб", undefined, "top")}>{pct}%</button>
  <button class="icon-btn zoom-only" aria-label="Приблизить" onclick={() => cam.zoomTo(nextZoom(cam.z, 1))} {@attach tip("Приблизить", "Mod+=", "top")}>
    <Plus size={17} />
  </button>
  {#if !b.readonly}
    <button
      class="icon-btn zoom-only"
      class:on={session.settings.snap}
      aria-label="Прилипание и направляющие"
      aria-pressed={session.settings.snap}
      onclick={toggleSnap}
      {@attach tip(() => (session.settings.snap ? "Прилипание включено — Ctrl при перетаскивании отключает" : "Прилипание выключено — Ctrl при перетаскивании включает"), "Shift+S", "top")}
    >
      <Magnet size={16} />
    </button>
  {/if}
  <button
    class="icon-btn zoom-only"
    class:on={session.settings.minimap}
    aria-label="Мини-карта"
    onclick={() => (session.settings.minimap = !session.settings.minimap)}
    {@attach tip("Мини-карта", undefined, "top")}
  >
    <MapIcon size={16} />
  </button>
</div>

<style>
  .zoom {
    position: fixed;
    left: 10px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 4px;
    border-radius: var(--r-3);
  }
  .icon-btn {
    width: 32px;
    height: 32px;
  }
  .pct {
    min-width: 52px;
    height: 32px;
    padding: 0 6px;
    border-radius: var(--r-1);
    font-size: 12.5px;
    font-weight: 560;
    font-variant-numeric: tabular-nums;
    color: var(--ink-2);
  }
  .pct:hover {
    background: var(--hover);
    color: var(--ink);
  }
  @media (max-width: 1100px) {
    .zoom {
      bottom: calc(70px + env(safe-area-inset-bottom, 0px));
    }
  }
  @media (max-width: 640px) {
    .zoom {
      left: 8px;
      bottom: calc(66px + env(safe-area-inset-bottom, 0px));
    }
    .zoom-only {
      display: none;
    }
    .icon-btn {
      width: 38px;
      height: 38px;
    }
  }
</style>
