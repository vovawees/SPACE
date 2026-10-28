<script lang="ts">
  /* Колода карт: обычная (36 или 52) или своя — задания, вопросы, роли.
     Тянет любой: карта вылетает из колоды и переворачивается у всех. */
  import Hand from "@lucide/svelte/icons/hand";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { untrack } from "svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { deckCards, deckDraw, deckLeft, deckShuffle, playSound } from "./play.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const cards = $derived(deckCards(p));
  const left = $derived(deckLeft(p));
  const top = $derived(p.top && p.top.i >= 0 && p.top.i < cards.length ? p.top : null);
  const card = $derived(top ? cards[top.i]! : null);
  const k = $derived(Math.max(0.45, Math.min(v.w / 230, v.h / 270)));
  const W = $derived(v.w - 24 * k);
  const H = $derived(v.h - 92 * k);
  const cw = $derived(Math.max(24, Math.min((W - 12 * k) / 2, H * 0.714)));
  const ch = $derived(cw / 0.714);
  const layers = $derived(left === 0 ? 0 : left > 30 ? 4 : left > 15 ? 3 : left > 5 ? 2 : 1);
  const custom = $derived((p.dk ?? "36") === "custom");
  const fs = (t: string) => (t.length <= 6 ? 0.26 : t.length <= 16 ? 0.17 : t.length <= 40 ? 0.13 : 0.1);
  // валет, дама, король, туз — крупная буква вместо масти
  const court = (r?: string) => !!r && /^[ВДКТ]$/.test(r);

  let face = $state<HTMLElement>();
  let pile = $state<HTMLElement>();
  let drawSeq = untrack(() => p.top?.s ?? 0);
  let shufSeq = untrack(() => p.shf ?? 0);

  $effect(() => {
    const s = p.top?.s ?? 0;
    if (s === drawSeq) return;
    const grew = s > drawSeq;
    drawSeq = s;
    if (grew) untrack(() => flyIn());
  });
  $effect(() => {
    const s = p.shf ?? 0;
    if (s === shufSeq) return;
    shufSeq = s;
    untrack(() => riffle());
  });

  const still = () => document.documentElement.hasAttribute("data-reduce-motion");

  function flyIn() {
    playSound("card");
    if (!face || still()) return;
    const dx = -(cw + 12 * k);
    face.animate(
      [
        { transform: `translateX(${dx}px) rotateY(180deg) rotate(-6deg)`, offset: 0 },
        { transform: `translateX(${dx * 0.45}px) translateY(${-ch * 0.12}px) rotateY(90deg) rotate(-2deg) scale(1.06)`, offset: 0.45 },
        { transform: "none", offset: 1 },
      ],
      { duration: 520, easing: "cubic-bezier(.2,.75,.3,1)" },
    );
  }

  function riffle() {
    playSound("shuffle");
    if (!pile || still()) return;
    pile.animate(
      [
        { transform: "none" },
        { transform: "translateX(-6%) rotate(-5deg)" },
        { transform: "translateX(6%) rotate(5deg)" },
        { transform: "translateX(-4%) rotate(-3deg)" },
        { transform: "translateX(3%) rotate(2deg)" },
        { transform: "none" },
      ],
      { duration: 520, easing: "ease-in-out" },
    );
  }

  function draw(e: MouseEvent) {
    e.stopPropagation();
    if (b.readonly) return;
    if (!deckDraw(b, [v.id])) deckShuffle(b, [v.id]);
  }
  function shuffle(e: MouseEvent) {
    e.stopPropagation();
    if (!b.readonly) deckShuffle(b, [v.id]);
  }
</script>

<div class="card deck-card" style:--k={k} style:--cw="{cw}px" style:--ch="{ch}px">
  <div class="deck-head">
    <span class="deck-title"><TitleEdit {v} placeholder="Колода" /></span>
    <span class="deck-n" {@attach tip("Осталось в колоде")}>{left} / {cards.length}</span>
  </div>
  <div class="deck-table">
    <button class="deck-pile" bind:this={pile} data-ui disabled={b.readonly} onclick={draw} aria-label={left ? "Вытянуть карту" : "Колода пуста — перетасовать"}>
      {#if layers}
        {#each Array.from({ length: layers }, (_, i) => i) as i (i)}
          <span class="pc-back" style:--i={layers - 1 - i}></span>
        {/each}
      {:else}
        <span class="pc-empty">пусто<br /><small>перетасовать</small></span>
      {/if}
    </button>
    <div class="deck-slot">
      {#if card}
        {#key top?.s}
          <div class="pc-face" class:red={card.red} class:custom bind:this={face}>
            {#if card.suit}
              <span class="pc-corner tl">{card.rank}<br />{card.suit}</span>
              <span class="pc-mid" style:font-size="{cw * (court(card.rank) ? 0.4 : 0.46)}px">{court(card.rank) ? card.rank : card.suit}</span>
              <span class="pc-corner br">{card.rank}<br />{card.suit}</span>
            {:else}
              <span class="pc-text" style:font-size="{cw * fs(card.t)}px">{card.t}</span>
            {/if}
          </div>
        {/key}
      {:else}
        <span class="pc-slot">карта<br />появится здесь</span>
      {/if}
    </div>
  </div>
  <div class="deck-foot" data-ui>
    <button class="btn primary sm deck-draw" disabled={b.readonly} onclick={draw}><Hand size={14} />{left ? "Вытянуть" : "Заново"}</button>
    <button class="icon-btn" disabled={b.readonly} onclick={shuffle} {@attach tip("Перетасовать")} aria-label="Перетасовать"><Shuffle size={15} /></button>
    {#if top?.n}<span class="deck-by" style:--who={top.c}>{top.n}</span>{/if}
  </div>
</div>
