<script lang="ts">
  /* Линия или стрелка. Концы, привязанные к узлам, пересчитываются на
     лету — при перетаскивании узла линия едет за ним. Подпись сидит на
     самой линии и разрывает её фоном доски. */
  import { useBoard } from "../board.svelte.ts";
  import { dashArray, strokePx } from "../shapes.ts";
  import EditorHost from "../ui/EditorHost.svelte";
  import { markdownOf } from "./cache.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel, editing }: NodeCompProps = $props();
  const b = useBoard();
  const geo = $derived(b.view.connector(v));
  const sw = $derived(strokePx(v.props.stroke));
  const box = $derived.by(() => {
    const r = geo.paint;
    const pad = sw + 10;
    return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
  });
  const html = $derived(editing ? "" : markdownOf(v));
</script>

{#if geo.track.length >= 2}
  <svg
    class="path-svg"
    style:left="{box.x}px"
    style:top="{box.y}px"
    width={box.w}
    height={box.h}
    viewBox="{box.x} {box.y} {box.w} {box.h}"
    style:--sw={sw}
    aria-hidden="true"
  >
    {#if sel}<path class="glow" d={geo.d} />{/if}
    <path class="hit" d={geo.d} />
    <path class="line" d={geo.d} style:stroke-width="{sw}px" stroke-dasharray={dashArray(v.props.dash, sw)} />
    {#each geo.heads as h, i (i)}
      {#if h}<path class="head {h.style}" d={h.d} style:stroke-width="{sw}px" />{/if}
    {/each}
  </svg>
  {#if editing || html}
    <div class="path-label {v.props.size ?? 's'}" class:editing data-path-label={v.id} style:transform="translate({geo.label.x}px, {geo.label.y}px)">
      {#if editing}
        <EditorHost {v} mode="markdown" placeholder="Подпись" />
      {:else}
        <div class="md">{@html html}</div>
      {/if}
    </div>
  {/if}
{/if}
