<script lang="ts">
  /* Случайный выбор: число в пределах, вариант из списка или участник
     доски. Перед результатом варианты «прокручиваются», как в барабане. */
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { untrack } from "svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { genRandom, playSound, randomPool, randomRange } from "./play.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const mode = $derived(p.rm ?? "num");
  const res = $derived(p.rnd ?? null);
  const k = $derived(Math.max(0.45, Math.min(v.w / 250, v.h / 170)));
  const range = $derived(randomRange(p));
  const what = $derived(
    mode === "num" ? `от ${range[0].toLocaleString("ru-RU")} до ${range[1].toLocaleString("ru-RU")}` : mode === "people" ? "участник доски" : `из ${(p.opts ?? []).filter((o) => o.t.trim()).length} вариантов`,
  );
  let spinning = $state<string | null>(null);
  let seq = untrack(() => p.rnd?.s ?? 0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const shown = $derived(spinning ?? res?.v ?? "?");
  const size = $derived(shown.length <= 3 ? 46 : shown.length <= 7 ? 34 : shown.length <= 14 ? 24 : 18);

  $effect(() => {
    const r = p.rnd;
    if (!r || r.s === seq) return;
    seq = r.s;
    untrack(() => roll());
  });
  $effect(() => () => clearTimeout(timer));

  function sample(): string {
    if (mode === "num") {
      const [lo, hi] = range;
      return String(lo + Math.floor(Math.random() * Math.max(1, hi - lo + 1)));
    }
    const pool = randomPool(b, v);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)]! : "?";
  }

  function roll() {
    clearTimeout(timer);
    if (document.documentElement.hasAttribute("data-reduce-motion")) {
      spinning = null;
      return playSound("pop");
    }
    let i = 0;
    const steps = 14;
    const tick = () => {
      if (i >= steps) {
        spinning = null;
        playSound("pop");
        return;
      }
      spinning = sample();
      playSound("tick");
      i++;
      timer = setTimeout(tick, 30 + i * i * 1.4);
    };
    tick();
  }

  function go(e: MouseEvent) {
    e.stopPropagation();
    if (!b.readonly && !spinning) void genRandom(b, [v.id]);
  }
  function restart(e: MouseEvent) {
    e.stopPropagation();
    if (!b.readonly) b.view.update(v.id, { used: undefined, rnd: null });
  }
</script>

<div class="card rnd-card" class:spinning={!!spinning} style:--k={k}>
  <div class="rnd-title"><TitleEdit {v} placeholder="Случайный выбор" /></div>
  {#key spinning === null ? `r${res?.s ?? 0}` : "spin"}
    <div class="rnd-value" class:empty={!res && !spinning} class:landed={!spinning && !!res} style:font-size="{size * k}px">{shown}</div>
  {/key}
  <div class="rnd-meta">
    {#if res?.n && !spinning}<span class="rnd-by" style:--who={res.c}>{res.n}</span>{" · "}{/if}{what}{#if p.uniq}{" "}· без повторов{#if p.used?.length}{" "}({p.used.length}){/if}{/if}
  </div>
  <div class="rnd-btns" data-ui>
    <button class="btn primary sm" disabled={b.readonly || !!spinning} onclick={go}><Shuffle size={14} />Выбрать</button>
    {#if p.uniq && p.used?.length}
      <button class="icon-btn" disabled={b.readonly} onclick={restart} {@attach tip("Начать заново")} aria-label="Начать заново"><RotateCcw size={14} /></button>
    {/if}
  </div>
</div>
