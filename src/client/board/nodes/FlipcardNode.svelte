<script lang="ts">
  /* Карточка с двумя сторонами: вопрос и ответ, слово и перевод. Щелчок —
     перевернуть: у всех сразу или (режим «каждый у себя») только у себя. */
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { flipCard, playSound } from "./play.ts";
  import { onTap } from "./tap.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  let mine = $state(false);
  const flipped = $derived(p.self ? mine : !!p.on);
  const k = $derived(Math.max(0.5, Math.min(v.w / 260, v.h / 170)));
  const front = $derived(p.ft?.trim() || "Вопрос");
  const back = $derived(p.bt?.trim() || "Ответ");
  const fs = (t: string) => (t.length <= 10 ? 28 : t.length <= 24 ? 22 : t.length <= 60 ? 17.5 : t.length <= 140 ? 14.5 : 12.5);

  // звук — при каждом перевороте, и своём, и чужом
  let was = untrack(() => flipped);
  $effect(() => {
    if (flipped !== was) playSound("flip");
    was = flipped;
  });

  function flip() {
    if (p.self) mine = !mine;
    else if (!b.readonly) flipCard(b, [v.id]);
  }
</script>

<div class="fc" class:flipped style:--k={k} {@attach onTap(flip)}>
  <div class="fc-inner">
    <div class="fc-face fc-front">
      <span class="fc-tag">{p.self ? "у каждого своя" : "лицо"}</span>
      <div class="fc-text" style:font-size="{fs(front) * k}px">{front}</div>
      <span class="fc-hint"><RotateCcw size={11} />перевернуть</span>
    </div>
    <div class="fc-face fc-back" aria-hidden={!flipped}>
      <span class="fc-tag">оборот</span>
      <div class="fc-text" style:font-size="{fs(back) * k}px">{back}</div>
      <span class="fc-hint"><RotateCcw size={11} />назад</span>
    </div>
  </div>
</div>
