<script lang="ts">
  /* Очередь ходов: кто ходит сейчас и кто следующий. «Следующий ход» —
     у всех сразу; прошли круг — номер раунда растёт. */
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import SkipForward from "@lucide/svelte/icons/skip-forward";
  import { untrack } from "svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import { nextTurn, playSound, playersOf, turnOf } from "./play.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const pl = $derived(playersOf(p));
  const cur = $derived(turnOf(p));
  const rn = $derived(Math.max(1, p.rn ?? 1));
  const k = $derived(Math.max(0.5, Math.min(v.w / 270, v.h / 220)));
  // список с текущего игрока: он сверху, дальше — по очереди
  const fits = $derived(Math.max(1, Math.floor((v.h / k - 44 - 46 - 50) / 28) + 1));
  const queue = $derived(Array.from({ length: Math.min(pl.length, fits) }, (_, i) => ({ ...pl[(cur + i) % pl.length]!, i: (cur + i) % pl.length, at: i })));

  let was = untrack(() => `${cur}:${rn}`);
  $effect(() => {
    const key = `${cur}:${rn}`;
    if (key !== was) playSound("pop");
    was = key;
  });

  function go(e: MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    if (!b.readonly) nextTurn(b, [v.id], dir);
  }
</script>

<div class="card tn-card" style:--k={k}>
  <div class="tn-head">
    <span class="tn-title"><TitleEdit {v} placeholder="Очередь ходов" /></span>
    <span class="tn-round">Раунд {rn}</span>
  </div>
  <ol class="tn-list">
    {#each queue as q (q.id)}
      <li class="tn-row" class:now={q.at === 0} style:--pc={colorCss(q.c)}>
        {#if q.at === 0}
          {#key `${cur}:${rn}`}<span class="tn-now"><span class="tn-dot"></span><span class="tn-name">{q.t || `Игрок ${q.i + 1}`}</span><small>ходит</small></span>{/key}
        {:else}
          <span class="tn-dot"></span><span class="tn-name">{q.t || `Игрок ${q.i + 1}`}</span>{#if q.at === 1}<small>следующий</small>{/if}
        {/if}
      </li>
    {/each}
    {#if pl.length > queue.length}<li class="tn-more">и ещё {pl.length - queue.length}</li>{/if}
  </ol>
  <div class="tn-btns" data-ui>
    <button class="icon-btn" disabled={b.readonly} onclick={(e) => go(e, -1)} {@attach tip("Назад")} aria-label="Ход назад"><ChevronLeft size={16} /></button>
    <button class="btn primary sm tn-next" disabled={b.readonly} onclick={(e) => go(e, 1)}><SkipForward size={14} />Следующий ход</button>
  </div>
</div>
