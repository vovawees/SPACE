<script lang="ts">
  /* Заметка (карточка) и свободный текст: Markdown, формулы, задачи. */
  import { useBoard } from "../board.svelte.ts";
  import EditorHost from "../ui/EditorHost.svelte";
  import { markdownOf, toggleTask } from "./cache.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const isText = $derived(v.type === "text");
  const html = $derived(editing ? "" : markdownOf(v));
  const size = $derived(v.props.size ?? "m");
  const align = $derived(v.props.align ?? "left");

  function onclick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.classList.contains("task")) {
      e.preventDefault();
      if (!b.readonly) toggleTask(b.view, v, Number(t.dataset.line));
    }
  }
</script>

{#if isText}
  <div class="text-body {size} al-{align}" {onclick}>
    {#if editing}
      <EditorHost {v} mode="markdown" placeholder="Текст" />
    {:else}
      <div class="md">{@html html || "&nbsp;"}</div>
    {/if}
  </div>
{:else}
  <div class="card">
    <div class="note-body {size} al-{align}" class:scroll={!v.fit} data-scroll={v.fit ? undefined : ""} {onclick}>
      {#if editing}
        <EditorHost {v} mode="markdown" placeholder="Пишите…" />
      {:else if html}
        <div class="md">{@html html}</div>
      {:else}
        <div class="placeholder">Пустая заметка</div>
      {/if}
    </div>
  </div>
{/if}
