<script lang="ts">
  /* Полка: несколько файлов в одной карточке. Файл можно вытащить
     обратно на доску, всё — скачать одним архивом. */
  import Download from "@lucide/svelte/icons/download";
  import FolderArchive from "@lucide/svelte/icons/folder-archive";
  import { bytes, download, plural } from "../../lib/util.ts";
  import { focusSelect, portal } from "../../ui/portal.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { downloadShelf, fileUrl, shelfSize, takeFromShelf } from "../files.ts";
  import { containsPt } from "../geometry.ts";
  import type { ShelfItem } from "../model.ts";
  import { FILE_COLORS, fileKind } from "./cache.ts";
  import FileIcon from "./FileIcon.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const items = $derived(v.props.items ?? []);
  const name = $derived(v.props.name || "Полка");
  const renaming = $derived(b.ix.renaming === v.id);
  let ghost = $state<{ i: number; x: number; y: number } | null>(null);
  let dragI = $state(-1);

  function commit(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.trim();
    if (b.ix.renaming !== v.id) return;
    b.ix.renaming = null;
    if (val && val !== name) b.view.update(v.id, { name: val });
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") {
      b.ix.renaming = null;
      e.stopPropagation();
    }
  }

  function saveOne(e: MouseEvent, it: ShelfItem) {
    e.stopPropagation();
    download(fileUrl(it.src, { dl: true, name: it.name.split("/").pop() }), it.name.split("/").pop() || "file");
  }

  function rowDown(e: PointerEvent, i: number) {
    if (e.button !== 0 || b.readonly) return;
    const el = e.currentTarget as HTMLElement;
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* нет захвата */
    }
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        dragging = true;
        dragI = i;
      }
      if (dragging) ghost = { i, x: ev.clientX, y: ev.clientY };
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (!dragging) return;
      ghost = null;
      dragI = -1;
      if (ev.type === "pointercancel") return;
      const w = b.ix.worldAt(ev.clientX, ev.clientY);
      if (!containsPt(b.view.bounds(v), w)) takeFromShelf(b, v.id, i, { x: w.x - 140, y: w.y - 36 });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
</script>

<div class="card" class:loading={v.props.pending}>
  <div class="shelf-head">
    <div class="file-icon"><FolderArchive size={18} strokeWidth={1.6} /></div>
    <div class="shelf-title">
      {#if renaming}
        <input class="rename" data-ui value={name} {@attach focusSelect} onblur={commit} onkeydown={onkey} />
      {:else}
        <b>{name}</b>
      {/if}
      <small>{items.length} {plural(items.length, "файл", "файла", "файлов")} · {shelfSize(items)}</small>
    </div>
    {#if items.length}
      <button class="icon-btn" data-ui onclick={(e) => (e.stopPropagation(), downloadShelf(name, items))} {@attach tip("Скачать всё (zip)")}><Download size={16} /></button>
    {/if}
  </div>
  {#if items.length}
    <div class="shelf-list scroll" data-scroll>
      {#each items as it, i (it.src + i)}
        {@const kind = fileKind(it.name, it.mime)}
        <div
          class="shelf-row"
          class:dragging={dragI === i}
          data-ui
          role="listitem"
          title={it.name}
          onpointerdown={(e) => rowDown(e, i)}
          ondblclick={() => window.open(fileUrl(it.src, { name: it.name.split("/").pop() }), "_blank", "noopener")}
        >
          <span style:color={FILE_COLORS[kind]}><FileIcon {kind} size={16} /></span>
          <span class="nm">{it.name}</span>
          <span class="sz">{bytes(it.size)}</span>
          <button class="icon-btn" onclick={(e) => saveOne(e, it)} onpointerdown={(e) => e.stopPropagation()} aria-label="Скачать"><Download size={14} /></button>
        </div>
      {/each}
    </div>
  {:else}
    <div class="shelf-empty">Перетащите сюда файлы</div>
  {/if}
</div>

{#if ghost}
  {@const it = items[ghost.i]}
  {#if it}
    <div class="shelf-ghost" {@attach portal} style:transform="translate({ghost.x + 12}px, {ghost.y + 8}px)">
      <FileIcon kind={fileKind(it.name, it.mime)} size={15} />
      {it.name.split("/").pop()}
    </div>
  {/if}
{/if}
