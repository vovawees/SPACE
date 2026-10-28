<script lang="ts">
  /* «Кто первый»: большая кнопка для викторин. Порядок нажатий — по
     времени нажатия у каждого участника; первый получает корону и звук. */
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { untrack } from "svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { buzz, buzzesOf, playSound, resetBuzz } from "./play.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const list = $derived(buzzesOf(p));
  const mine = $derived(list.findIndex((x) => x.u === b.me.id));
  const k = $derived(Math.max(0.5, Math.min(v.w / 230, v.h / 200)));
  const rowsFit = $derived(Math.max(0, Math.min(5, Math.floor((v.h / k - 150) / 22))));
  const btn = $derived(Math.max(44, Math.min(v.w * 0.55, v.h - (40 + Math.min(list.length, rowsFit) * 22 + 34) * k)));
  const t0 = $derived(list[0]?.t ?? 0);
  const delta = (t: number) => `+${((t - t0) / 1000).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} с`;

  let seen = untrack(() => list.length);
  $effect(() => {
    const n = list.length;
    if (n > seen) {
      const snd = p.snd ?? "buzz";
      if (seen === 0 && snd !== "none") playSound(snd);
      else if (snd !== "none") playSound("pop");
    }
    seen = n;
  });

  function press(e: MouseEvent) {
    e.stopPropagation();
    buzz(b, v);
  }
  function reset(e: MouseEvent) {
    e.stopPropagation();
    if (!b.readonly) resetBuzz(b, [v.id]);
  }
</script>

<div class="card bz-card" class:pressed={mine >= 0} style:--k={k}>
  <div class="bz-head">
    <span class="bz-title">{p.title || "Кто первый?"}</span>
    {#if list.length}<button class="icon-btn bz-reset" data-ui disabled={b.readonly} onclick={reset} {@attach tip("Новый раунд")} aria-label="Новый раунд"><RotateCcw size={13} /></button>{/if}
  </div>
  <div class="bz-stage">
    <button class="bz-btn" data-ui style:--bs="{btn}px" disabled={b.readonly || mine >= 0} onclick={press} aria-label="Нажать первым">
      <span>{mine >= 0 ? `${mine + 1}-й` : list.length ? "Жми!" : "Жми!"}</span>
    </button>
  </div>
  {#if list.length}
    <ol class="bz-list">
      {#each list.slice(0, Math.max(1, rowsFit)) as x, i (x.u)}
        <li class:first={i === 0} class:me={x.u === b.me.id} style:--who={x.c}>
          <span class="bz-i">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
          <span class="bz-n">{x.n || "Гость"}</span>
          {#if i > 0}<span class="bz-t">{delta(x.t)}</span>{/if}
        </li>
      {/each}
      {#if list.length > Math.max(1, rowsFit)}<li class="bz-more">и ещё {list.length - Math.max(1, rowsFit)}</li>{/if}
    </ol>
  {:else}
    <div class="bz-hint">{b.readonly ? "Нажимать могут участники с правом правки" : "Кто нажмёт первым — отвечает"}</div>
  {/if}
</div>
