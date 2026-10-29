<script lang="ts">
  /* Холст доски: сетка, мир с узлами (DOM), дальний план (canvas),
     эффекты и экранный слой ручек. Узлы вне экрана (с запасом) не
     рендерятся; при сильном отдалении DOM заменяется одной картинкой. */
  import { onMount, untrack } from "svelte";
  import { session } from "../../lib/session.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { intersects } from "../geometry.ts";
  import type { NodeView } from "../store.svelte.ts";
  import Glow from "./Glow.svelte";
  import NodeHost from "./NodeHost.svelte";
  import Overlay from "./Overlay.svelte";
  import Presence from "./Presence.svelte";
  import Scene from "./Scene.svelte";
  import WorldFx from "./WorldFx.svelte";

  const b = useBoard();
  const cam = b.camera;
  const ix = b.ix;
  const s = $derived(b.view);
  const far = $derived(b.lod === "far");

  let root = $state<HTMLDivElement>();

  onMount(() => {
    const el = root!;
    const off = ix.attach(el);
    const ro = new ResizeObserver(() => {
      cam.resize(el.clientWidth, el.clientHeight);
      ix.measure();
    });
    ro.observe(el);
    cam.resize(el.clientWidth, el.clientHeight);
    return () => {
      ro.disconnect();
      off();
    };
  });

  /* ------------------------------ видимые узлы ------------------------------ */

  let prevFrames: NodeView[] = [];
  let prevNodes: NodeView[] = [];

  function same(a: NodeView[], b: NodeView[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* Рамки — отдельным слоем под всеми остальными узлами. Массивы
     переиспользуются, если состав не изменился: тогда {#each} не трогается. */
  const layers = $derived.by(() => {
    const c = cam.cull;
    const editing = s.editing;
    const live = b.live;
    const frames: NodeView[] = [];
    const nodes: NodeView[] = [];
    for (const v of s.order) {
      const keep = v.id === editing || v.transient || live.has(v.id) || (!far && intersects(c, s.bounds(v)));
      if (!keep) continue;
      if (v.type === "frame") frames.push(v);
      else nodes.push(v);
    }
    const sorted = s.layerFrames(frames);
    if (!same(sorted, prevFrames)) prevFrames = sorted;
    if (!same(nodes, prevNodes)) prevNodes = nodes;
    return { frames: prevFrames, nodes: prevNodes };
  });
  const frames = $derived(layers.frames);

  // удалённые узлы (в том числе чужими руками) больше не «играют»
  $effect(() => {
    void s.rev;
    untrack(() => {
      for (const id of b.live) if (!b.store.get(id)) b.live.delete(id);
    });
  });

  /* Постепенное появление: если в зону отрисовки разом попадает много узлов
     (сильное отдаление, прыжок камеры), они монтируются порциями по кадрам —
     ближние к центру первыми, а пока не все на месте, под ними виден
     упрощённый холст. Иначе один кадр занимал бы сотни миллисекунд. */
  const BATCH = 80;
  const admitted = new Set<string>();
  let admitRev = $state(0);
  let pending = $state(false);
  let admitRaf = 0;

  function admit() {
    admitRaf = 0;
    const target = layers.nodes;
    const ids = new Set<string>();
    for (const v of target) ids.add(v.id);
    for (const id of admitted) if (!ids.has(id)) admitted.delete(id);
    let missing = target.filter((v) => !admitted.has(v.id));
    if (missing.length > BATCH) {
      const c = cam.toWorld(cam.vw / 2, cam.vh / 2);
      const d = (v: NodeView) => (v.x + v.w / 2 - c.x) ** 2 + (v.y + v.h / 2 - c.y) ** 2;
      missing = missing.sort((p, q) => d(p) - d(q)).slice(0, BATCH);
      admitRaf = requestAnimationFrame(admit);
    }
    for (const v of missing) admitted.add(v.id);
    pending = admitRaf !== 0;
    admitRev++;
  }

  $effect(() => {
    void layers.nodes;
    // порция уже запланирована — она возьмёт свежий список
    untrack(() => admitRaf || admit());
  });
  onMount(() => () => cancelAnimationFrame(admitRaf));

  let prevShown: NodeView[] = [];
  const nodes = $derived.by(() => {
    void admitRev;
    const editing = s.editing;
    const out = layers.nodes.filter((v) => admitted.has(v.id) || v.id === editing || v.transient || b.live.has(v.id));
    if (!same(out, prevShown)) prevShown = out;
    return prevShown;
  });

  /* 1/масштаб для «экранных» толщин и подписей. Пока камера движется —
     ступенями по 8 %: смена переменной пересчитывает стили всего мира. */
  const iz = $derived(cam.moving ? Math.pow(1.08, Math.round(Math.log(1 / cam.z) / Math.log(1.08))) : 1 / cam.z);

  /* Кто что редактирует — строкой, чтобы движение чужих курсоров не
     пересчитывало все узлы. */
  const editKey = $derived(
    b.peers
      .filter((p) => p.editing)
      .map((p) => `${p.editing}\u0001${p.user.color}`)
      .sort()
      .join("\u0002"),
  );
  const remoteEdit = $derived(new Map(editKey ? editKey.split("\u0002").map((x) => x.split("\u0001") as [string, string]) : []));

  /* --------------------------------- сетка --------------------------------- */

  const grid = $derived.by(() => {
    let m = 24 * cam.z;
    while (m < 14) m *= 4;
    while (m >= 56) m /= 4;
    const M = m * 4;
    const ox = (((cam.x % M) + M) % M) - M;
    const oy = (((cam.y % M) + M) % M) - M;
    return { m, M, ox, oy, fine: Math.min(1, Math.max(0, (m - 14) / 22)) };
  });

  /* -------------------------------- курсор -------------------------------- */

  const cursor = $derived.by(() => {
    if (ix.kind === "pan") return "grabbing";
    if (b.spaceDown || b.tool === "hand") return "grab";
    if (b.readonly) return b.tool === "laser" ? "laser" : "default";
    switch (b.tool) {
      case "draw":
      case "pen":
        return "draw";
      case "eraser":
        return "erase";
      case "laser":
        return "laser";
      case "text":
        return "text";
      case "note":
      case "code":
      case "shape":
      case "frame":
      case "arrow":
      case "line":
        return "crosshair";
      default:
        return "default";
    }
  });

  const empty = $derived(s.order.length === 0 && (b.synced || b.localReady) && !b.preview);
  const loading = $derived(!b.synced && !b.localReady);
</script>

<div
  bind:this={root}
  class="board"
  class:mid={b.lod === "mid"}
  class:far
  class:busy={ix.busy}
  class:readonly={b.readonly}
  data-cursor={cursor}
  data-grid={session.settings.gridStyle}
  role="application"
  aria-label="Доска"
>
  {#if session.settings.grid}
    <div
      class="grid"
      style:opacity={grid.fine}
      style:width="{cam.vw + grid.M * 2}px"
      style:height="{cam.vh + grid.M * 2}px"
      style:transform="translate3d({grid.ox}px,{grid.oy}px,0)"
      style:--m="{grid.m}px"
    ></div>
    <div
      class="grid major"
      style:width="{cam.vw + grid.M * 2}px"
      style:height="{cam.vh + grid.M * 2}px"
      style:transform="translate3d({grid.ox}px,{grid.oy}px,0)"
      style:--m="{grid.M}px"
    ></div>
  {/if}

  {#if far || pending}
    <Scene />
  {/if}

  <div
    class="world"
    class:moving={cam.moving}
    class:multi={s.selection.size > 1}
    style:transform="translate3d({cam.x}px,{cam.y}px,0) scale({cam.z})"
    style:--iz={iz}
  >
    {#if session.settings.glow && !far}
      <Glow />
    {/if}
    <div class="layer frames">
      {#each frames as v (v.id)}
        <NodeHost {v} remote={remoteEdit.get(v.id)} />
      {/each}
    </div>
    <div class="layer nodes">
      {#each nodes as v (v.id)}
        <NodeHost {v} remote={remoteEdit.get(v.id)} />
      {/each}
    </div>
    <WorldFx />
  </div>

  <Presence />
  <Overlay />

  {#if loading}
    <div class="hint loading"><div class="spin"></div></div>
  {:else if empty}
    <div class="hint">
      <div class="hint-card">
        <div class="hint-title">Пустое пространство</div>
        {#if b.readonly}
          <div class="hint-text">Здесь пока ничего нет.</div>
        {:else}
          <div class="hint-text">Дважды щёлкните, чтобы написать заметку, или перетащите сюда файлы, картинки и ссылки.</div>
          <div class="hint-keys">
            <span><span class="kbd"><span>N</span></span> заметка</span>
            <span><span class="kbd"><span>D</span></span> рисовать</span>
            <span><span class="kbd"><span>A</span></span> стрелка</span>
            <span><span class="kbd"><span>Ctrl</span><span>K</span></span> команды</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if ix.dragOver}
    <div class="dropzone">
      <div class="dropzone-label">Отпустите — файлы появятся здесь</div>
    </div>
  {/if}
</div>

<style>
  .board.far .grid:not(.major) {
    display: none;
  }
  .hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    padding: 24px;
  }
  .hint.loading {
    opacity: 0.6;
  }
  .hint-card {
    max-width: 400px;
    text-align: center;
    display: grid;
    gap: 10px;
    animation: hint-in 400ms var(--ease-out) both;
  }
  .hint-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink-2);
    letter-spacing: -0.01em;
  }
  .hint-text {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--ink-3);
  }
  .hint-keys {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 14px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--ink-3);
  }
  .hint-keys > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  @keyframes hint-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .dropzone {
    position: absolute;
    inset: 10px;
    border: 2px dashed var(--accent-line);
    border-radius: var(--r-4);
    background: color-mix(in oklab, var(--accent) 6%, transparent);
    display: grid;
    place-items: center;
    pointer-events: none;
    animation: hint-in 160ms var(--ease-out) both;
  }
  .dropzone-label {
    padding: 10px 16px;
    border-radius: var(--r-full);
    background: var(--glass);
    backdrop-filter: blur(12px);
    box-shadow: var(--shadow-2);
    font-size: 13.5px;
    font-weight: 540;
    color: var(--ink);
  }
  @media (pointer: coarse) {
    .hint-keys {
      display: none;
    }
  }
</style>
