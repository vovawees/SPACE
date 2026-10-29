<script lang="ts">
  /* Секундомер для всех: идёт с момента запуска, у всех одинаково. Круги —
     отметки общего времени; сотые доли — в настройках. */
  import Flag from "@lucide/svelte/icons/flag";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { swElapsed, swPatch, swRunning, swText, type SwAct } from "./play.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const running = $derived(swRunning(p));
  let now = $state(Date.now());
  const ms = $derived(swElapsed(p, now));
  const cs = $derived(!!p.ms);
  const text = $derived(swText(ms, cs));
  const laps = $derived(p.laps ?? []);
  const k = $derived(Math.max(0.4, Math.min(v.w / 240, v.h / 150)));
  // на круги хватает места — показываем последние
  const lapRows = $derived(Math.max(0, Math.min(4, Math.floor((v.h / k - 150) / 19))));
  const shown = $derived(
    laps
      .map((t, i) => ({ n: i + 1, t, d: t - (laps[i - 1] ?? 0) }))
      .slice(-Math.max(1, lapRows))
      .reverse(),
  );

  // тикает, только пока идёт: с сотыми — ~25 раз в секунду (чаще глаз не
  // различает, а каждый кадр перерисовки дорог для всей доски), без них — 5 раз
  $effect(() => {
    if (!running) {
      now = Date.now();
      return;
    }
    let raf = 0;
    let t: ReturnType<typeof setInterval> | undefined;
    if (cs) {
      let last = 0;
      const loop = () => {
        const n = Date.now();
        if (n - last >= 38) now = last = n;
        raf = requestAnimationFrame(loop);
      };
      loop();
    } else t = setInterval(() => (now = Date.now()), 200);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  });

  function act(e: MouseEvent, kind: SwAct) {
    e.stopPropagation();
    if (b.readonly) return;
    b.view.update(v.id, swPatch(p, kind, Date.now()));
  }
</script>

<div class="card timer-card sw-watch" class:running style:--k={k}>
  <div class="timer-title"><TitleEdit {v} placeholder="Секундомер" /></div>
  <div class="timer-time" class:long={text.length > 9} aria-live="off">{text}</div>
  {#if laps.length && lapRows > 0}
    <ol class="sw-laps">
      {#each shown as l (l.n)}
        <li><span class="sw-ln">Круг {l.n}</span><span class="sw-lt">{swText(l.t, cs)}</span><span class="sw-ld">+{swText(l.d, cs)}</span></li>
      {/each}
    </ol>
  {:else if laps.length}
    <div class="sw-lapn">кругов: {laps.length} · последний +{swText(laps[laps.length - 1]! - (laps[laps.length - 2] ?? 0), cs)}</div>
  {/if}
  <div class="timer-btns" data-ui>
    <button class="icon-btn" onclick={(e) => act(e, "lap")} disabled={b.readonly || !running} {@attach tip("Круг")} aria-label="Круг"><Flag size={14} /></button>
    <button class="timer-main" onclick={(e) => act(e, "toggle")} disabled={b.readonly} aria-label={running ? "Стоп" : "Старт"}>
      {#if running}<Pause size={18} fill="currentColor" strokeWidth={0} />{:else}<Play size={18} fill="currentColor" strokeWidth={0} />{/if}
    </button>
    <button class="icon-btn" onclick={(e) => act(e, "reset")} disabled={b.readonly || (!running && ms === 0 && !laps.length)} {@attach tip("Сбросить")} aria-label="Сбросить"><RotateCcw size={14} /></button>
  </div>
</div>
