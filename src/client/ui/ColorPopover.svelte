<script lang="ts">
  /* Всплывающая палитра «свой цвет» (одна на приложение). Цвет применяется
     на лету; Esc или «Отмена» возвращают прежний. На телефоне — снизу. */
  import { computePosition, flip, offset, shift } from "@floating-ui/dom";
  import { MediaQuery } from "svelte/reactivity";
  import ColorPicker from "./ColorPicker.svelte";
  import { closePicker, picker } from "./colorpick.svelte.ts";

  const sheet = new MediaQuery("(max-width: 640px)");
  let panel = $state<HTMLDivElement>();
  let changed = false;

  $effect(() => {
    const o = picker.open;
    const el = panel;
    if (!o || !el) return;
    changed = false;
    if (sheet.current) {
      el.style.left = "";
      el.style.top = "";
      el.dataset.shown = "";
      return;
    }
    const anchor = { getBoundingClientRect: () => ({ x: o.x, y: o.y, left: o.x, top: o.y, right: o.x, bottom: o.y, width: 0, height: 0 }) };
    void computePosition(anchor, el, { placement: "bottom-start", strategy: "fixed", middleware: [offset(6), flip(), shift({ padding: 8 })] }).then(({ x, y }) => {
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.dataset.shown = "";
    });
  });

  function apply(hex: string) {
    changed = true;
    picker.open?.pick(hex);
  }

  function cancel() {
    const o = picker.open;
    if (o && changed && o.initial) o.pick(o.initial);
    closePicker();
  }

  function outside(e: PointerEvent) {
    if (!picker.open) return;
    if ((e.target as Element | null)?.closest?.(".cpop")) return;
    closePicker();
  }

  function key(e: KeyboardEvent) {
    if (!picker.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }
</script>

<svelte:window onpointerdowncapture={outside} onkeydowncapture={key} />

{#if picker.open}
  {#key picker.seq}
    <div class="cpop glass" class:sheet={sheet.current} bind:this={panel} role="dialog" aria-label={picker.open.title ?? "Свой цвет"} tabindex="-1">
      <div class="head">{picker.open.title ?? "Свой цвет"}</div>
      <ColorPicker value={picker.open.initial && picker.open.initial !== "default" ? (picker.open.initial.startsWith("#") ? picker.open.initial : `var(--c-${picker.open.initial})`) : "#f08a4b"} oninput={apply} onchange={apply} onsubmit={closePicker} />
      <div class="btns">
        {#if picker.open.clear}
          <button
            type="button"
            class="btn ghost sm"
            onclick={() => {
              picker.open?.clear?.();
              closePicker();
            }}>Без цвета</button
          >
        {/if}
        <span class="sp"></span>
        <button type="button" class="btn ghost sm" onclick={cancel}>Отмена</button>
        <button type="button" class="btn primary sm" onclick={closePicker}>Готово</button>
      </div>
    </div>
  {/key}
{/if}

<style>
  .cpop {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 70;
    width: 268px;
    padding: 12px;
    border-radius: var(--r-3);
    display: flex;
    flex-direction: column;
    gap: 10px;
    visibility: hidden;
  }
  .cpop:global([data-shown]) {
    visibility: visible;
    animation: cp-in 150ms var(--ease-spring, var(--ease-out));
  }
  @keyframes cp-in {
    from {
      opacity: 0;
      scale: 0.94;
    }
  }
  .cpop.sheet {
    left: 8px !important;
    right: 8px;
    top: auto !important;
    bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    width: auto;
    padding: 14px 14px 12px;
  }
  .head {
    font-size: 12px;
    font-weight: 640;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .btns {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sp {
    flex: 1;
  }
</style>
