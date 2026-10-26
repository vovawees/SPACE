<script lang="ts">
  import { encode } from "uqr";

  let { text, size = 200 }: { text: string; size?: number } = $props();

  const qr = $derived(encode(text, { border: 2, ecc: "M" }));
  const path = $derived.by(() => {
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return d;
  });
</script>

<svg class="qr" width={size} height={size} viewBox="0 0 {qr.size} {qr.size}" shape-rendering="crispEdges" role="img" aria-label="QR-код">
  <rect width={qr.size} height={qr.size} fill="#fff" />
  <path d={path} fill="#111" />
</svg>

<style>
  .qr {
    border-radius: 12px;
    background: #fff;
  }
</style>
