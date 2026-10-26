<script lang="ts">
  /* Холст свечения в слое мира: двигается вместе с доской бесплатно,
     пересчитывается не чаще ~12 раз в секунду и только при изменениях. */
  import { look } from "../../lib/look.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { computeGlow, type GlowField } from "../glow.ts";
  import { intersects, type Rect } from "../geometry.ts";

  const b = useBoard();
  const cam = b.camera;
  let canvas: HTMLCanvasElement;
  let field = $state.raw<GlowField | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;

  const SKIP = new Set(["frame", "path", "ink", "text"]);

  function tint(): { rgb: [number, number, number]; cap: number } {
    const cs = getComputedStyle(document.documentElement);
    const parts = cs.getPropertyValue("--glow").trim().split(/\s+/).map(Number);
    const cap = Number(cs.getPropertyValue("--glow-cap")) || 0.07;
    return { rgb: [parts[0] ?? 255, parts[1] ?? 250, parts[2] ?? 240], cap };
  }

  // зависимости: состав, геометрия карточек в зоне вида, оформление
  let lastRects: Rect[] = [];
  const rects = $derived.by(() => {
    // пока камера движется, свечение не пересчитывается: оно в координатах
    // мира и едет вместе с доской
    if (cam.moving) return lastRects;
    const s = b.view;
    const area = cam.cull;
    const out: Rect[] = [];
    for (const v of s.order) {
      if (SKIP.has(v.type)) continue;
      const r = { x: v.x, y: v.y, w: v.w, h: v.H };
      if (intersects(r, { x: area.x - 300, y: area.y - 300, w: area.w + 600, h: area.h + 600 })) out.push(r);
      if (out.length > 1500) return (lastRects = []);
    }
    return (lastRects = out);
  });

  $effect(() => {
    const list = rects;
    if (cam.moving) return;
    const area = cam.cull;
    void look.v;
    const run = () => {
      last = performance.now();
      const t = tint();
      field = computeGlow(list, area, t.rgb, t.cap);
    };
    clearTimeout(timer);
    const wait = Math.max(0, 80 - (performance.now() - last));
    timer = setTimeout(run, wait);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const f = field;
    if (!canvas) return;
    if (!f) {
      canvas.width = canvas.height = 1;
      return;
    }
    canvas.width = f.bw;
    canvas.height = f.bh;
    canvas.getContext("2d")?.putImageData(f.data, 0, 0);
  });
</script>

<canvas
  class="glow-canvas"
  bind:this={canvas}
  style:display={field ? null : "none"}
  style:transform={field ? `translate(${field.x - field.step / 2}px, ${field.y - field.step / 2}px)` : null}
  style:width={field ? `${field.bw * field.step}px` : null}
  style:height={field ? `${field.bh * field.step}px` : null}
></canvas>
