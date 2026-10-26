<script lang="ts">
  /* Переключатель «вкл/выкл»: щёлкнуть может любой участник. Через
     стрелки с логикой управляет другими объектами. */
  import { useBoard } from "../board.svelte.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { setSwitch } from "./widgets.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const on = $derived(!!v.props.on);
  const k = $derived(Math.max(0.45, Math.min(v.w / 220, v.h / 72)));

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (!b.readonly) setSwitch(b, [v.id], "toggle");
  }
</script>

<div class="card sw-card" class:on style:--k={k}>
  <div class="sw-text">
    <span class="sw-title"><TitleEdit {v} placeholder="Переключатель" /></span>
    <span class="sw-state">{on ? "Включено" : "Выключено"}</span>
  </div>
  <button class="sw" class:on role="switch" aria-checked={on} aria-label={v.props.title || "Переключатель"} data-ui disabled={b.readonly} onclick={toggle}>
    <span class="sw-knob"></span>
  </button>
</div>
