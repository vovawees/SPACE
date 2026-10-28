<script lang="ts">
  /* Прогресс: название, процент и полоса. Полосу можно тянуть сразу —
     значение видят все. Шаги делят полосу на этапы. */
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import { playSound } from "./sound.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const steps = $derived(p.steps && p.steps > 1 ? p.steps : 0);
  let drag = $state<number | null>(null);
  const value = $derived(drag ?? Math.max(0, Math.min(100, p.pv ?? 0)));
  const renaming = $derived(b.ix.renaming === v.id);
  /** Подпись: проценты, «4 из 10» (этапы или «сколько всего») или ничего. */
  const pf = $derived(p.pf ?? (steps ? "frac" : "pct"));
  const total = $derived(steps || Math.max(1, Math.round(p.max ?? 100)));
  const label = $derived(pf === "none" ? "" : pf === "frac" ? `${Math.round((value / 100) * total)} из ${total}` : `${Math.round(value)}%`);
  /** Шаг кнопок − и +: один этап, одна единица из «сколько всего» или 10 %. */
  const unit = $derived(steps ? 100 / steps : pf === "frac" ? 100 / total : 10);

  function bump(e: MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    if (b.readonly) return;
    const cur = Math.max(0, Math.min(100, p.pv ?? 0));
    // сначала — к ближайшему делению, потом шагами
    const idx = dir > 0 ? Math.floor(cur / unit + 1e-6) + 1 : Math.ceil(cur / unit - 1e-6) - 1;
    const next = Math.max(0, Math.min(100, Math.round(idx * unit * 100) / 100));
    if (next === cur) return;
    b.view.update(v.id, { pv: next });
    playSound(next >= 100 ? "win" : "click");
  }

  /* offsetX — в собственных координатах полосы: учитывает масштаб доски и поворот */
  function at(e: PointerEvent, el: HTMLElement): number {
    let k = Math.max(0, Math.min(1, e.offsetX / Math.max(1, el.clientWidth)));
    const div = steps || (pf === "frac" && total <= 200 ? total : 0);
    if (div) k = Math.round(k * div) / div;
    return Math.round(k * 10000) / 100;
  }

  function down(e: PointerEvent) {
    if (b.readonly || e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    drag = at(e, el);
  }
  function move(e: PointerEvent) {
    if (drag === null) return;
    drag = at(e, e.currentTarget as HTMLElement);
  }
  function up() {
    if (drag === null) return;
    const val = drag;
    drag = null;
    if (val !== (p.pv ?? 0)) b.view.update(v.id, { pv: val });
  }

  function commitTitle(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.trim();
    if (b.ix.renaming !== v.id) return;
    b.ix.renaming = null;
    if (val !== (p.title ?? "")) b.view.update(v.id, { title: val || undefined });
  }
</script>

<div class="card progress-card" class:full={value >= 100}>
  <div class="progress-head">
    <span class="progress-title">
      {#if renaming}
        <input
          class="rename"
          data-ui
          value={p.title ?? ""}
          placeholder="Прогресс"
          {@attach focusSelect}
          onblur={commitTitle}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitTitle(e);
            if (e.key === "Escape") b.ix.renaming = null;
          }}
        />
      {:else}
        {p.title || "Прогресс"}
      {/if}
    </span>
    {#if value >= 100 || label}<span class="progress-val">{value >= 100 ? "Готово ✓" : label}</span>{/if}
  </div>
  <div class="progress-row">
  {#if p.pb}
    <button class="progress-btn" data-ui disabled={b.readonly || value <= 0} aria-label="Меньше" onclick={(e) => bump(e, -1)}><Minus size={14} strokeWidth={2.6} /></button>
  {/if}
  <div
    class="progress-track"
    class:live={!b.readonly}
    class:dragging={drag !== null}
    data-ui
    role="slider"
    tabindex="-1"
    aria-label={p.title || "Прогресс"}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <span class="progress-fill" style:width="{value}%"></span>
    {#if steps}
      {#each Array.from({ length: steps - 1 }, (_, i) => i + 1) as i (i)}
        <i style:left="{(i / steps) * 100}%"></i>
      {/each}
    {/if}
  </div>
  {#if p.pb}
    <button class="progress-btn" data-ui disabled={b.readonly || value >= 100} aria-label="Больше" onclick={(e) => bump(e, 1)}><Plus size={14} strokeWidth={2.6} /></button>
  {/if}
  </div>
</div>
