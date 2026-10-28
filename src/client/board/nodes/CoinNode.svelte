<script lang="ts">
  /* Монетка: подбросить может любой — у всех она взлетает, кувыркается и
     падает одной и той же стороной. Подписи сторон — в настройках. */
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { COIN_MS, coinSides, flipCoin, playSound } from "./play.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const sides = $derived(coinSides(p));
  const res = $derived(p.coin ?? null);
  const side = $derived(res?.v ?? 0);
  const k = $derived(Math.max(0.45, Math.min(v.w / 190, v.h / 210)));
  const size = $derived(Math.max(40, Math.min(v.w - 30, v.h - 84 * k)));
  const fs = (t: string) => (t.length <= 2 ? 0.42 : t.length <= 5 ? 0.2 : t.length <= 9 ? 0.15 : 0.11);
  let coin = $state<HTMLElement>();
  let flying = $state(false);
  let seq = untrack(() => p.coin?.s ?? 0);

  $effect(() => {
    const c = p.coin;
    if (!c || c.s === seq) return;
    seq = c.s;
    untrack(() => toss(c.v));
  });

  function toss(to: 0 | 1) {
    const el = coin;
    if (!el || document.documentElement.hasAttribute("data-reduce-motion")) return playSound("coin");
    for (const a of el.getAnimations()) a.cancel();
    flying = true;
    const turns = 4 + Math.floor(Math.random() * 3);
    const end = turns * 360 + (to ? 180 : 0);
    const h = Math.round(size * 0.85);
    const anim = el.animate(
      [
        { transform: "translateY(0) rotateX(0deg) scale(1)", offset: 0 },
        { transform: `translateY(${-h}px) rotateX(${end * 0.5}deg) scale(1.18)`, offset: 0.42, easing: "cubic-bezier(.3,0,.6,1)" },
        { transform: `translateY(0) rotateX(${end}deg) scale(1)`, offset: 0.82 },
        { transform: `translateY(${-h * 0.09}px) rotateX(${end}deg) scale(1)`, offset: 0.91 },
        { transform: `translateY(0) rotateX(${end}deg) scale(1)`, offset: 1 },
      ],
      { duration: COIN_MS, easing: "cubic-bezier(.2,.6,.35,1)" },
    );
    playSound("flip");
    anim.onfinish = anim.oncancel = () => {
      flying = false;
      playSound("coin");
    };
  }

  function go(e: MouseEvent) {
    e.stopPropagation();
    if (!flying) flipCoin(b, [v.id]);
  }
</script>

<div class="card coin-card" class:flying style:--k={k}>
  <div class="coin-title"><TitleEdit {v} placeholder="Монетка" /></div>
  <button class="coin-stage" data-ui disabled={b.readonly} aria-label="Подбросить монетку" onclick={go} style:--cs="{size}px">
    <span class="coin" bind:this={coin} style:transform={side ? "rotateX(180deg)" : null}>
      <span class="coin-face front"><span style:font-size="{size * fs(sides[0])}px">{sides[0]}</span></span>
      <span class="coin-face back"><span style:font-size="{size * fs(sides[1])}px">{sides[1]}</span></span>
    </span>
    <span class="coin-shadow"></span>
  </button>
  <div class="coin-res" aria-live="polite">
    {#if flying}
      <span class="coin-wait">…</span>
    {:else if res}
      <b>{sides[side]}</b>{#if res.n}<span class="coin-by" style:--who={res.c}>{" · "}{res.n}</span>{/if}
    {:else}
      <span class="coin-wait">{b.readonly ? "Ещё не бросали" : "Нажмите на монетку"}</span>
    {/if}
  </div>
  {#if p.hist && (p.ch?.[0] || p.ch?.[1])}
    <div class="coin-hist">{sides[0]} {p.ch?.[0] ?? 0} · {sides[1]} {p.ch?.[1] ?? 0}</div>
  {/if}
</div>
