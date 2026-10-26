<script lang="ts">
  /* Вычисление: сумма, среднее, минимум и т. п. по объектам, от которых
     к нему идут стрелки. Пересчитывается само — у всех одинаково. */
  import { untrack } from "svelte";
  import { plural } from "../../lib/util.ts";
  import { useBoard } from "../board.svelte.ts";
  import { CALC_LABELS } from "../model.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { calcValue, fmtNum, inputsOf } from "./values.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const s = $derived(b.view);
  const p = $derived(v.props);
  const op = $derived(p.op ?? "sum");
  const ins = $derived(inputsOf(s, v));
  const val = $derived(calcValue(s, v));
  const k = $derived(Math.max(0.45, Math.min(v.w / 220, v.h / 130)));
  const unit = $derived(p.unit ? (p.unit === "%" ? "%" : ` ${p.unit}`) : "");
  let bump = $state(0);
  let prev: number | null | undefined;
  $effect(() => {
    const x = val;
    if (prev !== undefined && x !== prev) untrack(() => bump++);
    prev = x;
  });
</script>

<div class="card calc-card" style:--k={k}>
  <div class="calc-title"><TitleEdit {v} placeholder={CALC_LABELS[op]} /></div>
  {#key bump}
    <div class="calc-n" class:pop={bump > 0} class:none={val === null}>{val === null ? "—" : `${fmtNum(val, p.dec)}${unit}`}</div>
  {/key}
  <div class="calc-src">
    {#if ins.length}
      {p.title ? `${CALC_LABELS[op]} · ` : ""}{ins.length} {plural(ins.length, "источник", "источника", "источников")}
    {:else}
      Проведите стрелки сюда
    {/if}
  </div>
</div>
