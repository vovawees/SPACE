<script lang="ts">
  /* Табло счёта: команды или игроки, у каждого свои очки. Кнопки ± работают
     сразу (Shift — ×10), щелчок по числу — ввести значение. Очки каждого
     игрока — отдельное поле, так что одновременные нажатия не теряются. */
  import Crown from "@lucide/svelte/icons/crown";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import { flip } from "svelte/animate";
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import { addScore, playersOf, scoreOf, setScore } from "./play.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const step = $derived(p.step && p.step > 0 ? p.step : 1);
  const rows = $derived.by(() => {
    const list = playersOf(p).map((x, i) => ({ ...x, i, n: scoreOf(p, x.id) }));
    return p.sort ? [...list].sort((a, c) => c.n - a.n || a.i - c.i) : list;
  });
  const best = $derived(Math.max(...rows.map((r) => r.n)));
  const lead = $derived(best > 0 && rows.filter((r) => r.n === best).length < rows.length ? best : null);
  const k = $derived(Math.max(0.5, Math.min(v.w / 300, 1.6)));
  /* высота строки — по месту, но не крупнее, чем позволяет ширина: иначе
     имя команды съедается кнопками и числом */
  const rowH = $derived(Math.max(24, Math.min(64, 46 * k, (v.h - 44 * k) / Math.max(1, rows.length) - 5)));
  let typing = $state<string | null>(null);

  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }));

  function bump(e: MouseEvent, pid: string, dir: 1 | -1) {
    e.stopPropagation();
    if (!b.readonly) addScore(b, v, pid, dir * step * (e.shiftKey ? 10 : 1));
  }
  function commit(e: Event, pid: string) {
    if (typing !== pid) return;
    typing = null;
    const raw = (e.currentTarget as HTMLInputElement).value.replace(",", ".").replace(/\s/g, "");
    const n = Number(raw);
    if (raw && Number.isFinite(n)) setScore(b, v, pid, n);
  }
  function onkey(e: KeyboardEvent, pid: string) {
    e.stopPropagation();
    if (e.key === "Enter") commit(e, pid);
    if (e.key === "Escape") typing = null;
  }
</script>

<div class="card sc-card" style:--k={k} style:--rh="{rowH}px">
  <div class="sc-head"><span class="sc-title"><TitleEdit {v} placeholder="Счёт" /></span></div>
  <ol class="sc-list" data-ui>
    {#each rows as r (r.id)}
      <li class="sc-row" class:lead={lead !== null && r.n === lead} style:--pc={colorCss(r.c)} animate:flip={{ duration: 260 }}>
        <span class="sc-name">{#if lead !== null && r.n === lead}<Crown size={Math.round(rowH * 0.36)} />{/if}{r.t || `Игрок ${r.i + 1}`}</span>
        <button class="sc-btn" disabled={b.readonly} onclick={(e) => bump(e, r.id, -1)} aria-label="Минус {fmt(step)} — {r.t}"><Minus size={Math.round(rowH * 0.36)} strokeWidth={2.6} /></button>
        {#if typing === r.id}
          <input class="sc-input" inputmode="decimal" value={fmt(r.n)} {@attach focusSelect} onblur={(e) => commit(e, r.id)} onkeydown={(e) => onkey(e, r.id)} />
        {:else}
          {#key r.n}
            <button class="sc-n" disabled={b.readonly} onclick={(e) => (e.stopPropagation(), (typing = r.id))} title={b.readonly ? undefined : "Ввести число"}>{fmt(r.n)}</button>
          {/key}
        {/if}
        <button class="sc-btn" disabled={b.readonly} onclick={(e) => bump(e, r.id, 1)} aria-label="Плюс {fmt(step)} — {r.t}"><Plus size={Math.round(rowH * 0.36)} strokeWidth={2.6} /></button>
      </li>
    {/each}
  </ol>
</div>
