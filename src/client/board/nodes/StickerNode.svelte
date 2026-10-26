<script lang="ts">
  /* Стикер: крупный эмодзи без подложки. Масштабируется вместе с рамкой. */
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const size = $derived(Math.max(8, Math.min(v.w, v.h) * 0.84));
</script>

<div class="sticker" style:font-size="{size}px">{v.props.emoji || "⭐"}</div>
