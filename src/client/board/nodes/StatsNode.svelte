<script lang="ts">
  /* Карточка персонажа: портрет-эмодзи, имя, класс и характеристики со
     шкалами (здоровье, мана, атака…). Значения меняет любой участник
     кнопками − и + (с Shift — по 10), у каждой характеристики своё поле.
     Логика умеет прибавлять и отнимать — например, «удар» кнопкой. */
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss, type Player } from "../model.ts";
  import { statVal, statsOf } from "./design.ts";
  import { setScore } from "./play.ts";
  import { playSound } from "./sound.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { fmtNum } from "./values.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const stats = $derived(statsOf(p));
  // закреплённую карточку не сдвинуть, но значения менять можно — как в табло
  const live = $derived(!b.readonly);
  const k = $derived(Math.max(0.7, Math.min(1.8, v.w / 300)));
  const first = $derived(stats[0]);
  const down = $derived(!!first?.m && statVal(p, first.id) <= 0);

  function bump(e: MouseEvent, st: Player, d: number) {
    e.stopPropagation();
    if (!live) return;
    const step = e.shiftKey ? 10 : 1;
    let n = statVal(p, st.id) + d * step;
    if (st.m) n = Math.max(0, Math.min(st.m, n));
    playSound(d > 0 ? "pop" : "click");
    setScore(b, v, st.id, n);
  }
</script>

<div class="card stc-card" class:down style:--k={k}>
  <div class="stc-head">
    <span class="stc-ava" aria-hidden="true">{p.emoji || "🧙"}</span>
    <div class="stc-id">
      <div class="stc-name"><TitleEdit {v} placeholder="Персонаж" /></div>
      {#if p.desc}<div class="stc-sub">{p.desc}</div>{/if}
    </div>
  </div>
  {#if stats.length}
    <div class="stc-list">
      {#each stats as st (st.id)}
        {@const val = statVal(p, st.id)}
        <div class="stc-row" class:bar={!!st.m} style:--sc={colorCss(st.c ?? "blue")}>
          <span class="stc-l">{st.t}</span>
          {#if st.m}
            <span class="stc-track"><span style:width="{Math.max(0, Math.min(100, (val / st.m) * 100))}%"></span></span>
          {/if}
          <span class="stc-v">{fmtNum(val)}{#if st.m}<small> / {fmtNum(st.m)}</small>{/if}</span>
          {#if live}
            <span class="stc-pm" data-ui>
              <button aria-label="Меньше: {st.t}" title="−1 (Shift — −10)" onclick={(e) => bump(e, st, -1)}><Minus size={Math.round(12 * k)} strokeWidth={2.6} /></button>
              <button aria-label="Больше: {st.t}" title="+1 (Shift — +10)" onclick={(e) => bump(e, st, 1)}><Plus size={Math.round(12 * k)} strokeWidth={2.6} /></button>
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="stc-empty">Добавьте характеристики в настройках</div>
  {/if}
  {#if p.bt}<div class="stc-notes">{p.bt}</div>{/if}
</div>
