<script lang="ts">
  /* Часы: своё время или любой пояс — удобно, когда команда в разных
     городах. Цифровые или со стрелками; показывают разницу с вашим. */
  import { useBoard } from "../board.svelte.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { clockParts, tzLabel, tzShift } from "./widgets.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const analog = $derived(p.cv === "analog");
  const secs = $derived(!!p.sec || analog);
  let now = $state(Date.now());
  const t = $derived(clockParts(now, p.tz));
  const shift = $derived(tzShift(now, p.tz));
  const k = $derived(Math.max(0.4, Math.min(v.w / 220, v.h / 120)));
  const pad = (n: number) => String(n).padStart(2, "0");
  const renaming = $derived(b.ix.renaming === v.id);

  // тикает раз в секунду (без секунд — раз в несколько, ровно к смене минуты)
  $effect(() => {
    const every = secs ? 1000 : 5000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      now = Date.now();
      timer = setTimeout(tick, every - (now % every) + 15);
    };
    tick();
    return () => clearTimeout(timer);
  });

  const hands = $derived({ h: ((t.h % 12) + t.m / 60) * 30, m: (t.m + t.s / 60) * 6, s: t.s * 6 });

</script>

<div class="card clk-card" class:analog style:--k={k}>
  <div class="clk-title">
    <TitleEdit {v} placeholder={tzLabel(p.tz)} />{#if shift && !renaming}<span class="clk-shift">{shift}</span>{/if}
  </div>
  {#if analog}
    <svg class="clk-face" viewBox="0 0 100 100" aria-label="{pad(t.h)}:{pad(t.m)}">
      <circle cx="50" cy="50" r="47" class="clk-rim" />
      {#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
        <line x1="50" y1={i % 3 ? 9 : 7} x2="50" y2={i % 3 ? 13 : 16} transform="rotate({i * 30} 50 50)" class="clk-tick" class:major={i % 3 === 0} />
      {/each}
      <line x1="50" y1="54" x2="50" y2="27" transform="rotate({hands.h} 50 50)" class="clk-h" />
      <line x1="50" y1="56" x2="50" y2="15" transform="rotate({hands.m} 50 50)" class="clk-m" />
      <line x1="50" y1="60" x2="50" y2="12" transform="rotate({hands.s} 50 50)" class="clk-s" />
      <circle cx="50" cy="50" r="2.6" class="clk-dot" />
    </svg>
  {:else}
    <div class="clk-time">{pad(t.h)}<span class="clk-colon">:</span>{pad(t.m)}{#if secs}<span class="clk-sec">{pad(t.s)}</span>{/if}</div>
    {#if v.h >= 104}<div class="clk-date">{t.date}</div>{/if}
  {/if}
</div>
