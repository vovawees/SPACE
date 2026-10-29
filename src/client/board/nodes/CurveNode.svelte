<script lang="ts">
  /* Кривая баланса: графики формул от x (уровень, волна, минута) — опыт до
     уровня, урон, цены, сложность. Формулы пишутся по-человечески:
     100 * x^1.5, 50 + 10x, round(…). Стрелка от ползунка или счётчика
     задаёт x: точка на кривой и значение видны сразу. Наведение — значения
     в любой точке; таблица значений — по желанию. */
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import { curveInput, curveRange, curveSeries } from "./design.ts";
  import { compile, niceTicks, shortNum } from "./formula.ts";
  import { localIn } from "./local.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const k = $derived(Math.max(0.7, Math.min(1.8, v.w / 420)));
  const PALETTE = ["violet", "orange", "cyan", "green", "pink", "yellow"];
  const series = $derived(
    curveSeries(p)
      .slice(0, 6)
      .map((s, i) => ({ ...s, fn: compile(s.f), color: colorCss(s.c ?? PALETTE[i % PALETTE.length]) })),
  );
  const range = $derived(curveRange(p));
  const log = $derived(p.ys === "log");
  const input = $derived(curveInput(b.view, v));
  /** Целые x (уровни): точки на кривой и наведение по целым. */
  const ints = $derived(Number.isInteger(range[0]) && Number.isInteger(range[1]));
  const errs = $derived(series.filter((s) => !s.fn.ok));

  let pw = $state(0);
  let ph = $state(0);
  let plot = $state<HTMLElement>();
  let hx = $state<number | null>(null);

  const L = $derived(Math.round(40 * k));
  const R = $derived(Math.round(10 * k));
  const T = $derived(Math.round(8 * k));
  const B = $derived(Math.round(18 * k));
  const iw = $derived(Math.max(10, pw - L - R));
  const ih = $derived(Math.max(10, ph - T - B));

  const ys = (fn: (typeof series)[number]["fn"], x: number) => (fn.ok ? fn.at(x) : NaN);
  const usable = (y: number) => Number.isFinite(y) && (!log || y > 0);

  const samples = $derived.by(() => {
    const [a, c] = range;
    const n = Math.max(24, Math.min(240, Math.round(iw / 3)));
    const xs = Array.from({ length: n + 1 }, (_, i) => a + ((c - a) * i) / n);
    if (ints && c - a <= 400) for (let x = a; x <= c; x++) xs.push(x);
    xs.sort((m, q) => m - q);
    return series.map((s) => xs.map((x) => [x, ys(s.fn, x)] as const));
  });

  const ydom = $derived.by<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const list of samples)
      for (const [, y] of list)
        if (usable(y)) {
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
    if (lo === Infinity) return log ? [1, 10] : [0, 1];
    if (log) {
      const a = Math.floor(Math.log10(lo));
      return [10 ** a, 10 ** Math.max(a + 1, Math.ceil(Math.log10(hi)))];
    }
    if (hi - lo < 1e-9) {
      const d = Math.abs(lo) * 0.5 || 1;
      const pos = lo >= 0;
      lo -= d;
      hi += d;
      if (pos && lo < 0) lo = 0;
    }
    if (lo > 0 && lo < hi * 0.6) lo = 0;
    if (hi < 0 && hi > lo * 0.6) hi = 0;
    const t = niceTicks(lo, hi, 4);
    const step = t.length > 1 ? t[1]! - t[0]! : hi - lo;
    return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
  });

  const sx = (x: number) => L + ((x - range[0]) / (range[1] - range[0])) * iw;
  function sy(y: number): number {
    const [lo, hi] = ydom;
    const t = log ? (Math.log10(y) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) : (y - lo) / (hi - lo || 1);
    return T + ih - Math.max(-2, Math.min(3, t)) * ih;
  }

  const paths = $derived(
    samples.map((list) => {
      let d = "";
      let pen = false;
      for (const [x, y] of list) {
        if (!usable(y)) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
        pen = true;
      }
      return d;
    }),
  );

  const xticks = $derived.by(() => {
    const t = niceTicks(range[0], range[1], Math.max(2, Math.round(iw / (64 * k))));
    return ints ? t.filter((x) => Number.isInteger(x)) : t;
  });
  const yticks = $derived.by(() => {
    const [lo, hi] = ydom;
    if (!log) return niceTicks(lo, hi, Math.max(2, Math.round(ih / (34 * k))));
    const out: number[] = [];
    for (let e = Math.round(Math.log10(lo)); e <= Math.round(Math.log10(hi)); e++) out.push(10 ** e);
    return out;
  });

  /** Точки на целых x (уровнях), если их немного. */
  const dots = $derived.by(() => {
    if (!ints || range[1] - range[0] > 40 || iw / (range[1] - range[0] + 1) < 7) return [];
    const out: { x: number; y: number; c: string }[] = [];
    for (const s of series)
      for (let x = range[0]; x <= range[1]; x++) {
        const y = ys(s.fn, x);
        if (usable(y)) out.push({ x: sx(x), y: sy(y), c: s.color });
      }
    return out;
  });

  const at = $derived(hx ?? (input !== null && input >= range[0] && input <= range[1] ? input : null));
  const atVals = $derived(at === null ? [] : series.map((s) => ({ s, y: ys(s.fn, at) })));
  const name = (s: (typeof series)[number], i: number) => s.t?.trim() || (series.length > 1 ? `Кривая ${i + 1}` : "y");

  /** Значения для таблицы: все уровни или ровные отметки шкалы. */
  const table = $derived.by(() => {
    if (!p.tb) return [];
    const [a, c] = range;
    if (ints && c - a <= 11) return Array.from({ length: c - a + 1 }, (_, i) => a + i);
    const t = niceTicks(a, c, 7);
    return (ints ? t.filter((x) => Number.isInteger(x)) : t).slice(0, 10);
  });

  function hover(e: PointerEvent) {
    if (!plot || e.pointerType === "touch") return;
    const pt = localIn(b, v, plot, e.clientX, e.clientY);
    const t = (pt.x - L) / iw;
    if (t < -0.03 || t > 1.03 || pt.y < 0 || pt.y > ph) return (hx = null);
    const x = range[0] + Math.max(0, Math.min(1, t)) * (range[1] - range[0]);
    hx = ints ? Math.round(x) : x;
  }
  const xl = (x: number) => (ints ? String(Math.round(x)) : shortNum(x));
</script>

<div class="card cv-card" style:--k={k}>
  <div class="cv-head">
    <span class="cv-title"><TitleEdit {v} placeholder="Кривая баланса" /></span>
    {#if input !== null && series[0]?.fn.ok}
      <span class="cv-n" title="Значение при x со входящей стрелки">x = {xl(input)} → <b>{shortNum(ys(series[0].fn, input))}</b></span>
    {/if}
  </div>
  <div class="cv-plot" bind:this={plot} bind:clientWidth={pw} bind:clientHeight={ph} onpointermove={hover} onpointerleave={() => (hx = null)} role="img" aria-label={p.title || "Кривая баланса"}>
    {#if pw > 0 && ph > 0}
      <svg width={pw} height={ph} viewBox="0 0 {pw} {ph}" aria-hidden="true">
        {#each yticks as t (t)}
          <line class="cv-grid" x1={L} x2={L + iw} y1={sy(t)} y2={sy(t)} />
          <text class="cv-tick" x={L - 5 * k} y={sy(t)} text-anchor="end" dominant-baseline="middle">{shortNum(t)}</text>
        {/each}
        {#each xticks as t (t)}
          <text class="cv-tick" x={sx(t)} y={T + ih + 13 * k} text-anchor="middle">{xl(t)}</text>
        {/each}
        <line class="cv-axis" x1={L} x2={L + iw} y1={T + ih} y2={T + ih} />
        {#if input !== null && input >= range[0] && input <= range[1]}
          <line class="cv-input" x1={sx(input)} x2={sx(input)} y1={T} y2={T + ih} />
        {/if}
        {#each paths as d, i (i)}
          {#if d}<path class="cv-line" {d} style:stroke={series[i]!.color} />{/if}
        {/each}
        {#each dots as d, i (i)}<circle class="cv-dot" cx={d.x} cy={d.y} r={2.4 * k} style:fill={d.c} />{/each}
        {#if at !== null}
          {#if hx !== null}<line class="cv-hover" x1={sx(at)} x2={sx(at)} y1={T} y2={T + ih} />{/if}
          {#each atVals as a, i (i)}
            {#if usable(a.y)}<circle class="cv-at" cx={sx(at)} cy={sy(a.y)} r={4.2 * k} style:stroke={a.s.color} />{/if}
          {/each}
        {/if}
      </svg>
      {#if hx !== null && atVals.length}
        <div class="cv-tip" class:left={sx(hx) > L + iw * 0.6} style:left="{sx(hx)}px" style:top="{T}px">
          <b>x = {xl(hx)}</b>
          {#each atVals as a, i (i)}<span><i style:background={a.s.color}></i>{name(a.s, i)}: {shortNum(a.y)}</span>{/each}
        </div>
      {/if}
    {/if}
  </div>
  {#if series.length}
    <div class="cv-legend">
      {#each series as s, i (s.id)}
        <span class="cv-lg" class:bad={!s.fn.ok} title={s.f}>
          <i style:background={s.color}></i>{name(s, i)} = <code>{s.f}</code>
        </span>
      {/each}
    </div>
  {:else}
    <div class="cv-empty">Добавьте формулу в настройках, например 100 * x^1.5</div>
  {/if}
  {#if errs.length}
    <div class="cv-err">⚠ {errs[0]!.fn.err}</div>
  {/if}
  {#if table.length && series.length}
    <div class="cv-table" style:--cols={table.length}>
      <span class="cv-th">x</span>
      {#each table as x (x)}<span class="cv-th">{xl(x)}</span>{/each}
      {#each series as s, i (s.id)}
        <span class="cv-rh" style:color={s.color}>{name(s, i)}</span>
        {#each table as x (x)}<span>{shortNum(ys(s.fn, x))}</span>{/each}
      {/each}
    </div>
  {/if}
</div>
