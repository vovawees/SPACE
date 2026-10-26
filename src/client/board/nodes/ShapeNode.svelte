<script lang="ts">
  /* Фигура: контур SVG + подпись внутри той части фигуры, где она помещается. */
  import { dashArray, labelInset, shapeD, strokePx } from "../shapes.ts";
  import EditorHost from "../ui/EditorHost.svelte";
  import { markdownOf } from "./cache.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, editing }: NodeCompProps = $props();
  const p = $derived(v.props);
  const sw = $derived(p.fill === "solid" && p.stroke === undefined ? 0 : strokePx(p.stroke));
  const h = $derived(v.H);
  const d = $derived(shapeD(p.kind ?? "rect", sw / 2, sw / 2, v.w - sw, h - sw, p.pts));
  const fill = $derived(p.fill === "none" ? "none" : p.fill === "solid" ? "var(--c)" : "color-mix(in oklab, var(--c) var(--tint), transparent)");
  const html = $derived(editing ? "" : markdownOf(v));
  const inset = $derived.by(() => {
    const [t, r, bt, l] = labelInset(p.kind);
    return t || r || bt || l ? `${Math.round(t * h)}px ${Math.round(r * v.w)}px ${Math.round(bt * h)}px ${Math.round(l * v.w)}px` : undefined;
  });
</script>

<svg class="shape-svg" width={v.w} height={h} aria-hidden="true">
  <path {d} style:fill={fill} style:stroke="var(--c)" style:stroke-width="{sw}px" stroke-dasharray={dashArray(p.dash, sw)} stroke-linejoin="round" stroke-linecap="round" />
</svg>
<div class="shape-label {p.size ?? 'm'}" class:solid={p.fill === "solid"} style:inset>
  {#if editing}
    <EditorHost {v} mode="markdown" />
  {:else if html}
    <div class="md">{@html html}</div>
  {/if}
</div>
