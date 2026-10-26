<script lang="ts">
  /* Логический блок: «И», «ИЛИ», «НЕ», «только один» над объектами, от
     которых идут стрелки (задачи, переключатели, прогресс…). Его итог
     сам может включать и выключать другие объекты. */
  import { useBoard } from "../board.svelte.ts";
  import { GATE_LABELS, type GateMode } from "../model.ts";
  import type { NodeCompProps } from "./types.ts";
  import { inputsOf, isOn } from "./values.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const s = $derived(b.view);
  const p = $derived(v.props);
  const gm = $derived<GateMode>(p.gm ?? "and");
  const on = $derived(!!p.on);
  const ins = $derived(inputsOf(s, v));
  const lit = $derived(ins.filter((x) => isOn(s, x)).length);
  const k = $derived(Math.max(0.45, Math.min(v.w / 150, v.h / 110)));
  const SHORT: Record<GateMode, string> = { and: "И", or: "ИЛИ", not: "НЕ", xor: "XOR" };
  const ORDER: GateMode[] = ["and", "or", "not", "xor"];

  function cycle(e: MouseEvent) {
    e.stopPropagation();
    if (b.readonly) return;
    const next = ORDER[(ORDER.indexOf(gm) + 1) % ORDER.length]!;
    b.view.update(v.id, { gm: next });
    queueMicrotask(() => b.logic.refresh(v.id));
  }
</script>

<div class="card gate-card" class:on style:--k={k}>
  <button class="gate-mode" data-ui disabled={b.readonly} onclick={cycle} title="{GATE_LABELS[gm]} — щёлкните, чтобы сменить">{SHORT[gm]}</button>
  <span class="gate-lamp" aria-label={on ? "Да" : "Нет"}></span>
  <span class="gate-info">{on ? "Да" : "Нет"} · {lit}/{ins.length}</span>
</div>
