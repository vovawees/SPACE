<script lang="ts">
  /* Мини-карта: всё содержимое доски и рамка экрана. Щелчок/перетаскивание —
     перейти. Содержимое перерисовывается по изменениям документа (не чаще
     кадра), рамка экрана — обычный div, двигается без перерисовки. */
  import { onMount, untrack } from "svelte";
  import { look } from "../../lib/look.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { expand, union } from "../geometry.ts";
  import { drawMini } from "../scene.ts";

  const W = 208;
  const H = 140;
  const b = useBoard();
  const cam = b.camera;
  const s = $derived(b.view);

  let canvas = $state<HTMLCanvasElement>();
  let ver = $state(0);
  let raf = 0;

  onMount(() => {
    const bump = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        ver++;
      });
    };
    b.doc.on("update", bump);
    return () => {
      b.doc.off("update", bump);
      cancelAnimationFrame(raf);
    };
  });

  let prev = { x: 0, y: 0, z: 1 };
  const map = $derived.by(() => {
    void ver;
    const content = untrack(() => s.allBounds());
    const v = cam.view;
    const r = content ? union([content, v])! : v;
    const R = expand(r, Math.max(r.w, r.h) * 0.06);
    const z = Math.min(W / R.w, H / R.h);
    const next = { x: (W - R.w * z) / 2 - R.x * z, y: (H - R.h * z) / 2 - R.y * z, z };
    if (Math.abs(next.x - prev.x) < 0.25 && Math.abs(next.y - prev.y) < 0.25 && Math.abs(next.z / prev.z - 1) < 0.002) return prev;
    prev = next;
    return next;
  });

  $effect(() => {
    const m = map;
    void ver;
    void look.v;
    void s;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    untrack(() => drawMini(ctx, s, { x: m.x, y: m.y, z: m.z, w: W, h: H }, dpr));
  });

  const port = $derived.by(() => {
    const v = cam.view;
    const m = map;
    const x = v.x * m.z + m.x;
    const y = v.y * m.z + m.y;
    return { x, y, w: v.w * m.z, h: v.h * m.z };
  });

  let drag: { x: number; y: number; z: number } | null = null;

  function go(e: PointerEvent) {
    const m = drag ?? map;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    cam.centerOn({ x: (px - m.x) / m.z, y: (py - m.y) / m.z }, false);
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    b.following = null;
    drag = { ...map };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    go(e);
  }
</script>

<div
  class="mini panel"
  role="slider"
  tabindex="-1"
  aria-label="Мини-карта"
  aria-valuenow={Math.round(cam.z * 100)}
  onpointerdown={down}
  onpointermove={(e) => drag && go(e)}
  onpointerup={() => (drag = null)}
  onpointercancel={() => (drag = null)}
>
  <canvas bind:this={canvas} width={W * Math.min(2, devicePixelRatio || 1)} height={H * Math.min(2, devicePixelRatio || 1)} style:width="{W}px" style:height="{H}px"></canvas>
  <div class="port" style:transform="translate({port.x}px, {port.y}px)" style:width="{port.w}px" style:height="{port.h}px"></div>
</div>

<style>
  .mini {
    position: fixed;
    right: calc(10px + var(--insp, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: 210px;
    height: 142px;
    overflow: hidden;
    border-radius: var(--r-3);
    cursor: pointer;
    touch-action: none;
    animation: mini-in 180ms var(--ease-out);
  }
  canvas {
    display: block;
  }
  .port {
    position: absolute;
    left: 0;
    top: 0;
    border: 1.5px solid var(--accent);
    border-radius: 3px;
    background: var(--accent-soft);
    pointer-events: none;
  }
  @keyframes mini-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (max-width: 1100px) {
    .mini {
      bottom: calc(70px + env(safe-area-inset-bottom, 0px));
    }
  }
  @media (max-width: 640px) {
    .mini {
      top: 60px;
      bottom: auto;
      right: 8px;
      transform: scale(0.8);
      transform-origin: top right;
    }
  }
</style>
