<script lang="ts">
  /* Одно поле панели настроек. Числа можно менять стрелками ↑↓
     (Shift — ×10) и протягиванием подписи влево-вправо. */
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import { localInput } from "../../nodes/widgets.ts";
  import { menu } from "../../../ui/menu.svelte.ts";
  import type { Field } from "../../inspect/types.ts";
  import ColorDots from "./ColorDots.svelte";
  import DurField from "./DurField.svelte";
  import EmojiField from "./EmojiField.svelte";
  import IconField from "./IconField.svelte";
  import ListEdit from "./ListEdit.svelte";

  let { f }: { f: Field } = $props();

  const stop = (e: KeyboardEvent) => e.stopPropagation();

  /* ------------------------------ числа ------------------------------ */

  let live = $state<number | null>(null);
  let tmr: ReturnType<typeof setTimeout> | undefined;
  let pend: number | null = null;
  const numF = $derived(f.k === "num" ? f : null);
  const cur = $derived(live ?? (numF ? numF.get() : null));
  const fmt = (n: number | null) => (n === null ? "" : Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000).replace(".", ","));

  function clamp(n: number): number {
    const g = numF!;
    let x = n;
    if (g.int) x = Math.round(x);
    if (typeof g.min === "number") x = Math.max(g.min, x);
    if (typeof g.max === "number") x = Math.min(g.max, x);
    return Math.round(x * 1e6) / 1e6;
  }
  function putNum(n: number | null) {
    if (!numF) return;
    if (n === null) {
      if (numF.empty || numF.get() === null) numF.set(null);
      return;
    }
    const x = clamp(n);
    if (x !== numF.get()) numF.set(x);
  }
  /** Частая запись (ползунок, протягивание) — не чаще 15 раз в секунду. */
  function soon(n: number) {
    live = clamp(n);
    pend = live;
    tmr ??= setTimeout(flush, 66);
  }
  function flush() {
    clearTimeout(tmr);
    tmr = undefined;
    if (pend !== null) putNum(pend);
    pend = null;
  }
  function done() {
    flush();
    live = null;
  }
  function parse(raw: string): number | null {
    const t = raw.replace(",", ".").replace(/\s+/g, "").replace("−", "-");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }
  function commitNum(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const n = parse(el.value);
    if (Number.isNaN(n)) {
      el.value = fmt(numF?.get() ?? null);
      return;
    }
    putNum(n);
    el.value = fmt(numF?.get() ?? null);
  }
  const step = $derived(numF?.step ?? 1);
  function bump(dir: number, big = false) {
    if (!numF) return;
    const base = numF.get() ?? numF.min ?? 0;
    putNum(base + dir * step * (big ? 10 : 1));
  }
  function numKey(e: KeyboardEvent) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") {
      commitNum(e);
      el.blur();
    } else if (e.key === "Escape") {
      el.value = fmt(numF?.get() ?? null);
      el.blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      bump(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
      queueMicrotask(() => (el.value = fmt(numF?.get() ?? null)));
    }
  }

  /* протягивание подписи */
  let scrub: { x: number; v: number } | null = null;
  function scrubDown(e: PointerEvent) {
    if (!numF || numF.disabled || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrub = { x: e.clientX, v: numF.get() ?? numF.min ?? 0 };
  }
  function scrubMove(e: PointerEvent) {
    if (!scrub) return;
    const dx = e.clientX - scrub.x;
    if (Math.abs(dx) < 2 && live === null) return;
    soon(scrub.v + Math.round(dx / 4) * step * (e.shiftKey ? 10 : 1));
  }
  function scrubUp() {
    if (!scrub) return;
    scrub = null;
    done();
  }

  /* ------------------------------ текст ------------------------------ */

  function textKey(e: KeyboardEvent) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    if (e.key === "Escape" && f.k === "text") {
      el.value = f.get();
      el.blur();
    } else if (e.key === "Enter" && (el.tagName === "INPUT" || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      el.blur();
    }
  }

  /* ------------------------------ дата ------------------------------ */

  function when(raw: string) {
    if (f.k !== "when") return;
    const t = raw ? new Date(raw).getTime() : NaN;
    f.set(Number.isFinite(t) ? t : null);
  }
</script>

{#snippet label(text: string | undefined, scrubbable = false)}
  {#if text}
    {#if scrubbable}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="in-label scrub" title="Потяните влево-вправо" onpointerdown={scrubDown} onpointermove={scrubMove} onpointerup={scrubUp} onpointercancel={scrubUp}>{text}</span>
    {:else}
      <span class="in-label">{text}</span>
    {/if}
  {/if}
{/snippet}

<div class="in-field k-{f.k}" class:half={f.half} class:off={f.disabled}>
  {#if f.k === "toggle"}
    <label class="in-toggle">
      <span class="in-toggle-t">{f.label}{#if f.hint}<small>{f.hint}</small>{/if}</span>
      <button type="button" class="switch" class:on={f.get()} role="switch" aria-checked={f.get()} aria-label={f.label} disabled={f.disabled} onclick={() => f.k === "toggle" && f.set(!f.get())}></button>
    </label>
  {:else if f.k === "btns"}
    <div class="in-btns">
      {#each f.btns as x (x.label)}
        {@const I = x.icon}
        <button type="button" class="btn sm {x.primary ? 'primary' : 'ghost'} in-btn" class:danger-text={x.danger} disabled={x.disabled} title={x.title} onclick={(e) => x.run(e)}>
          {#if I}<I size={14} />{/if}{x.label}
        </button>
      {/each}
    </div>
  {:else if f.k === "info"}
    <p class="in-info">{f.text}</p>
  {:else}
    {@render label(f.label, f.k === "num" && !f.slider)}
    {#if f.k === "text"}
      {#if f.lines && f.lines > 1}
        <textarea class="input sm in-area" rows={f.lines} value={f.get()} placeholder={f.ph ?? ""} maxlength={f.max} disabled={f.disabled} onchange={(e) => f.k === "text" && f.set(e.currentTarget.value)} onkeydown={textKey}></textarea>
      {:else}
        <input class="input sm" class:mono={f.mono} value={f.get()} placeholder={f.ph ?? ""} maxlength={f.max} disabled={f.disabled} onchange={(e) => f.k === "text" && f.set(e.currentTarget.value)} onkeydown={textKey} />
      {/if}
    {:else if f.k === "num"}
      <div class="in-num" class:stepper={f.stepper}>
        {#if f.stepper}
          <button type="button" class="in-step" aria-label="Меньше" disabled={f.disabled || (typeof f.min === "number" && (cur ?? 0) <= f.min)} onclick={(e) => bump(-1, e.shiftKey)}><Minus size={14} /></button>
        {/if}
        <input class="input sm" inputmode="decimal" value={fmt(cur)} placeholder={f.ph ?? ""} disabled={f.disabled} aria-label={f.label} onchange={commitNum} onkeydown={numKey} onfocus={(e) => e.currentTarget.select()} />
        {#if f.unit}<span class="in-unit">{f.unit}</span>{/if}
        {#if f.stepper}
          <button type="button" class="in-step" aria-label="Больше" disabled={f.disabled || (typeof f.max === "number" && (cur ?? 0) >= f.max)} onclick={(e) => bump(1, e.shiftKey)}><Plus size={14} /></button>
        {/if}
      </div>
      {#if f.slider}
        <input
          class="in-range"
          type="range"
          min={f.min ?? 0}
          max={f.max ?? 100}
          step={f.step ?? 1}
          value={cur ?? f.min ?? 0}
          disabled={f.disabled}
          aria-label={f.label}
          oninput={(e) => soon(+e.currentTarget.value)}
          onchange={done}
        />
      {/if}
    {:else if f.k === "seg"}
      <div class="seg in-seg" role="radiogroup" aria-label={f.label}>
        {#each f.opts as [val, text] (val)}
          <button type="button" class:on={f.get() === val} role="radio" aria-checked={f.get() === val} disabled={f.disabled} onclick={() => f.k === "seg" && f.set(val)}>{text}</button>
        {/each}
      </div>
    {:else if f.k === "chips"}
      <div class="in-chips" role="radiogroup" aria-label={f.label}>
        {#each f.opts as [val, text] (val)}
          <button type="button" class="in-chip" class:on={f.get() === val} role="radio" aria-checked={f.get() === val} onclick={() => f.k === "chips" && f.set(val)}>{text}</button>
        {/each}
        {#if f.more}
          <button type="button" class="in-chip" onclick={(e) => f.k === "chips" && f.more?.run(e)}>{f.more.label}</button>
        {/if}
      </div>
    {:else if f.k === "select"}
      <select class="input sm in-select" value={f.get()} disabled={f.disabled} aria-label={f.label} onchange={(e) => f.k === "select" && f.set(e.currentTarget.value)}>
        {#each f.opts as [val, text] (val)}<option value={val}>{text}</option>{/each}
      </select>
    {:else if f.k === "menu"}
      {@const cur = f.get()}
      <button
        type="button"
        class="input sm in-menu"
        aria-haspopup="menu"
        aria-label={f.label}
        disabled={f.disabled}
        onclick={(e) => f.k === "menu" && menu.dropdown(e.currentTarget, f.items())}
      >
        <span style:font-family={cur.font} style:font-size-adjust={cur.adj}>{cur.text}</span>
        <ChevronDown size={14} />
      </button>
    {:else if f.k === "dur"}
      <DurField value={f.get()} set={f.set} presets={f.presets} min={f.min} />
    {:else if f.k === "when"}
      <div class="in-line">
        <input class="input sm" type="datetime-local" value={localInput(f.get())} onchange={(e) => when(e.currentTarget.value)} onkeydown={stop} />
        {#if f.get() !== null}
          <button type="button" class="chip in-x" aria-label="Без даты" title="Без даты" onclick={() => f.k === "when" && f.set(null)}><X size={14} /></button>
        {/if}
      </div>
      {#if f.presets?.length}
        <div class="in-chips">
          {#each f.presets as [text, at] (text)}
            <button type="button" class="in-chip" onclick={() => f.k === "when" && f.set(at())}>{text}</button>
          {/each}
        </div>
      {/if}
    {:else if f.k === "date"}
      <div class="in-line">
        <input class="input sm" type="date" value={f.get() ?? ""} onchange={(e) => f.k === "date" && f.set(e.currentTarget.value || null)} onkeydown={stop} />
        {#if f.get()}
          <button type="button" class="chip in-x" aria-label="Без срока" title="Без срока" onclick={() => f.k === "date" && f.set(null)}><X size={14} /></button>
        {/if}
      </div>
    {:else if f.k === "color"}
      <ColorDots cur={f.get()} apply={f.set} title={f.label ?? "Цвет"} none={f.none} neutral={false} />
    {:else if f.k === "emoji"}
      <EmojiField value={f.get()} set={f.set} />
    {:else if f.k === "icon"}
      <IconField value={f.get()} set={f.set} />
    {:else if f.k === "list"}
      <ListEdit {f} />
    {/if}
    {#if f.hint}<small class="in-hint">{f.hint}</small>{/if}
  {/if}
</div>
