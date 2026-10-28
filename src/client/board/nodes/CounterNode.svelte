<script lang="ts">
  /* Счётчик: очки в игре, голоса, ресурсы. Кнопки работают сразу, без
     выделения; щелчок по числу — ввести значение. */
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import { untrack } from "svelte";
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import { counterAdd, counterBounds, counterSet, counterValue } from "./games.ts";
  import { playSound } from "./sound.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const total = $derived(counterValue(p));
  const step = $derived(p.step ?? 1);
  const bounds = $derived(counterBounds(p));
  const k = $derived(Math.max(0.45, Math.min(v.w / 200, v.h / 150)));
  const renaming = $derived(b.ix.renaming === v.id);
  let typing = $state(false);
  let bumpDir = $state(0);
  let bumpKey = $state(0);

  function bump(e: MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    if (b.readonly) return;
    if (counterAdd(b, v, dir * step * (e.shiftKey ? 10 : 1))) playSound("click");
  }

  // число «подпрыгивает» при любом изменении — и своём, и чужом
  let prev: number | null = null;
  $effect(() => {
    const t = total;
    if (prev !== null && t !== prev) {
      bumpDir = t > prev ? 1 : -1;
      untrack(() => bumpKey++);
    }
    prev = t;
  });

  function startTyping(e: MouseEvent) {
    if (b.readonly || !sel) return;
    e.stopPropagation();
    typing = true;
  }

  function commitValue(e: Event) {
    if (!typing) return;
    typing = false;
    const raw = (e.currentTarget as HTMLInputElement).value.replace(",", ".").trim();
    const n = Number(raw);
    if (raw && Number.isFinite(n) && n !== total) counterSet(b, [v.id], n);
  }

  function commitTitle(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.trim();
    if (b.ix.renaming !== v.id) return;
    b.ix.renaming = null;
    if (val !== (p.title ?? "")) b.view.update(v.id, { title: val || undefined });
  }

  function onkey(e: KeyboardEvent, commit: (e: Event) => void) {
    e.stopPropagation();
    if (e.key === "Enter") commit(e);
    if (e.key === "Escape") {
      typing = false;
      b.ix.renaming = null;
    }
  }

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }));
</script>

<div class="card counter-card" style:--k={k}>
  <div class="counter-title">
    {#if renaming}
      <input class="rename" data-ui value={p.title ?? ""} placeholder="Счёт" {@attach focusSelect} onblur={commitTitle} onkeydown={(e) => onkey(e, commitTitle)} />
    {:else}
      {p.title || "Счёт"}
    {/if}
  </div>
  <div class="counter-row">
    <button class="counter-btn" data-ui disabled={b.readonly || total <= bounds[0]} aria-label="Минус {step}" onclick={(e) => bump(e, -1)}><Minus size={20} strokeWidth={2.4} /></button>
    {#if typing}
      <input class="counter-input" data-ui inputmode="decimal" value={fmt(total)} {@attach focusSelect} onblur={commitValue} onkeydown={(e) => onkey(e, commitValue)} />
    {:else}
      {#key bumpKey}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="counter-n" class:up={bumpKey > 0 && bumpDir > 0} class:down={bumpKey > 0 && bumpDir < 0} ondblclick={startTyping} title={sel && !b.readonly ? "Двойной щелчок — ввести число" : undefined}>
          {fmt(total)}
        </div>
      {/key}
    {/if}
    <button class="counter-btn" data-ui disabled={b.readonly || total >= bounds[1]} aria-label="Плюс {step}" onclick={(e) => bump(e, 1)}><Plus size={20} strokeWidth={2.4} /></button>
  </div>
  {#if p.unit || step !== 1 || Number.isFinite(bounds[0]) || Number.isFinite(bounds[1])}
    <div class="counter-step">
      {#if p.unit}<span class="counter-unit">{p.unit}</span>{/if}
      {#if step !== 1}<span>шаг {fmt(step)}</span>{/if}
      {#if Number.isFinite(bounds[0]) || Number.isFinite(bounds[1])}
        <span>{Number.isFinite(bounds[0]) ? fmt(bounds[0]) : "−∞"}…{Number.isFinite(bounds[1]) ? fmt(bounds[1]) : "∞"}</span>
      {/if}
    </div>
  {/if}
</div>
