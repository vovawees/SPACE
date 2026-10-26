<script lang="ts">
  /* Дальний план: вся доска одним холстом. */
  import { untrack } from "svelte";
  import { look } from "../../lib/look.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { drawScene } from "../scene.ts";

  const b = useBoard();
  const cam = b.camera;
  let canvas: HTMLCanvasElement;
  let rev = $state(0);
  let raf = 0;
  const dpr = Math.min(2, devicePixelRatio || 1);

  const bump = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      rev++;
    });
  };

  // изменения документа (свои и чужие) — перерисовка в следующем кадре
  $effect(() => {
    const doc = b.view.doc;
    doc.on("update", bump);
    return () => doc.off("update", bump);
  });

  /* Отрисовка не подписывается на каждый узел (тысячи сигналов в кадр) —
     только на камеру, состав, документ и геометрию выделенного: его тащат
     локально, до записи в документ. */
  $effect(() => {
    void rev;
    const s = b.view;
    void s.rev;
    for (const id of s.selection.list) {
      const v = s.get(id);
      if (v) void (v.x + v.y + v.w + v.h + v.r), v.props;
    }
    void look.v;
    const w = cam.vw;
    const h = cam.vh;
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const view = { x: cam.x, y: cam.y, z: cam.z, w, h };
    untrack(() => drawScene(ctx, s, view, { dpr, onImage: bump, readonly: b.readonly }));
    return () => cancelAnimationFrame(raf);
  });
</script>

<canvas class="scene-canvas" bind:this={canvas}></canvas>
