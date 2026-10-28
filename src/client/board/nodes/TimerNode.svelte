<script lang="ts">
  /* Таймер для всех: запуск, пауза и сброс видны каждому на доске.
     Идущий таймер хранит время окончания, остановленный — остаток.
     Длительность любая (хоть 3 дня 2 часа 5 секунд), шаг кнопок ±,
     звук, вид (полоса, кольцо) и «по кругу» — в настройках. */
  import Minus from "@lucide/svelte/icons/minus";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import Repeat from "@lucide/svelte/icons/repeat";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { focusSelect } from "../../ui/portal.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { beep, clock, durText, loopEnd, timerDur, timerLeft, timerPatch, timerStep } from "./timer.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  let now = $state(Date.now());
  const running = $derived(typeof p.end === "number");
  const left = $derived(timerLeft(p, now));
  const dur = $derived(timerDur(p));
  const over = $derived(running && left <= 0);
  const renaming = $derived(b.ix.renaming === v.id);
  const scale = $derived(Math.max(0.4, Math.min(v.w / 240, v.h / 150)));
  const view = $derived(p.tv ?? "bar");
  const frac = $derived(Math.max(0, Math.min(1, left / dur)));
  const step = $derived(durText(timerStep(p)));
  const text = $derived(over ? p.endt?.trim() || "Время!" : clock(left));

  // тикает, только пока идёт; сигнал — тем, у кого доска открыта в этот момент.
  // «По кругу» — после сигнала сразу следующий круг (у всех одно и то же время).
  $effect(() => {
    const end = p.end;
    if (typeof end !== "number") return;
    now = Date.now();
    let ring = end > now ? end : loopEnd(p, now);
    if (ring === null) return;
    const t = setInterval(() => {
      now = Date.now();
      if (ring === null || now < ring) return;
      beep(p.snd);
      ring = loopEnd(p, now);
      if (ring === null) clearInterval(t);
    }, 250);
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
  const R = 46;
  const C = 2 * Math.PI * R;
</script>

<div class="card timer-card view-{view}" class:running class:over style:--k={scale}>
  <div class="timer-title">
    {#if renaming}
      <input class="rename" data-ui value={p.title ?? ""} placeholder="Таймер" {@attach focusSelect} onblur={commit} onkeydown={onkey} />
    {:else}
      {p.title || "Таймер"}{#if p.loop}<span class="timer-loop" title="По кругу"><Repeat size={11} /></span>{/if}
    {/if}
  </div>
  {#if view === "ring"}
    <div class="timer-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={R} class="track" />
        <circle cx="50" cy="50" r={R} class="bar" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
      </svg>
      <div class="timer-time" class:long={text.length > 8} aria-live="off">{text}</div>
    </div>
  {:else}
    <div class="timer-time" class:long={text.length > 8} aria-live="off">{text}</div>
    {#if view === "bar"}
      <div class="timer-progress"><span style:width="{frac * 100}%"></span></div>
    {/if}
  {/if}
  <div class="timer-btns" data-ui>
    <button class="icon-btn" onclick={(e) => act(e, "sub")} disabled={b.readonly} {@attach tip(`−${step}`)} aria-label="Минус {step}"><Minus size={15} /></button>
    <button class="timer-main" onclick={(e) => act(e, over ? "reset" : "toggle")} disabled={b.readonly} aria-label={running && !over ? "Пауза" : "Запустить"}>
      {#if running && !over}<Pause size={18} fill="currentColor" strokeWidth={0} />{:else if over}<RotateCcw size={17} />{:else}<Play size={18} fill="currentColor" strokeWidth={0} />{/if}
    </button>
    <button class="icon-btn" onclick={(e) => act(e, "add")} disabled={b.readonly} {@attach tip(`+${step}`)} aria-label="Плюс {step}"><Plus size={15} /></button>
    <button class="icon-btn" onclick={(e) => act(e, "reset")} disabled={b.readonly} {@attach tip("Сбросить")} aria-label="Сбросить"><RotateCcw size={14} /></button>
  </div>
</div>
