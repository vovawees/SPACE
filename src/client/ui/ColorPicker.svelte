<script lang="ts">
  /* Палитра: квадрат насыщенности/яркости, полоса оттенка, #hex, пипетка,
     готовые и недавние цвета. Работает мышью, пальцем и с клавиатуры. */
  import Pipette from "@lucide/svelte/icons/pipette";
  import { untrack } from "svelte";
  import { SWATCHES, hexToRgb, hsvToHex, normHex, resolveCss, rgbToHsv, type HSV } from "../lib/color.ts";
  import { recentColors, rememberColor, type HexColor } from "./colorpick.svelte.ts";

  interface Props {
    value?: string;
    /** На лету, пока тянут (не чаще ~20 раз в секунду). */
    oninput?: (hex: HexColor) => void;
    /** Окончательный выбор: отпустили, ввели #hex, выбрали образец. */
    onchange?: (hex: HexColor) => void;
    /** Enter в поле #hex или двойной щелчок по образцу. */
    onsubmit?: () => void;
    swatches?: boolean;
  }
  let { value = "#f08a4b", oninput, onchange, onsubmit, swatches = true }: Props = $props();

  const start = untrack(() => resolveCss(value) ?? "#f08a4b");
  let hsv = $state<HSV>(rgbToHsv(hexToRgb(start)!));
  let hexText = $state<string>(start);
  const hex = $derived(hsvToHex(hsv));
  const hueCss = $derived(`hsl(${hsv.h} 100% 50%)`);
  const recent = $state(recentColors(undefined, 10));
  const canDrop = typeof window !== "undefined" && "EyeDropper" in window;

  let last = 0;
  let pendingT: ReturnType<typeof setTimeout> | undefined;
  function live() {
    hexText = hex;
    clearTimeout(pendingT);
    const now = performance.now();
    if (now - last > 50) {
      last = now;
      oninput?.(hex as HexColor);
    } else pendingT = setTimeout(() => {
      last = performance.now();
      oninput?.(hex as HexColor);
    }, 50);
  }
  function commit() {
    clearTimeout(pendingT);
    hexText = hex;
    rememberColor(hex as HexColor);
    onchange?.(hex as HexColor);
  }
  function setHex(h: string, final = true) {
    const n = normHex(h) ?? resolveCss(h);
    if (!n) return false;
    const next = rgbToHsv(hexToRgb(n)!);
    // у серых оттенок не определён — сохраняем прежний
    if (next.s === 0) next.h = hsv.h;
    hsv = next;
    hexText = n;
    if (final) commit();
    else live();
    return true;
  }

  function track(e: PointerEvent, apply: (fx: number, fy: number) => void) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
    const at = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      apply(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
      live();
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      commit();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  const padDown = (e: PointerEvent) => track(e, (fx, fy) => (hsv = { ...hsv, s: fx, v: 1 - fy }));
  const hueDown = (e: PointerEvent) => track(e, (fx) => (hsv = { ...hsv, h: Math.min(359.9, fx * 360) }));

  function padKey(e: KeyboardEvent) {
    const d = e.shiftKey ? 0.1 : 0.02;
    const k: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const m = k[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    hsv = { ...hsv, s: Math.max(0, Math.min(1, hsv.s + m[0])), v: Math.max(0, Math.min(1, hsv.v + m[1])) };
    commit();
  }
  function hueKey(e: KeyboardEvent) {
    const d = e.shiftKey ? 15 : 3;
    const m = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -d : e.key === "ArrowRight" || e.key === "ArrowUp" ? d : 0;
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    hsv = { ...hsv, h: (hsv.h + m + 360) % 360 };
    commit();
  }

  async function eyedrop() {
    try {
      const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const r = await new Ctor().open();
      setHex(r.sRGBHex);
    } catch {
      /* отменили */
    }
  }

  function hexKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      if (setHex(hexText)) onsubmit?.();
    }
  }
</script>

<div class="cp" style:--hue={hueCss} style:--cur={hex}>
  <div
    class="pad"
    role="slider"
    tabindex="0"
    aria-label="Насыщенность и яркость"
    aria-valuetext="{Math.round(hsv.s * 100)}% насыщенности, {Math.round(hsv.v * 100)}% яркости"
    aria-valuenow={Math.round(hsv.s * 100)}
    onpointerdown={padDown}
    onkeydown={padKey}
  >
    <span class="knob" style:left="{hsv.s * 100}%" style:top="{(1 - hsv.v) * 100}%"></span>
  </div>
  <div class="hue" role="slider" tabindex="0" aria-label="Оттенок" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} onpointerdown={hueDown} onkeydown={hueKey}>
    <span class="knob" style:left="{(hsv.h / 360) * 100}%"></span>
  </div>
  <div class="row">
    <span class="now" aria-hidden="true"></span>
    <label class="hex">
      <span>#</span>
      <input
        value={hexText.replace("#", "")}
        maxlength="7"
        spellcheck="false"
        autocomplete="off"
        aria-label="Код цвета"
        oninput={(e) => {
          hexText = (e.currentTarget as HTMLInputElement).value;
          const n = normHex(hexText);
          if (n && n.length === 7 && (e.currentTarget as HTMLInputElement).value.replace("#", "").length >= 6) setHex(n, false);
        }}
        onblur={() => setHex(hexText) || (hexText = hex)}
        onkeydown={hexKey}
      />
    </label>
    {#if canDrop}
      <button type="button" class="drop" onclick={eyedrop} aria-label="Пипетка — взять цвет с экрана" title="Пипетка"><Pipette size={15} /></button>
    {/if}
  </div>
  {#if swatches}
    <div class="sw" role="group" aria-label="Готовые цвета">
      {#each SWATCHES as c (c)}
        <button type="button" class="dot" class:on={hex === c} style:--dot={c} aria-label={c} title={c} onclick={() => setHex(c)} ondblclick={() => onsubmit?.()}></button>
      {/each}
    </div>
    {#if recent.length}
      <div class="lbl">Недавние</div>
      <div class="sw" role="group" aria-label="Недавние цвета">
        {#each recent as c (c)}
          <button type="button" class="dot" class:on={hex === c} style:--dot={c} aria-label={c} title={c} onclick={() => setHex(c)} ondblclick={() => onsubmit?.()}></button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .cp {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    user-select: none;
    -webkit-user-select: none;
  }
  .pad {
    position: relative;
    height: 150px;
    border-radius: 10px;
    background:
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, transparent),
      var(--hue);
    touch-action: none;
    cursor: crosshair;
    outline: none;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.2);
  }
  .pad:focus-visible,
  .hue:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .knob {
    position: absolute;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    border-radius: 50%;
    border: 2.5px solid #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35), 0 2px 6px rgb(0 0 0 / 0.35);
    background: var(--cur);
    pointer-events: none;
  }
  .hue {
    position: relative;
    height: 14px;
    border-radius: 99px;
    background: linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00);
    touch-action: none;
    cursor: ew-resize;
    outline: none;
  }
  .hue .knob {
    top: 50%;
    background: var(--hue);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .now {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--cur);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.2);
    flex: none;
  }
  .hex {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    background: var(--surface-1);
    border: 1px solid var(--line-2);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13.5px;
    color: var(--ink-3);
  }
  .hex:focus-within {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .hex input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--ink);
    font: inherit;
    text-transform: lowercase;
  }
  .drop {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-2);
    background: var(--surface-2);
    flex: none;
  }
  .drop:hover {
    color: var(--ink);
    background: var(--hover);
  }
  .sw {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
  }
  .dot {
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--dot);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.18);
    transition: transform var(--t-fast);
  }
  .dot:hover {
    transform: scale(1.15);
  }
  .dot.on {
    box-shadow: 0 0 0 2px var(--surface-1), 0 0 0 3.5px var(--ink-2);
  }
  .lbl {
    font-size: 10.5px;
    font-weight: 620;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 2px 0 -4px;
  }
  @media (pointer: coarse) {
    .pad {
      height: 180px;
    }
    .hue {
      height: 22px;
    }
    .knob {
      width: 24px;
      height: 24px;
      margin: -12px 0 0 -12px;
    }
    .sw {
      gap: 7px;
    }
  }
</style>
