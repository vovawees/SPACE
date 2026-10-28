<script lang="ts">
  /* Облако слов: каждый пишет одно-три слова, частые слова крупнее. Слова
     участника — его отдельное поле: одновременные ответы не теряются. */
  import X from "@lucide/svelte/icons/x";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import { PLAYER_COLORS, addWord, myWords, playSound, removeWord, wordCloud } from "./play.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const cloud = $derived(wordCloud(p).slice(0, 80));
  const top = $derived(Math.max(1, ...cloud.map((w) => w.n)));
  const total = $derived(cloud.reduce((a, w) => a + w.n, 0));
  const mine = $derived(myWords(p, b.me.id));
  const mineSet = $derived(new Set(mine.map((w) => w.trim().toLowerCase())));
  const max = $derived(Math.max(1, Math.min(20, p.max ?? 3)));
  const k = $derived(Math.max(0.6, Math.min(v.w / 360, v.h / 250, 1.8)));
  const hue = (t: string) => {
    let h = 0;
    for (const ch of t.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return colorCss(PLAYER_COLORS[h % PLAYER_COLORS.length]);
  };
  const size = (n: number) => 13 + 22 * (top > 1 ? (n - 1) / (top - 1) : 0.4);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    e.stopPropagation();
    const input = (e.currentTarget as HTMLFormElement).elements.namedItem("w") as HTMLInputElement;
    if (addWord(b, v, input.value)) {
      input.value = "";
      playSound("pop");
    }
  }
</script>

<div class="card wc-card" style:--k={k}>
  <div class="wc-head">
    <span class="wc-title">{p.title || "Облако слов"}</span>
    <span class="wc-n">{total ? `${total}` : ""}</span>
  </div>
  <div class="wc-cloud">
    {#each cloud as w (w.t.toLowerCase())}
      <span class="wc-word" class:mine={mineSet.has(w.t.toLowerCase())} style:font-size="{size(w.n) * k}px" style:--wc={hue(w.t)} title={w.n > 1 ? `${w.n} раза` : undefined}>{w.t}</span>
    {:else}
      <span class="wc-empty">{b.readonly ? "Пока никто не ответил" : "Пока пусто — напишите первое слово"}</span>
    {/each}
  </div>
  {#if !b.readonly}
    <form class="wc-form" data-ui onsubmit={submit}>
      <input name="w" class="input sm" placeholder={mine.length >= max ? `Новое слово заменит первое (${max} из ${max})` : "Ваше слово…"} maxlength="40" autocomplete="off" onkeydown={(e) => e.stopPropagation()} />
      <button class="btn primary sm" type="submit">Добавить</button>
    </form>
    {#if mine.length}
      <div class="wc-mine" data-ui>
        <span>Ваши {mine.length}/{max}:</span>
        {#each mine as w, i (i)}
          <button class="wc-chip" onclick={(e) => (e.stopPropagation(), removeWord(b, v, i))} aria-label="Убрать «{w}»">{w}<X size={11} /></button>
        {/each}
      </div>
    {/if}
  {/if}
</div>
