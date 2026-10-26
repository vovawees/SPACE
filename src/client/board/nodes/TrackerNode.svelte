<script lang="ts">
  /* Трекер привычек и этапов: клетки, которые отмечает любой участник
     (дни недели, шаги квеста, раунды). Заполнили всё — стрелки с логикой
     могут наградить салютом или прибавить очки. */
  import Check from "@lucide/svelte/icons/check";
  import { useBoard } from "../board.svelte.ts";
  import { markKey } from "../model.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { marksOf } from "./values.ts";
  import { cellsOf, toggleMark } from "./widgets.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const n = $derived(cellsOf(v));
  const done = $derived(marksOf(p));
  const full = $derived(done >= n);
  const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const W = $derived(Math.max(40, v.w - 24));
  const H = $derived(Math.max(24, v.h - 24 - 28));
  const gap = 6;
  // столько столбцов, чтобы клетки вышли крупнее
  const layout = $derived.by(() => {
    let best = { c: n, s: 0 };
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const s = Math.min((W - (c - 1) * gap) / c, (H - (r - 1) * gap) / r);
      if (s > best.s) best = { c, s };
    }
    return { c: best.c, s: Math.max(14, Math.min(72, best.s)) };
  });
  const streak = $derived.by(() => {
    let run = 0;
    let bestRun = 0;
    for (let i = 0; i < n; i++) {
      if ((p as Record<string, unknown>)[markKey(i)]) bestRun = Math.max(bestRun, ++run);
      else run = 0;
    }
    return bestRun;
  });

  function hit(e: MouseEvent, i: number) {
    e.stopPropagation();
    toggleMark(b, v, i);
  }
</script>

<div class="card tr-card" class:full style:--cs="{layout.s}px">
  <div class="tr-head">
    <span class="tr-title"><TitleEdit {v} placeholder="Трекер" /></span>
    <span class="tr-n">{full ? "Готово! 🎉" : `${done} / ${n}`}{#if streak > 1 && !full}<span class="tr-streak" title="Лучшая серия подряд">🔥{streak}</span>{/if}</span>
  </div>
  <div class="tr-grid" style:grid-template-columns="repeat({layout.c}, var(--cs))" data-ui>
    {#each Array.from({ length: n }, (_, i) => i) as i (i)}
      {@const on = !!(p as Record<string, unknown>)[markKey(i)]}
      <button class="tr-cell" class:on disabled={b.readonly} aria-pressed={on} aria-label="Клетка {i + 1}" onclick={(e) => hit(e, i)}>
        {#if on}<Check size={Math.round(layout.s * 0.5)} strokeWidth={3} />{:else}<span>{n === 7 ? DAYS[i] : i + 1}</span>{/if}
      </button>
    {/each}
  </div>
</div>
