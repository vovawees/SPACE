<script lang="ts">
  /* Обратный отсчёт до события: дедлайн, запуск, праздник. Когда время
     наступает — у всех, кто смотрит, салют. */
  import { useBoard } from "../board.svelte.ts";
  import { playFx } from "./fx.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { countdownParts, localInput } from "./widgets.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const at = $derived(typeof p.at === "number" ? p.at : null);
  let now = $state(Date.now());
  const left = $derived(at === null ? 0 : at - now);
  const done = $derived(at !== null && left <= 0);
  const c = $derived(countdownParts(left));
  const k = $derived(Math.max(0.4, Math.min(v.w / 320, v.h / 130)));
  const pad = (n: number) => String(n).padStart(2, "0");
  let el = $state<HTMLElement>();

  $effect(() => {
    const target = at;
    if (target === null) return;
    now = Date.now();
    if (target <= now) return;
    const timer = setInterval(() => {
      now = Date.now();
      if (now < target) return;
      clearInterval(timer);
      const host = el?.closest<HTMLElement>(".node");
      if (host && document.visibilityState === "visible") playFx(host, "confetti");
    }, 250);
    return () => clearInterval(timer);
  });

  const when = $derived(
    at === null
      ? ""
      : new Date(at).toLocaleString("ru-RU", { day: "numeric", month: "long", year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "2-digit", minute: "2-digit" }),
  );

  function setAt(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value;
    const ms = val ? new Date(val).getTime() : NaN;
    b.view.update(v.id, { at: Number.isFinite(ms) ? ms : null });
  }
</script>

<div class="card cd-card" class:done class:empty={at === null} style:--k={k} bind:this={el}>
  <div class="cd-title"><TitleEdit {v} placeholder="До события" /></div>
  {#if at === null}
    <div class="cd-empty">Когда?</div>
  {:else if done}
    <div class="cd-done">Наступило! 🎉</div>
  {:else}
    <div class="cd-row">
      {#if c.d}<div class="cd-box"><b>{c.d}</b><span>дн</span></div>{/if}
      <div class="cd-box"><b>{pad(c.h)}</b><span>ч</span></div>
      <div class="cd-box"><b>{pad(c.m)}</b><span>мин</span></div>
      <div class="cd-box"><b>{pad(c.s)}</b><span>сек</span></div>
    </div>
  {/if}
  {#if !b.readonly && (sel || at === null)}
    <input class="cd-input" data-ui type="datetime-local" value={localInput(at)} onchange={setAt} onkeydown={(e) => e.stopPropagation()} aria-label="Дата и время события" />
  {:else if when}
    <div class="cd-when">{when}</div>
  {/if}
</div>
