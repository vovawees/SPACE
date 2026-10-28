<script lang="ts">
  /* Календарь на месяц: щелчок по дню — отметить его своим цветом (у
     каждого участника своя отметка). Удобно договориться о дате, отметить
     дежурства или дни привычки. */
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import { MONTHS, WEEKDAYS, dayMarks, isoDate, monthOf, shiftMonth, todayIso, toggleDay } from "./play.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const ym = $derived(monthOf(p));
  const today = todayIso();
  const lead = $derived((new Date(ym.y, ym.m, 1).getDay() + 6) % 7);
  const days = $derived(new Date(ym.y, ym.m + 1, 0).getDate());
  const cells = $derived(Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1));
  const k = $derived(Math.max(0.5, Math.min(v.w / 300, v.h / 300)));
  const nowYm = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  function go(e: MouseEvent, d: number) {
    e.stopPropagation();
    if (b.readonly) return;
    const next = d === 0 ? nowYm : shiftMonth(ym.y, ym.m, d);
    b.view.update(v.id, { ym: next === nowYm ? undefined : next });
  }
  function hit(e: MouseEvent, iso: string) {
    e.stopPropagation();
    toggleDay(b, v, iso);
  }
</script>

<div class="card cal-card" style:--k={k}>
  <div class="cal-head">
    <div class="cal-name">
      {#if p.title}<span class="cal-title">{p.title}</span>{/if}
      <span class="cal-month">{MONTHS[ym.m]} {ym.y}</span>
    </div>
    <div class="cal-nav" data-ui>
      <button class="icon-btn" disabled={b.readonly} onclick={(e) => go(e, -1)} aria-label="Прошлый месяц"><ChevronLeft size={15} /></button>
      <button class="icon-btn cal-today" disabled={b.readonly} onclick={(e) => go(e, 0)} {@attach tip("Текущий месяц")} aria-label="Текущий месяц">•</button>
      <button class="icon-btn" disabled={b.readonly} onclick={(e) => go(e, 1)} aria-label="Следующий месяц"><ChevronRight size={15} /></button>
    </div>
  </div>
  <div class="cal-grid" style:--rows={cells.length / 7}>
    {#each WEEKDAYS as w, i (w)}<span class="cal-wd" class:we={i >= 5}>{w}</span>{/each}
    {#each cells as d, i (i)}
      {#if d >= 1 && d <= days}
        {@const iso = isoDate(ym.y, ym.m, d)}
        {@const marks = dayMarks(p, iso)}
        {@const mine = marks.find((x) => x.u === b.me.id)}
        <button
          class="cal-day"
          class:we={i % 7 >= 5}
          class:today={iso === today}
          class:mine={!!mine}
          class:marked={marks.length > 0}
          style:--mc={mine ? mine.c : marks[0] ? marks[0].c : null}
          data-ui
          disabled={b.readonly}
          aria-pressed={!!mine}
          aria-label="{d} {MONTHS[ym.m]}{marks.length ? `, отметили: ${marks.map((x) => x.n).join(', ')}` : ''}"
          title={marks.length ? marks.map((x) => x.n).join(", ") : undefined}
          onclick={(e) => hit(e, iso)}
        >
          <span>{d}</span>
          {#if marks.length && !(marks.length === 1 && mine)}
            <span class="cal-dots">{#each marks.slice(0, 4) as m (m.u)}<i style:background={m.c ? m.c : colorCss("blue")}></i>{/each}</span>
          {/if}
        </button>
      {:else}
        <span class="cal-pad"></span>
      {/if}
    {/each}
  </div>
</div>
