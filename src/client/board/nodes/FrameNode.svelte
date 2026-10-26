<script lang="ts">
  /* Рамка: область с названием. Внутренность прозрачна для указателя —
     внутри большой рамки можно выделять рамкой и рисовать. */
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const name = $derived(v.props.name || "Рамка");
  const renaming = $derived(b.ix.renaming === v.id);

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
</script>

<div class="frame-body"></div>
<div class="frame-label" data-frame-label={v.id}>
  {#if renaming}
    <input class="rename" data-ui value={name} {@attach focusSelect} onblur={commit} onkeydown={onkey} />
  {:else}
    {name}
  {/if}
</div>
