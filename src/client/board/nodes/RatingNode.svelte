<script lang="ts">
  /* Оценка: каждый ставит свою (звёзды, сердечки, огоньки), видно
     среднее и сколько человек оценили. Повторный щелчок — убрать свою. */
  import Flame from "@lucide/svelte/icons/flame";
  import Heart from "@lucide/svelte/icons/heart";
  import Star from "@lucide/svelte/icons/star";
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import { plural } from "../../lib/util.ts";
  import { useBoard } from "../board.svelte.ts";
  import { rateKey } from "../model.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { fmtNum, ratingAvg, ratingsOf } from "./values.ts";
  import { rate } from "./widgets.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const max = $derived(Math.max(1, Math.min(10, p.max ?? 5)));
  const avg = $derived(ratingAvg(p));
  const n = $derived(ratingsOf(p).length);
  const mine = $derived(((p as Record<string, unknown>)[rateKey(b.me.id)] as number | undefined) ?? 0);
  let hover = $state(0);
  const shown = $derived(hover || avg);
  const Icon = $derived(p.ri === "heart" ? Heart : p.ri === "fire" ? Flame : p.ri === "like" ? ThumbsUp : Star);
  const size = $derived(Math.max(14, Math.min(48, (v.w - 28) / max - 6, v.h - 64)));

  function pick(e: MouseEvent, i: number) {
    e.stopPropagation();
    rate(b, v, i);
  }
</script>

<div class="card rt-card ri-{p.ri ?? 'star'}" style:--sz="{size}px">
  <div class="rt-title"><TitleEdit {v} placeholder="Оценка" /></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="rt-row" data-ui onpointerleave={() => (hover = 0)}>
    {#each Array.from({ length: max }, (_, i) => i + 1) as i (i)}
      {@const f = Math.max(0, Math.min(1, shown - (i - 1)))}
      <button
        class="rt-ico"
        class:mine={!hover && mine >= i}
        disabled={b.readonly}
        aria-label="Оценка {i} из {max}"
        onpointerenter={() => !b.readonly && (hover = i)}
        onclick={(e) => pick(e, i)}
      >
        <span class="rt-base"><Icon size={size} strokeWidth={1.8} /></span>
        {#if f > 0}
          <!-- clip-path режет и свечение (drop-shadow), поэтому область обрезки шире значка:
               целый значок не режется вовсе, у частичного — только справа по доле -->
          <span class="rt-on" style:clip-path={f >= 1 ? null : `inset(-12px ${100 - f * 100}% -12px -12px)`}><Icon size={size} strokeWidth={1.8} fill="currentColor" /></span>
        {/if}
      </button>
    {/each}
  </div>
  <div class="rt-foot">
    {#if hover}
      Поставить {hover}{mine === hover ? " · щёлкните ещё раз, чтобы убрать" : ""}
    {:else if n}
      <b>{fmtNum(avg)}</b> из {max} · {n} {plural(n, "оценка", "оценки", "оценок")}{mine ? ` · ваша ${mine}` : ""}
    {:else}
      Пока никто не оценил
    {/if}
  </div>
</div>
