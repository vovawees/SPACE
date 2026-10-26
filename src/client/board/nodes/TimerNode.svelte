<script lang="ts">
  /* Таймер для всех: запуск, пауза и сброс видны каждому на доске.
     Идущий таймер хранит время окончания, остановленный — остаток. */
  import Minus from "@lucide/svelte/icons/minus";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { focusSelect } from "../../ui/portal.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { beep, clock, timerLeft, timerPatch } from "./timer.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  let now = $state(Date.now());
  const running = $derived(typeof p.end === "number");
  const left = $derived(timerLeft(p, now));
  const dur = $derived(Math.max(1000, p.dur ?? 300_000));
  const over = $derived(running && left <= 0);
  const renaming = $derived(b.ix.renaming === v.id);
  const scale = $derived(Math.max(0.4, Math.min(v.w / 240, v.h / 150)));

  // тикает, только пока идёт; сигнал — тем, у кого доска открыта в этот момент
  $effect(() => {
    const end = p.end;
    if (typeof end !== "number") return;
    now = Date.now();
    if (end <= now) return;
    const t = setInterval(() => {
      now = Date.now();
      if (now < end) return;
      clearInterval(t);
      if (document.visibilityState === "visible") beep();
    }, 200);
    return () => clearInterval(t);
  });

  function act(e: MouseEvent, kind: "toggle" | "reset" | "add" | "sub") {
    e.stopPropagation();
    if (b.readonly) return;
    b.view.update(v.id, timerPatch(p, kind, Date.now()));
  }

  function commit(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.trim();
    if (b.ix.renaming !== v.id) return;
    b.ix.renaming = null;
    if (val !== (p.title ?? "")) b.view.update(v.id, { title: val || undefined });
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") {
      b.ix.renaming = null;
      e.stopPropagation();
    }
  }
</script>

<div class="card timer-card" class:running class:over style:--k={scale}>
  <div class="timer-title">
    {#if renaming}
      <input class="rename" data-ui value={p.title ?? ""} placeholder="Таймер" {@attach focusSelect} onblur={commit} onkeydown={onkey} />
    {:else}
      {p.title || "Таймер"}
    {/if}
  </div>
  <div class="timer-time" aria-live="off">{over ? "Время!" : clock(left)}</div>
  <div class="timer-progress"><span style:width="{Math.max(0, Math.min(100, (left / dur) * 100))}%"></span></div>
  <div class="timer-btns" data-ui>
    <button class="icon-btn" onclick={(e) => act(e, "sub")} disabled={b.readonly} {@attach tip("−1 минута")} aria-label="Минус минута"><Minus size={15} /></button>
    <button class="timer-main" onclick={(e) => act(e, over ? "reset" : "toggle")} disabled={b.readonly} aria-label={running && !over ? "Пауза" : "Запустить"}>
      {#if running && !over}<Pause size={18} fill="currentColor" strokeWidth={0} />{:else if over}<RotateCcw size={17} />{:else}<Play size={18} fill="currentColor" strokeWidth={0} />{/if}
    </button>
    <button class="icon-btn" onclick={(e) => act(e, "add")} disabled={b.readonly} {@attach tip("+1 минута")} aria-label="Плюс минута"><Plus size={15} /></button>
    <button class="icon-btn" onclick={(e) => act(e, "reset")} disabled={b.readonly} {@attach tip("Сбросить")} aria-label="Сбросить"><RotateCcw size={14} /></button>
  </div>
</div>
