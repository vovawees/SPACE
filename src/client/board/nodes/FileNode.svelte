<script lang="ts">
  /* Файл: значок по типу, имя, размер, скачивание. Аудио играет прямо здесь. */
  import Download from "@lucide/svelte/icons/download";
  import Play from "@lucide/svelte/icons/play";
  import { bytes, download } from "../../lib/util.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { fileUrl } from "../files.ts";
  import { extOf, FILE_COLORS, fileKind } from "./cache.ts";
  import FileIcon from "./FileIcon.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const kind = $derived(fileKind(p.name, p.mime));
  const meta = $derived(p.pending ? "Загрузка…" : [extOf(p.name), p.bytes ? bytes(p.bytes) : ""].filter(Boolean).join(" · "));

  function save(e: MouseEvent) {
    e.stopPropagation();
    if (p.src) download(fileUrl(p.src, { dl: true, name: p.name }), p.name || "file");
  }
</script>

<div class="card" class:loading={p.pending}>
  <div class="file-card">
    <div class="file-icon" style:--fc={FILE_COLORS[kind]}><FileIcon {kind} size={21} /></div>
    <div class="file-main">
      <div class="file-name" title={p.name}>{p.name || "Файл"}</div>
      <div class="file-meta">{meta}</div>
    </div>
    {#if kind === "audio" && p.src && !editing}
      <button class="icon-btn" data-ui onclick={(e) => (e.stopPropagation(), b.ix.activate(v.id))} {@attach tip("Слушать")}><Play size={16} /></button>
    {/if}
    {#if p.src}
      <button class="icon-btn" data-ui onclick={save} {@attach tip("Скачать")}><Download size={16} /></button>
    {/if}
  </div>
  {#if editing && kind === "audio" && p.src}
    <div class="file-audio" data-ui><audio src={fileUrl(p.src)} controls autoplay></audio></div>
  {/if}
</div>
