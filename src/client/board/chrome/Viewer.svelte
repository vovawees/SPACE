<script lang="ts">
  /* Просмотр картинок во весь экран: листание стрелками, масштаб колесом
     или двойным щелчком, перетаскивание при увеличении. */
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Download from "@lucide/svelte/icons/download";
  import Locate from "@lucide/svelte/icons/locate";
  import X from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";
  import { bytes, download } from "../../lib/util.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { fileUrl, localPreview } from "../files.ts";

  const b = useBoard();
  const s = $derived(b.view);

  const images = $derived(
    s.order.filter((v) => v.type === "image" && (v.props.src || localPreview.has(v.id))).sort((a, c) => (Math.abs(a.y - c.y) > 40 ? a.y - c.y : a.x - c.x)),
  );
  const index = $derived(Math.max(0, images.findIndex((v) => v.id === b.ui.viewer)));
  const cur = $derived(images[index]);

  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let loaded = $state(false);
  let stage = $state<HTMLDivElement>();

  $effect(() => {
    void cur?.id;
    scale = 1;
    tx = ty = 0;
    loaded = false;
  });

  $effect(() => {
    if (!cur) b.ui.viewer = null;
  });

  function go(d: number) {
    if (images.length < 2) return;
    const next = images[(index + d + images.length) % images.length]!;
    b.ui.viewer = next.id;
  }

  function close() {
    b.ui.viewer = null;
  }

  function locate() {
    if (!cur) return;
    const v = cur;
    close();
    s.selection.set([v.id]);
    b.camera.fit(s.bounds(v), { maxZoom: 1.5 });
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
    else if (e.key === "0") scale = 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function zoomBy(k: number, cx?: number, cy?: number) {
    const r = stage?.getBoundingClientRect();
    if (!r) return;
    const ox = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2);
    const oy = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    const ns = Math.min(12, Math.max(1, scale * k));
    const f = ns / scale;
    tx = ox - (ox - tx) * f;
    ty = oy - (oy - ty) * f;
    scale = ns;
    if (scale === 1) tx = ty = 0;
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX, e.clientY);
  }

  let drag: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (scale > 1) {
      tx = drag.tx + dx;
      ty = drag.ty + dy;
    }
  }
  function up(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (!d || d.moved) return;
    // щелчок мимо картинки при обычном масштабе — закрыть
    if (scale === 1 && !(e.target as Element).closest("img")) close();
  }
  function dbl(e: MouseEvent) {
    if (scale > 1) {
      scale = 1;
      tx = ty = 0;
    } else zoomBy(2.5, e.clientX, e.clientY);
  }

  const full = $derived(cur ? fileUrl(cur.props.src) || localPreview.get(cur.id) || "" : "");
  const low = $derived(cur ? (cur.props.preview ? fileUrl(cur.props.preview) : localPreview.get(cur.id)) || "" : "");

  let box = $state<HTMLDivElement>();
  onMount(() => box?.focus());
</script>

<div class="viewer" role="dialog" aria-modal="true" aria-label="Просмотр картинки" tabindex="-1" bind:this={box} onkeydown={onkey}>
  {#if cur}
    <div class="top">
      <div class="info">
        <div class="name">{cur.props.name || "Картинка"}</div>
        <div class="meta">
          {#if cur.props.natW && cur.props.natH}{cur.props.natW} × {cur.props.natH}{/if}
          {#if cur.props.bytes} · {bytes(cur.props.bytes)}{/if}
          {#if images.length > 1} · {index + 1} из {images.length}{/if}
        </div>
      </div>
      <button class="vbtn" aria-label="Показать на доске" onclick={locate} {@attach tip("Показать на доске", undefined, "bottom")}><Locate size={18} /></button>
      {#if cur.props.src}
        <button class="vbtn" aria-label="Скачать" onclick={() => download(fileUrl(cur.props.src, { dl: true, name: cur.props.name }), cur.props.name || "image")} {@attach tip("Скачать", undefined, "bottom")}>
          <Download size={18} />
        </button>
      {/if}
      <button class="vbtn" aria-label="Закрыть" onclick={close} {@attach tip("Закрыть", "Esc", "bottom")}><X size={20} /></button>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="stage"
      class:zoomed={scale > 1}
      bind:this={stage}
      onwheel={onwheel}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      ondblclick={dbl}
    >
      {#key cur.id}
        {#if low && !loaded}
          <img class="img low" src={low} alt="" draggable="false" style:transform="translate({tx}px, {ty}px) scale({scale})" />
        {/if}
        <img
          class="img"
          class:hidden={!loaded && !!low}
          src={full}
          alt={cur.props.name || ""}
          draggable="false"
          onload={() => (loaded = true)}
          style:transform="translate({tx}px, {ty}px) scale({scale})"
        />
      {/key}
    </div>

    {#if images.length > 1}
      <button class="nav prev" aria-label="Предыдущая" onclick={() => go(-1)}><ChevronLeft size={26} /></button>
      <button class="nav next" aria-label="Следующая" onclick={() => go(1)}><ChevronRight size={26} /></button>
    {/if}
  {/if}
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    background: rgb(8 8 9 / 0.94);
    color: #f1f0ed;
    outline: none;
    animation: v-in 160ms ease-out;
    touch-action: none;
  }
  @keyframes v-in {
    from {
      opacity: 0;
    }
  }
  .top {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 12px 10px 18px;
    background: linear-gradient(rgb(0 0 0 / 0.5), transparent);
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: 12px;
    color: rgb(255 255 255 / 0.55);
    font-variant-numeric: tabular-nums;
  }
  .vbtn {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--r-2);
    color: rgb(255 255 255 / 0.8);
  }
  .vbtn:hover {
    background: rgb(255 255 255 / 0.1);
    color: #fff;
  }
  .stage {
    position: absolute;
    inset: 60px 24px 24px;
    display: grid;
    place-items: center;
    overflow: hidden;
    cursor: zoom-in;
  }
  .stage.zoomed {
    cursor: grab;
  }
  .img {
    grid-area: 1 / 1;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    transform-origin: 50% 50%;
    border-radius: 4px;
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.5);
  }
  .img.low {
    filter: blur(0.5px);
  }
  .img.hidden {
    opacity: 0;
  }
  .nav {
    position: absolute;
    top: 50%;
    z-index: 2;
    width: 46px;
    height: 46px;
    margin-top: -23px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgb(255 255 255 / 0.08);
    transition: background var(--t-fast);
  }
  .nav:hover {
    background: rgb(255 255 255 / 0.16);
  }
  .prev {
    left: 14px;
  }
  .next {
    right: 14px;
  }
  @media (max-width: 640px) {
    .stage {
      inset: 56px 0 0;
    }
    .nav {
      top: auto;
      bottom: 20px;
    }
  }
</style>
