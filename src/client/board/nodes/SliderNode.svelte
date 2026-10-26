<script lang="ts">
  /* Ползунок: число в пределах, тянуть может любой участник. Подходит
     для оценок «насколько», бюджета, громкости и как источник логики. */
  import { useBoard } from "../board.svelte.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { fmtNum } from "./values.ts";
  import { clampSlider } from "./widgets.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const lo = $derived(p.min ?? 0);
  const hi = $derived(Math.max(lo + 0.001, p.max ?? 100));
  let drag = $state<number | null>(null);
  const val = $derived(drag ?? clampSlider(v, p.sv ?? lo));
  const pct = $derived(((val - lo) / (hi - lo)) * 100);
  const k = $derived(Math.max(0.5, Math.min(v.w / 300, v.h / 96)));
  const unit = $derived(p.unit ? (p.unit === "%" ? "%" : ` ${p.unit}`) : "");

  function at(e: PointerEvent, el: HTMLElement): number {
    const f = Math.max(0, Math.min(1, e.offsetX / Math.max(1, el.clientWidth)));
    return clampSlider(v, lo + f * (hi - lo));
  }
  function down(e: PointerEvent) {
    if (b.readonly || e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    drag = at(e, el);
  }
  function move(e: PointerEvent) {
    if (drag !== null) drag = at(e, e.currentTarget as HTMLElement);
  }
  function up() {
    if (drag === null) return;
    const x = drag;
    drag = null;
    if (x !== p.sv) b.view.update(v.id, { sv: x });
  }
</script>

<div class="card sl-card" style:--k={k}>
  <div class="sl-head">
    <span class="sl-title"><TitleEdit {v} placeholder="Ползунок" /></span>
    <span class="sl-val">{fmtNum(val)}{unit}</span>
  </div>
  <div
    class="sl-track"
    class:live={!b.readonly}
    class:dragging={drag !== null}
    data-ui
    role="slider"
    tabindex="-1"
    aria-label={p.title || "Ползунок"}
    aria-valuemin={lo}
    aria-valuemax={hi}
    aria-valuenow={val}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <span class="sl-fill" style:width="{pct}%"></span>
    <span class="sl-thumb" style:left="{pct}%"></span>
  </div>
  <div class="sl-scale"><span>{fmtNum(lo)}</span><span>{fmtNum(hi)}</span></div>
</div>
