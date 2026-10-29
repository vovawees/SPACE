<script lang="ts">
  /* Покер планирования: каждый втайне выбирает карту оценки, потом все
     открывают разом. Видно, кто уже выбрал; после открытия — среднее,
     разброс и «единогласно». Колоды: Фибоначчи, размеры футболок, степени
     двойки или своя. Подходит и для игр: «угадай число», голос вслепую. */
  import Eye from "@lucide/svelte/icons/eye";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { untrack } from "svelte";
  import { plural } from "../../lib/util.ts";
  import { useBoard } from "../board.svelte.ts";
  import { pokerFaces, pokerReset, pokerReveal, pokerSummary, pokerVote, pokerVotes } from "./design.ts";
  import { playFx } from "./fx.ts";
  import { playSound } from "./sound.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const faces = $derived(pokerFaces(p));
  const votes = $derived(pokerVotes(p));
  const open = $derived(!!p.on);
  const sum = $derived(pokerSummary(p));
  const mine = $derived(votes.find((x) => x.id === b.me.id)?.v ?? null);
  const k = $derived(Math.max(0.7, Math.min(1.8, v.w / 380)));
  let el = $state<HTMLElement>();
  let was = untrack(() => !!p.on);

  $effect(() => {
    const on = open;
    if (on === was) return;
    was = on;
    if (!on) return;
    untrack(() => {
      playSound("card");
      if (sum.same && el) {
        playFx(el, "confetti");
        playSound("win");
      }
    });
  });

  function vote(e: MouseEvent, f: string) {
    e.stopPropagation();
    if (!open) pokerVote(b, v, f);
  }
  function reveal(e: MouseEvent) {
    e.stopPropagation();
    pokerReveal(b, [v.id], true);
  }
  function reset(e: MouseEvent) {
    e.stopPropagation();
    pokerReset(b, [v.id]);
  }
</script>

<div class="card pk-card" class:open bind:this={el} style:--k={k}>
  <div class="pk-head">
    <span class="pk-title"><TitleEdit {v} placeholder="Оценка задачи" /></span>
    <span class="pk-n">{votes.length ? `${votes.length} ${plural(votes.length, "голос", "голоса", "голосов")}` : "нет голосов"}</span>
  </div>
  <div class="pk-table">
    {#each votes as x (x.id)}
      <div class="pk-seat" class:me={x.id === b.me.id} style:--pc={x.c || "var(--accent)"}>
        <span class="pk-face" class:shown={open}>{open ? x.v : ""}</span>
        <span class="pk-who" title={x.n}>{x.id === b.me.id ? "Вы" : x.n || "Гость"}</span>
      </div>
    {:else}
      <div class="pk-wait">Выберите карту — её увидят, когда все откроют</div>
    {/each}
  </div>
  {#if open && votes.length}
    <div class="pk-sum" class:same={sum.same}>
      {#if sum.same}
        Единогласно: <b>{votes[0]!.v}</b> 🎉
      {:else}
        Среднее <b>{sum.label}</b>{#if sum.min !== null && sum.max !== null && sum.min !== sum.max}<span> · от {sum.min} до {sum.max}</span>{/if}
      {/if}
    </div>
  {/if}
  <div class="pk-hand" class:locked={open} data-ui>
    {#each faces as f (f)}
      <button class="pk-pick" class:on={mine === f} disabled={b.readonly || open} aria-pressed={mine === f} onclick={(e) => vote(e, f)}>{f}</button>
    {/each}
  </div>
  {#if !b.readonly}
    <div class="pk-foot" data-ui>
      {#if open}
        <button class="pk-act" onclick={reset}><RotateCcw size={Math.round(13 * k)} />Новый раунд</button>
      {:else}
        <button class="pk-act primary" disabled={!votes.length} onclick={reveal}><Eye size={Math.round(13 * k)} />Открыть карты</button>
      {/if}
    </div>
  {/if}
</div>
