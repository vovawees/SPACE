<script lang="ts">
  /* Фигура: контур SVG + подпись внутри той части фигуры, где она помещается.
     Оформление (заливка и градиент, обводка) рисуется прямо в SVG. */
  import { colorCss } from "../model.ts";
  import { dashArray, labelInset, shapeD, strokePx } from "../shapes.ts";
  import EditorHost from "../ui/EditorHost.svelte";
  import { markdownOf } from "./cache.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, editing }: NodeCompProps = $props();
  const p = $derived(v.props);
  const own = $derived(!!p.fc);
  const sw = $derived(typeof p.bw === "number" ? Math.max(0, Math.min(16, p.bw)) : p.fill === "solid" && p.stroke === undefined ? 0 : own && p.fc !== "transparent" && !p.bc ? 0 : strokePx(p.stroke));
  const h = $derived(v.H);
  const d = $derived(shapeD(p.kind ?? "rect", sw / 2, sw / 2, v.w - sw, h - sw, p.pts));
  const css = (c: string) => (c === "transparent" ? "transparent" : colorCss(c));
  const grad = $derived(own && p.fc2 && p.fc !== "transparent" ? `sg-${v.id}` : "");
  const fill = $derived(
    grad ? `url(#${grad})` : own ? css(p.fc!) : p.fill === "none" ? "none" : p.fill === "solid" ? "var(--c)" : "color-mix(in oklab, var(--c) var(--tint), transparent)",
  );
  const stroke = $derived(p.bc ? css(p.bc) : "var(--c)");
  const dash = $derived(p.bs === "dashed" ? `${sw * 3} ${sw * 2}` : p.bs === "dotted" ? `0.1 ${sw * 2}` : dashArray(p.dash, sw));
  // направление градиента: угол CSS (0° — снизу вверх) → вектор в долях фигуры
  const gv = $derived.by(() => {
    const a = (((p.ga ?? 135) - 90) * Math.PI) / 180;
    const dx = Math.cos(a) / 2;
    const dy = Math.sin(a) / 2;
    return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
  });
  const html = $derived(editing ? "" : markdownOf(v));
  const inset = $derived.by(() => {
    const [t, r, bt, l] = labelInset(p.kind);
    return t || r || bt || l ? `${Math.round(t * h)}px ${Math.round(r * v.w)}px ${Math.round(bt * h)}px ${Math.round(l * v.w)}px` : undefined;
  });
</script>

<svg class="shape-svg" width={v.w} height={h} aria-hidden="true">
  {#if grad}
    <defs>
      <linearGradient id={grad} x1={gv.x1} y1={gv.y1} x2={gv.x2} y2={gv.y2}>
        <stop offset="0" stop-color={css(p.fc!)} />
        <stop offset="1" stop-color={css(p.fc2!)} />
      </linearGradient>
    </defs>
  {/if}
  <path
    {d}
    style:fill
    style:stroke
    style:stroke-width="{sw}px"
    stroke-dasharray={dash}
    stroke-linejoin="round"
    stroke-linecap="round"
  />
</svg>
<div class="shape-label {p.size ?? 'm'}" class:solid={p.fill === "solid"} style:inset>
  {#if editing}
    <EditorHost {v} mode="markdown" />
  {:else if html}
    <div class="md">{@html html}</div>
  {/if}
</div>
