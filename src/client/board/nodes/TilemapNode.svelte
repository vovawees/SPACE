<script lang="ts">
  /* Карта уровня: клетки местности (трава, вода, стены…) и предметы
     (герой, сундук, враг). У выделенной карты снизу кисть, заливка и
     ластик; рисовать могут все одновременно — каждая клетка хранится
     отдельно. Плитки свои: цвет, эмодзи и название — в настройках. */
  import Brush from "@lucide/svelte/icons/brush";
  import Eraser from "@lucide/svelte/icons/eraser";
  import PaintBucket from "@lucide/svelte/icons/paint-bucket";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss, objectKey, type Tile } from "../model.ts";
  import { fillPatch, isObjectTile, mapCells, mapSize, paintPatch, put, tilesOf } from "./design.ts";
  import { localIn } from "./local.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const size = $derived(mapSize(p));
  const W = $derived(size[0]);
  const H = $derived(size[1]);
  const tiles = $derived(tilesOf(p).filter((t) => t && (t.c || t.e)));
  const byId = $derived(new Map(tiles.map((t) => [t.id, t])));
  const cells = $derived(mapCells(p));
  const live = $derived(!b.readonly && !v.locked);
  const edit = $derived(sel && live);
  const k = $derived(Math.max(0.7, Math.min(1.8, v.w / 520)));
  const S = 10;

  let brush = $state("");
  let mode = $state<"paint" | "fill" | "erase">("paint");
  const cur = $derived(byId.get(brush) ?? tiles.find((t) => !isObjectTile(t)) ?? tiles[0]);
  const base = $derived(p.gb ? byId.get(p.gb) : undefined);
  const legend = $derived(edit || p.leg !== false);

  let cw = $state(0);
  let ch = $state(0);
  let mapEl = $state<HTMLElement>();
  const cell = $derived(Math.max(1, Math.min(cw / W, ch / H)));

  /** Местность — один контур на плитку: меньше элементов на большой карте. */
  const ground = $derived.by(() => {
    const m = new Map<string, string>();
    for (const c of cells.ground) {
      const t = byId.get(c.t);
      if (t?.c) m.set(t.id, (m.get(t.id) ?? "") + `M${c.x * S} ${c.y * S}h${S}v${S}h-${S}z`);
    }
    return [...m].map(([id, d]) => ({ id, d, c: colorCss(byId.get(id)!.c) }));
  });
  /** Эмодзи поверх: предметы и плитки местности со своим значком. */
  const marks = $derived([
    ...cells.ground.map((c) => ({ ...c, e: byId.get(c.t)?.e, top: false })),
    ...cells.things.map((c) => ({ ...c, e: byId.get(c.t)?.e, top: true })),
  ].filter((c) => !!c.e));
  const gridPath = $derived.by(() => {
    let d = "";
    for (let x = 1; x < W; x++) d += `M${x * S} 0V${H * S}`;
    for (let y = 1; y < H; y++) d += `M0 ${y * S}H${W * S}`;
    return d;
  });

  let stroke: { last: string; first: boolean } | null = null;

  function cellAt(e: PointerEvent): [number, number] | null {
    if (!mapEl) return null;
    const pt = localIn(b, v, mapEl, e.clientX, e.clientY);
    const x = Math.floor(pt.x / cell);
    const y = Math.floor(pt.y / cell);
    return x >= 0 && y >= 0 && x < W && y < H ? [x, y] : null;
  }

  function down(e: PointerEvent) {
    if (!edit || e.button !== 0) return;
    e.stopPropagation();
    const c = cellAt(e);
    if (!c) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const tile = mode === "erase" ? null : (cur ?? null);
    if (mode === "fill" && !isObjectTile(tile ?? undefined)) {
      put(b, v.id, fillPatch(p, c[0], c[1], tile));
      return;
    }
    stroke = { last: "", first: true };
    paint(c);
  }
  function move(e: PointerEvent) {
    if (!stroke) return;
    const c = cellAt(e);
    if (c) paint(c);
  }
  function paint([x, y]: [number, number]) {
    if (!stroke) return;
    const key = `${x}:${y}`;
    if (stroke.last === key) return;
    stroke.last = key;
    const tile: Tile | null = mode === "erase" ? null : (cur ?? null);
    // предмет при протягивании только ставится (первый щелчок — ставит или убирает)
    const patch = !stroke.first && tile && isObjectTile(tile) ? { [objectKey(x, y)]: tile.id } : paintPatch(p, x, y, tile);
    stroke.first = false;
    put(b, v.id, patch);
  }
  const end = () => (stroke = null);

  function pick(e: MouseEvent, t: Tile) {
    e.stopPropagation();
    brush = t.id;
    if (mode === "erase") mode = "paint";
  }
  function setMode(e: MouseEvent, m: typeof mode) {
    e.stopPropagation();
    mode = m;
  }
</script>

<div class="card tm-card" class:edit style:--k={k}>
  <div class="tm-head">
    <span class="tm-title"><TitleEdit {v} placeholder="Карта уровня" /></span>
    <span class="tm-n">{W}×{H}</span>
  </div>
  <div class="tm-stage" bind:clientWidth={cw} bind:clientHeight={ch}>
    {#if cw > 0 && ch > 0}
      <div
        class="tm-map"
        class:paint={edit}
        class:erase={edit && mode === "erase"}
        bind:this={mapEl}
        data-ui={edit ? "" : undefined}
        style:width="{cell * W}px"
        style:height="{cell * H}px"
        onpointerdown={down}
        onpointermove={move}
        onpointerup={end}
        onpointercancel={end}
        role="img"
        aria-label="{p.title || 'Карта уровня'}: {W}×{H}"
      >
        <svg viewBox="0 0 {W * S} {H * S}" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
          <rect class="tm-base" width={W * S} height={H * S} style:fill={base?.c ? colorCss(base.c) : undefined} />
          <g shape-rendering="crispEdges">
            {#each ground as g (g.id)}<path d={g.d} style:fill={g.c} />{/each}
          </g>
          <path class="tm-grid" d={gridPath} />
          {#each marks as m (`${m.top ? "o" : "t"}${m.x}:${m.y}`)}
            <text class="tm-emo" class:low={!m.top} x={m.x * S + S / 2} y={m.y * S + S / 2 + 0.4} font-size={S * 0.74}>{m.e}</text>
          {/each}
        </svg>
      </div>
    {/if}
  </div>
  {#if legend && tiles.length}
    <div class="tm-legend" class:tools={edit}>
      {#if edit}
        <span class="tm-modes" data-ui>
          <button class:on={mode === "paint"} aria-label="Кисть" title="Кисть" onclick={(e) => setMode(e, "paint")}><Brush size={Math.round(14 * k)} /></button>
          <button class:on={mode === "fill"} aria-label="Заливка" title="Заливка области" onclick={(e) => setMode(e, "fill")}><PaintBucket size={Math.round(14 * k)} /></button>
          <button class:on={mode === "erase"} aria-label="Ластик" title="Ластик" onclick={(e) => setMode(e, "erase")}><Eraser size={Math.round(14 * k)} /></button>
        </span>
      {/if}
      {#each tiles as t (t.id)}
        {#if edit}
          <button class="tm-tile" class:on={mode !== "erase" && cur?.id === t.id} data-ui title={t.t} aria-label="Плитка: {t.t}" onclick={(e) => pick(e, t)}>
            <span class="tm-sw" style:background={t.c ? colorCss(t.c) : undefined}>{t.e ?? ""}</span><span class="tm-tl">{t.t}</span>
          </button>
        {:else}
          <span class="tm-tile"><span class="tm-sw" style:background={t.c ? colorCss(t.c) : undefined}>{t.e ?? ""}</span><span class="tm-tl">{t.t}</span></span>
        {/if}
      {/each}
    </div>
  {/if}
</div>
