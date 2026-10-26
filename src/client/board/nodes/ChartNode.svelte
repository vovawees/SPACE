<script lang="ts">
  /* Диаграмма: столбцы, линия, круг или кольцо. Значения — свои (двойной
     щелчок — таблица значений) и живые: стрелки от счётчиков, прогресса,
     ползунков, задач и других объектов сразу попадают в диаграмму. */
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss, colorKey, type ChartPoint } from "../model.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { fmtNum, hasNumber, inputsOf, nodeTitle, numValue } from "./values.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const s = $derived(b.view);
  const p = $derived(v.props);
  const kind = $derived(p.ct ?? "bar");
  const PALETTE = ["blue", "green", "orange", "violet", "pink", "cyan", "yellow", "red", "gray"];
  const SAMPLE: ChartPoint[] = [
    { l: "Пн", v: 3 },
    { l: "Вт", v: 5 },
    { l: "Ср", v: 4 },
    { l: "Чт", v: 7 },
    { l: "Пт", v: 6 },
  ];

  interface Pt {
    l: string;
    v: number;
    c: string;
    live: boolean;
  }

  const manual = $derived(Array.isArray(p.data) ? p.data : []);
  const tinted = $derived(colorKey(p.color) !== "default");
  const linked = $derived(
    inputsOf(s, v)
      .filter(hasNumber)
      .map((x) => ({ l: nodeTitle(x), v: numValue(s, x) ?? 0, c: colorKey(x.props.color) !== "default" ? String(x.props.color) : "", live: true })),
  );
  const sample = $derived(!manual.length && !linked.length);
  const pts = $derived.by<Pt[]>(() => {
    const src = sample ? SAMPLE.map((d) => ({ ...d, live: false })) : [...manual.map((d) => ({ ...d, live: false })), ...linked];
    const pie = kind === "pie" || kind === "donut";
    return src.map((d, i) => ({
      l: d.l,
      v: Number.isFinite(d.v) ? d.v : 0,
      live: d.live,
      c: d.c ? colorCss(d.c) : pie || !tinted ? colorCss(PALETTE[i % PALETTE.length]) : "var(--c)",
    }));
  });

  const W = $derived(Math.max(60, v.w - 24));
  const H = $derived(Math.max(40, v.h - 24 - 26));
  const total = $derived(pts.reduce((a, x) => a + Math.max(0, x.v), 0));

  /* ------------------------------ столбцы ------------------------------ */
  const bars = $derived.by(() => {
    const n = Math.max(1, pts.length);
    const hi = Math.max(0, ...pts.map((x) => x.v));
    const lo = Math.min(0, ...pts.map((x) => x.v));
    const top = 16;
    const bottom = 18;
    const span = hi - lo || 1;
    const ch = H - top - bottom;
    const zero = top + (hi / span) * ch;
    const slot = W / n;
    const bw = Math.max(4, Math.min(64, slot * 0.66));
    return pts.map((x, i) => {
      const hgt = (Math.abs(x.v) / span) * ch;
      const y = x.v >= 0 ? zero - hgt : zero;
      return { ...x, x: i * slot + (slot - bw) / 2, cx: i * slot + slot / 2, y, w: bw, h: Math.max(x.v ? 1.5 : 0, hgt), zero, ty: x.v >= 0 ? y - 4 : y + hgt + 12 };
    });
  });

  /* ------------------------------- линия ------------------------------- */
  const line = $derived.by(() => {
    const n = pts.length;
    const hi = Math.max(...pts.map((x) => x.v), 0);
    const lo = Math.min(...pts.map((x) => x.v), 0);
    const span = hi - lo || 1;
    const top = 18;
    const bottom = 18;
    const ch = H - top - bottom;
    const pad = 12;
    const xs = (i: number) => (n <= 1 ? W / 2 : pad + (i / (n - 1)) * (W - pad * 2));
    const ys = (val: number) => top + ((hi - val) / span) * ch;
    const dots = pts.map((x, i) => ({ ...x, x: xs(i), y: ys(x.v) }));
    const d = dots.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join("");
    const base = ys(Math.max(lo, 0));
    const area = dots.length ? `${d}L${dots[dots.length - 1]!.x.toFixed(1)} ${base}L${dots[0]!.x.toFixed(1)} ${base}Z` : "";
    return { dots, d, area, base };
  });

  /* ------------------------------ круг ------------------------------ */
  const legend = $derived(W > H * 1.35 && pts.length > 0);
  const R = $derived(Math.max(10, Math.min(H, legend ? W * 0.5 : W) / 2 - 2));
  const pie = $derived.by(() => {
    const cx = legend ? R + 2 : W / 2;
    const cy = H / 2;
    let a = 0;
    const sum = total || 1;
    const out: (Pt & { d: string; pct: number })[] = [];
    for (const x of pts) {
      const share = Math.max(0, x.v) / sum;
      const a1 = a + share * Math.PI * 2;
      out.push({ ...x, pct: Math.round(share * 100), d: share >= 0.9999 ? circle(cx, cy, R) : slice(cx, cy, R, a, a1) });
      a = a1;
    }
    return { cx, cy, items: out };
  });

  function circle(cx: number, cy: number, r: number) {
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  }
  function slice(cx: number, cy: number, r: number, a0: number, a1: number) {
    if (a1 - a0 < 1e-4) return "";
    const p0 = [cx + r * Math.sin(a0), cy - r * Math.cos(a0)];
    const p1 = [cx + r * Math.sin(a1), cy - r * Math.cos(a1)];
    return `M${cx} ${cy}L${p0[0]!.toFixed(2)} ${p0[1]!.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p1[0]!.toFixed(2)} ${p1[1]!.toFixed(2)}Z`;
  }

  const short = (t: string, n = 12) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

  /* ------------------------------ правка ------------------------------ */
  function setData(data: ChartPoint[]) {
    b.view.update(v.id, { data });
  }
  function edit(i: number, patch: Partial<ChartPoint>) {
    setData(manual.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }
  function addRow() {
    setData([...manual, { l: `Значение ${manual.length + 1}`, v: 0 }]);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-id="${v.id}"] [data-row="${manual.length}"]`)?.focus());
  }
  function onkey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) b.ix.stopEditing();
  }
  function cycleColor(i: number) {
    const cur = manual[i]?.c ?? "";
    const k = PALETTE.indexOf(cur);
    edit(i, { c: PALETTE[(k + 1) % PALETTE.length] });
  }
</script>

<div class="card ch-card" class:sample>
  <div class="ch-title">
    <TitleEdit {v} placeholder="Диаграмма" />
    {#if !sample && (kind === "pie" || kind === "donut")}<span class="ch-total">Σ {fmtNum(total)}</span>{/if}
  </div>
  {#if editing && !b.readonly}
    <div class="ch-edit scroll" data-ui>
      {#each manual as d, i (i)}
        <div class="ch-row">
          <button class="ch-dot" style:background={colorCss(d.c || PALETTE[i % PALETTE.length])} onclick={() => cycleColor(i)} aria-label="Сменить цвет"></button>
          <input class="ch-l" data-row={i} value={d.l} placeholder="Подпись" oninput={(e) => edit(i, { l: e.currentTarget.value })} onkeydown={onkey} />
          <input
            class="ch-v"
            type="number"
            step="any"
            value={d.v}
            oninput={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n)) edit(i, { v: n });
            }}
            onkeydown={onkey}
          />
          <button class="icon-btn sm" onclick={() => setData(manual.filter((_, j) => j !== i))} aria-label="Убрать"><X size={13} /></button>
        </div>
      {/each}
      {#each linked as d (d.l)}
        <div class="ch-row live"><span class="ch-dot" style:background={d.c ? colorCss(d.c) : "var(--ink-3)"}></span><span class="ch-l">{d.l}</span><span class="ch-v">{fmtNum(d.v)}</span><span class="ch-tag">⚡</span></div>
      {/each}
      <button class="btn ghost sm" onclick={addRow}><Plus size={14} /> Значение</button>
      <div class="ch-hint">Стрелки от счётчиков, прогресса, ползунков и задач к диаграмме добавляют живые значения.</div>
    </div>
  {:else}
    <svg class="ch-svg" width={W} height={H} viewBox="0 0 {W} {H}" role="img" aria-label={p.title || "Диаграмма"}>
      {#if kind === "bar"}
        <line x1="0" x2={W} y1={bars[0]?.zero ?? H - 18} y2={bars[0]?.zero ?? H - 18} class="ch-axis" />
        {#each bars as r, i (i)}
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(6, r.w / 4)} fill={r.c} class="ch-bar" />
          <text x={r.cx} y={r.ty} class="ch-num">{fmtNum(r.v)}</text>
          <text x={r.cx} y={H - 4} class="ch-lab">{short(r.l, Math.max(3, Math.floor(W / Math.max(1, bars.length) / 7)))}</text>
        {/each}
      {:else if kind === "line"}
        <defs>
          <linearGradient id="chg-{v.id}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="var(--lc)" stop-opacity="0.35" />
            <stop offset="1" stop-color="var(--lc)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={line.base} y2={line.base} class="ch-axis" />
        {#if line.area}<path d={line.area} fill="url(#chg-{v.id})" />{/if}
        <path d={line.d} class="ch-line" />
        {#each line.dots as q, i (i)}
          <circle cx={q.x} cy={q.y} r="3.5" class="ch-pt" />
          <text x={q.x} y={q.y - 8} class="ch-num">{fmtNum(q.v)}</text>
          <text x={q.x} y={H - 4} class="ch-lab">{short(q.l, Math.max(3, Math.floor(W / Math.max(1, line.dots.length) / 7)))}</text>
        {/each}
      {:else}
        {#each pie.items as q, i (i)}
          {#if q.d}<path d={q.d} fill={q.c} class="ch-slice" />{/if}
        {/each}
        {#if kind === "donut"}
          <circle cx={pie.cx} cy={pie.cy} r={R * 0.58} class="ch-hole" />
          <text x={pie.cx} y={pie.cy + 5} class="ch-mid">{fmtNum(total)}</text>
        {/if}
        {#if legend}
          {#each pie.items.slice(0, Math.max(1, Math.floor(H / 18))) as q, i (i)}
            <g transform="translate({R * 2 + 18} {Math.max(10, H / 2 - (Math.min(pie.items.length, Math.floor(H / 18)) * 18) / 2 + i * 18 + 9)})">
              <rect x="0" y="-5" width="10" height="10" rx="3" fill={q.c} />
              <text x="16" y="4" class="ch-leg">{short(q.l, Math.max(4, Math.floor((W - R * 2 - 60) / 7)))} <tspan class="ch-pct">{q.pct}%</tspan></text>
            </g>
          {/each}
        {/if}
      {/if}
    </svg>
    {#if sample}<div class="ch-empty">Двойной щелчок — свои значения, или проведите стрелки от объектов</div>{/if}
  {/if}
</div>
