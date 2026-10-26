<script lang="ts">
  /* Заголовок объекта: двойной щелчок по объекту — переименовать. */
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import type { NodeView } from "../store.svelte.ts";

  let { v, placeholder }: { v: NodeView; placeholder: string } = $props();
  const b = useBoard();
  const renaming = $derived(b.ix.renaming === v.id);

  function commit(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.trim();
    if (b.ix.renaming !== v.id) return;
    b.ix.renaming = null;
    if (val !== (v.props.title ?? "")) b.view.update(v.id, { title: val || undefined });
  }

  function onkey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") b.ix.renaming = null;
  }
</script>

{#if renaming}
  <input class="rename" data-ui value={v.props.title ?? ""} {placeholder} {@attach focusSelect} onblur={commit} onkeydown={onkey} />
{:else}
  {v.props.title || placeholder}
{/if}
