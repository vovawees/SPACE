<script lang="ts">
  /* Рисунок пером: контур perfect-freehand, кэшируется в узле. */
  import { inkD, inkPx } from "../shapes.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();

  const d = $derived.by(() => {
    const p = v.props;
    const w = v.w;
    const h = v.h;
    const c = v.cache.ink as { pts: unknown; w: number; h: number; s: unknown; d: string } | undefined;
    if (c && c.pts === p.pts && c.w === w && c.h === h && c.s === p.stroke) return c.d;
    const sx = p.ow ? w / p.ow : 1;
    const sy = p.oh ? h / p.oh : 1;
    const size = inkPx(p.stroke) * Math.sqrt(Math.max(0.05, sx * sy));
    const out = inkD(p.pts ?? [], size, sx, sy);
    v.cache.ink = { pts: p.pts, w, h, s: p.stroke, d: out };
    return out;
  });
</script>

<svg class="ink-svg" width={v.w} height={v.h} aria-hidden="true">
  <path class="hit" {d} />
  <path {d} />
</svg>
