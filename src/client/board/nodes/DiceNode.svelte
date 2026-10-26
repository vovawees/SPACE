<script lang="ts">
  /* Кубики: бросок виден всем — у всех одинаковый результат и анимация.
     Щелчок по кубикам — бросить. */
  import { useBoard } from "../board.svelte.ts";
  import { PIPS, randInt, rollDice, type Roll } from "./games.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const sides = $derived(p.sides ?? 6);
  const count = $derived(Math.max(1, Math.min(6, p.count ?? 1)));
  const roll = $derived((p.roll as Roll | null | undefined) ?? null);
  const k = $derived(Math.max(0.4, Math.min(v.w / 200, v.h / 170)));
  // до трёх кубиков — в ряд, больше — в два ряда; размер грани по месту
  const cols = $derived(count <= 3 ? count : Math.ceil(count / 2));
  const rows = $derived(count <= 3 ? 1 : 2);
  const gap = $derived(10 * Math.min(1.4, k));
  const die = $derived(Math.max(14, Math.min(96 * k, (v.w - 28 - (cols - 1) * gap) / cols, (v.h - 34 - 22 * k - (rows - 1) * gap) / rows)));

  /* анимация броска: несколько кадров случайных граней, затем итог */
  let shown = $state<number[] | null>(null);
  let rolling = $state(false);
  let lastSeq = -1;
  $effect(() => {
    const r = roll;
    const seq = r?.s ?? 0;
    if (lastSeq === -1 || !r) {
      lastSeq = seq;
      return;
    }
    if (seq === lastSeq) return;
    lastSeq = seq;
    rolling = true;
    let frame = 0;
    const t = setInterval(() => {
      shown = Array.from({ length: r.v.length }, () => randInt(sides));
      if (++frame >= 7) {
        clearInterval(t);
        shown = null;
        rolling = false;
      }
    }, 70);
    return () => clearInterval(t);
  });

  const faces = $derived(shown ?? roll?.v.slice(0, count) ?? Array.from({ length: count }, () => 0));
  const sum = $derived(roll ? roll.v.slice(0, count).reduce((a, x) => a + x, 0) : 0);

  function go(e: MouseEvent) {
    e.stopPropagation();
    rollDice(b, [v.id]);
  }
</script>

<div class="card dice-card" style:--k={k} style:--die="{die}px" style:--cols={cols} style:--gap="{gap}px">
  <button class="dice-row" class:rolling data-ui disabled={b.readonly} aria-label="Бросить кубики" onclick={go}>
    {#each faces as f, i (i)}
      <span class="die" class:d6={sides === 6} class:blank={!f} style:animation-delay="{i * 40}ms">
        {#if sides === 6 && f}
          {#each Array.from({ length: 9 }, (_, j) => j) as j (j)}
            <i class:on={PIPS[f]?.includes(j)}></i>
          {/each}
        {:else}
          <b>{f || "?"}</b>
        {/if}
      </span>
    {/each}
  </button>
  <div class="dice-info">
    {#if roll && !rolling}
      {#if count > 1}<b>{sum}</b> · {/if}<span style:color={roll.c}>{roll.n}</span>
    {:else if rolling}
      Бросок…
    {:else}
      {count > 1 ? `${count}d${sides}` : `d${sides}`} · бросок по щелчку
    {/if}
  </div>
</div>
