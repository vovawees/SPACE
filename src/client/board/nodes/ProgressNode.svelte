<script lang="ts">
  /* Прогресс: название, процент и полоса. Полосу можно тянуть сразу —
     значение видят все. Шаги делят полосу на этапы. */
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const steps = $derived(p.steps && p.steps > 1 ? p.steps : 0);
  let drag = $state<number | null>(null);
  const value = $derived(drag ?? Math.max(0, Math.min(100, p.pv ?? 0)));
  const renaming = $derived(b.ix.renaming === v.id);
  const label = $derived(steps ? `${Math.round((value / 100) * steps)} из ${steps}` : `${Math.round(value)}%`);

  /* offsetX — в собственных координатах полосы: учитывает масштаб доски и поворот */
  function at(e: PointerEvent, el: HTMLElement): number {
    let k = Math.max(0, Math.min(1, e.offsetX / Math.max(1, el.clientWidth)));
    if (steps) k = Math.round(k * steps) / steps;
    return Math.round(k * 100);
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
    <span class="progress-val">{value >= 100 ? "Готово ✓" : label}</span>
  </div>
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
</div>
