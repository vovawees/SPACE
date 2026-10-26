<script lang="ts">
  /* Всё временное в координатах мира: предпросмотр создаваемой фигуры
     или линии, штрих пера (свой и чужие), указки, чужие выделения. */
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import { dashArray, inkD, inkPx, shapeD, strokePx, triples } from "../shapes.ts";

  const b = useBoard();
  const ix = b.ix;
  const s = $derived(b.view);
  const create = $derived(ix.create);
  const sw = $derived(strokePx(b.style.stroke));

  /* создаваемая линия — той же геометрией, что и готовая: с привязками,
     маршрутом и наконечниками */
  const line = $derived.by(() => {
    if (create?.kind !== "line") return null;
    const geo = s.previewConnector(create.pts, create.b0, create.b1, create.props);
    const w = strokePx(create.props.stroke);
    return { geo, sw: w, color: colorCss(create.props.color), dash: dashArray(create.props.dash, w) };
  });

  const ink = $derived.by(() => {
    void ix.inkRev;
    const d = ix.ink;
    if (!d || d.pts.length < 3) return null;
    return { d: inkD(triples(d.pts), inkPx(d.size), 1, 1, false), color: colorCss(d.color) };
  });

  const strokes = $derived(
    b.peers
      .filter((p) => p.stroke && p.stroke.pts.length >= 3)
      .map((p) => ({ id: p.clientId, d: inkD(triples(p.stroke!.pts), inkPx(p.stroke!.size), 1, 1, false), color: colorCss(p.stroke!.color) })),
  );

  function pairs(flat: number[]): { x: number; y: number }[] {
    const out = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
    return out;
  }

  const lasers = $derived([
    ...(ix.laser.length > 1 ? [{ id: -1, pts: ix.laser }] : []),
    ...b.peers.filter((p) => p.laser.length >= 4).map((p) => ({ id: p.clientId, pts: pairs(p.laser) })),
  ]);

  const remote = $derived.by(() => {
    const out: { key: string; x: number; y: number; w: number; h: number; color: string }[] = [];
    for (const p of b.peers) {
      for (const id of p.sel.slice(0, 40)) {
        const v = s.get(id);
        if (!v || id === p.editing) continue;
        const r = s.bounds(v);
        out.push({ key: `${p.clientId}:${id}`, ...r, color: p.user.color });
      }
    }
    return out;
  });
</script>

<svg class="fx" width="1" height="1" aria-hidden="true">
  {#each remote as r (r.key)}
    <rect class="peer-sel" x={r.x - 4} y={r.y - 4} width={r.w + 8} height={r.h + 8} rx="10" style:stroke={r.color} vector-effect="non-scaling-stroke" />
  {/each}

  {#if create?.kind === "shape"}
    <path
      class="preview"
      d={shapeD(create.shape, create.rect.x, create.rect.y, create.rect.w, create.rect.h)}
      style:--c={colorCss(b.style.color)}
      style:stroke-width="{sw}px"
      style:fill={b.style.fill === "none" ? "none" : undefined}
    />
  {:else if create?.kind === "frame"}
    <rect class="preview frame" x={create.rect.x} y={create.rect.y} width={create.rect.w} height={create.rect.h} rx="12" vector-effect="non-scaling-stroke" />
  {:else if line}
    <g class="path-svg live" style:--c={line.color}>
      <path class="line" d={line.geo.d} style:stroke-width="{line.sw}px" stroke-dasharray={line.dash} />
      {#each line.geo.heads as h, i (i)}
        {#if h}<path class="head {h.style}" d={h.d} style:stroke-width="{line.sw}px" />{/if}
      {/each}
    </g>
  {/if}

  {#each strokes as st (st.id)}
    <path d={st.d} style:fill={st.color} opacity="0.85" />
  {/each}
  {#if ink}
    <path d={ink.d} style:fill={ink.color} />
  {/if}

  {#each lasers as l (l.id)}
    {#each l.pts as p, i (i)}
      {#if i > 0}
        <line
          class="laser"
          x1={l.pts[i - 1]!.x}
          y1={l.pts[i - 1]!.y}
          x2={p.x}
          y2={p.y}
          vector-effect="non-scaling-stroke"
          style:stroke-width="{1.5 + (4.5 * i) / l.pts.length}px"
          style:opacity={0.15 + (0.85 * i) / l.pts.length}
        />
      {/if}
    {/each}
  {/each}
</svg>
