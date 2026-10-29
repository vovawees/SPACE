<script lang="ts">
  /* Таблица добычи: предметы с весами и редкостью. Шанс каждого виден
     сразу; «Открыть» выбирает предмет по весам — у всех сразу, с
     прокруткой по строкам. Логика: «выпало» и «выпал предмет…». */
  import Gift from "@lucide/svelte/icons/gift";
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import { LOOT_MS, lootChances, lootCount, lootDrop, lootItems, rollLoot } from "./design.ts";
  import { playFx } from "./fx.ts";
  import { playSound } from "./sound.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const items = $derived(lootItems(p));
  const ch = $derived(lootChances(p));
  const top = $derived(Math.max(0.0001, ...ch));
  const got = $derived(lootDrop(p));
  const n = $derived(lootCount(p));
  const k = $derived(Math.max(0.7, Math.min(1.8, v.w / 320)));
  let el = $state<HTMLElement>();
  let flash = $state<number | null>(null);
  let seq = untrack(() => p.drop?.s ?? 0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rolling = $derived(flash !== null);
  const hit = $derived(new Set(rolling ? [] : got.map((x) => x.id)));

  const pct = (x: number) => (x >= 0.1 ? `${Math.round(x * 100)} %` : x >= 0.001 ? `${(x * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %` : x > 0 ? "<0,1 %" : "0 %");

  $effect(() => {
    const d = p.drop;
    if (!d || d.s === seq) return;
    seq = d.s;
    untrack(spin);
  });
  $effect(() => () => clearTimeout(timer));

  function spin() {
    clearTimeout(timer);
    const end = () => {
      flash = null;
      const best = got.reduce((a, x) => Math.min(a, ch[items.indexOf(x)] ?? 1), 1);
      if (best < 0.05 && el) {
        playFx(el, "stars");
        playSound("win");
      } else playSound("coin");
    };
    if (document.documentElement.hasAttribute("data-reduce-motion") || items.length < 2) return end();
    let i = 0;
    const steps = 16;
    const t0 = performance.now();
    const tick = () => {
      if (i >= steps || performance.now() - t0 > LOOT_MS) return end();
      flash = (flash === null ? 0 : flash + 1 + Math.floor(Math.random() * 2)) % items.length;
      playSound("tick");
      i++;
      timer = setTimeout(tick, 28 + i * i * 1.6);
    };
    tick();
  }

  function open(e: MouseEvent) {
    e.stopPropagation();
    if (!rolling) rollLoot(b, [v.id]);
  }
</script>

<div class="card lt-card" class:rolling bind:this={el} style:--k={k}>
  <div class="lt-head">
    <span class="lt-title"><TitleEdit {v} placeholder="Таблица добычи" /></span>
    <button class="lt-roll" data-ui disabled={b.readonly || !items.length || rolling} onclick={open}>
      <Gift size={Math.round(14 * k)} />{n > 1 ? `Открыть ×${n}` : "Открыть"}
    </button>
  </div>
  {#if items.length}
    <ul class="lt-list">
      {#each items as it, i (it.id)}
        <li class="lt-row" class:hit={hit.has(it.id)} class:flash={flash === i} style:--rc={colorCss(it.c ?? "gray")}>
          <span class="lt-gem" aria-hidden="true"></span>
          <span class="lt-name">{it.t || "Предмет"}</span>
          <span class="lt-pct">{pct(ch[i] ?? 0)}</span>
          <span class="lt-bar" aria-hidden="true"><span style:width="{((ch[i] ?? 0) / top) * 100}%"></span></span>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="lt-empty">Добавьте предметы в настройках</div>
  {/if}
  <div class="lt-res" aria-live="polite">
    {#if rolling}
      <span class="lt-hint">Открываем…</span>
    {:else if got.length && p.drop}
      <span class="lt-hint">Выпало{p.drop.n ? ` у ${p.drop.n}` : ""}:</span>
      {#each got as g, i (i)}<span class="lt-chip" style:--rc={colorCss(g.c ?? "gray")}>{g.t}</span>{/each}
    {:else}
      <span class="lt-hint">Шансы — по весам предметов</span>
    {/if}
  </div>
</div>
