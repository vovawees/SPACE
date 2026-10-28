<script lang="ts">
  /* Значок: иконка из набора без подложки — для схем, легенд и карт.
     Цвет — цвет объекта, толщина линий и подпись — в настройках. */
  import { iconComp } from "./icons.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const p = $derived(v.props);
  const Comp = $derived(iconComp(p.ic));
  const cap = $derived(p.title?.trim() ?? "");
  const fs = $derived(Math.max(9, Math.min(28, v.w * 0.13)));
  const size = $derived(Math.max(8, Math.min(v.w, v.h - (cap ? fs * 1.5 : 0)) * 0.9));
</script>

<div class="ic-node">
  <Comp size={size} strokeWidth={p.isw ?? 2} />
  {#if cap}<span class="ic-cap" style:font-size="{fs}px">{cap}</span>{/if}
</div>
