<script lang="ts">
  /* Колесо фортуны: кто дежурит, что обсуждаем, кто ходит первым.
     Крутит любой — у всех колесо крутится одинаково и останавливается на
     одном варианте. Двойной щелчок — изменить варианты. */
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { addOption, removeOption, renameOption } from "./poll.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { SPIN_MS, WHEEL_COLORS, spinWheel, wheelOptions, wheelResult } from "./widgets.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const opts = $derived(wheelOptions(v));
  const n = $derived(opts.length);
  const seg = $derived(360 / n);
  const result = $derived(wheelResult(v));
  const size = $derived(Math.max(60, Math.min(v.w - 20, v.h - 20 - 26 - 28)));
  const font = $derived(n <= 4 ? 13 : n <= 8 ? 11.5 : n <= 14 ? 9.5 : 7.5);
  const maxChars = $derived(n <= 6 ? 14 : n <= 12 ? 11 : 8);

  let angle = $state(untrack(() => v.props.spin?.a ?? 0));
  let spinning = $state(false);
  let lastSeq = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const sp = p.spin;
    const seq = sp?.s ?? 0;
    untrack(() => {
      if (lastSeq !== -1 && seq !== lastSeq && sp) {
        spinning = true;
        clearTimeout(timer);
        timer = setTimeout(() => (spinning = false), SPIN_MS);
      }
      lastSeq = seq;
      angle = sp?.a ?? 0;
    });
  });
  $effect(() => () => clearTimeout(timer));

  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
  };
  const segPath = (i: number) => (n === 1 ? "M-96 0a96 96 0 1 0 192 0a96 96 0 1 0 -192 0Z" : `M0 0L${pt(i * seg, 96)}A96 96 0 0 1 ${pt((i + 1) * seg, 96)}Z`);
  const short = (t: string) => (t.length > maxChars ? t.slice(0, maxChars - 1) + "…" : t);

  function go(e: MouseEvent) {
    e.stopPropagation();
    if (!spinning) spinWheel(b, [v.id]);
  }

  /* правка вариантов: список хранится в opts, как у опроса */
  function ensure() {
    if (!Array.isArray(p.opts) || !p.opts.length) b.view.update(v.id, { opts: wheelOptions(v) });
  }
  function optKey(e: KeyboardEvent, i: number) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "Escape") b.ix.stopEditing();
    else if (e.key === "Enter") {
      e.preventDefault();
      if (i === opts.length - 1) {
        ensure();
        addOption(b, b.view.get(v.id)!, "");
      }
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-id="${v.id}"] [data-opt="${i + 1}"]`)?.focus());
    } else if (e.key === "Backspace" && !el.value && opts.length > 2) {
      e.preventDefault();
      ensure();
      removeOption(b, b.view.get(v.id)!, opts[i]!.id);
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-id="${v.id}"] [data-opt="${Math.max(0, i - 1)}"]`)?.focus());
    }
  }
</script>

<div class="card wh-card" class:spinning>
  <div class="wh-title"><TitleEdit {v} placeholder="Колесо фортуны" /></div>
  {#if editing && !b.readonly}
    <div class="wh-edit scroll" data-ui>
      {#each opts as o, i (o.id)}
        <div class="wh-row">
          <span class="wh-sw" style:background={WHEEL_COLORS[i % WHEEL_COLORS.length]}></span>
          <input
            data-opt={i}
            value={o.t}
            placeholder="Вариант {i + 1}"
            oninput={(e) => {
              ensure();
              renameOption(b, b.view.get(v.id)!, o.id, e.currentTarget.value);
            }}
            onkeydown={(e) => optKey(e, i)}
          />
          <button
            class="icon-btn sm"
            disabled={opts.length <= 2}
            aria-label="Убрать вариант"
            onclick={() => {
              ensure();
              removeOption(b, b.view.get(v.id)!, o.id);
            }}><X size={13} /></button
          >
        </div>
      {/each}
      <button
        class="btn ghost sm"
        disabled={opts.length >= 24}
        onclick={() => {
          ensure();
          addOption(b, b.view.get(v.id)!, "");
          requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-id="${v.id}"] [data-opt="${opts.length}"]`)?.focus());
        }}><Plus size={14} /> Вариант</button
      >
    </div>
  {:else}
    <div class="wh-stage" style:width="{size}px" style:height="{size}px">
      <svg class="wh-svg" viewBox="-100 -100 200 200" aria-hidden="true">
        <g class="wh-rot" style:transform="rotate({angle}deg)" style:transition-duration={spinning ? `${SPIN_MS}ms` : "0ms"}>
          {#each opts as o, i (o.id)}
            <path d={segPath(i)} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} class="wh-seg" class:win={!spinning && result?.id === o.id} />
            <text transform="rotate({i * seg + seg / 2 - 90}) translate(60 0)" class="wh-lab" style:font-size="{font}px">{short(o.t || `Вариант ${i + 1}`)}</text>
          {/each}
        </g>
        <circle r="97" class="wh-rim" />
        <path d="M-9 -104 L9 -104 L0 -86 Z" class="wh-ptr" />
      </svg>
      <button class="wh-go" data-ui disabled={b.readonly || spinning} onclick={go} aria-label="Крутить колесо">{spinning ? "…" : "Крутить"}</button>
    </div>
    <div class="wh-res" aria-live="polite">
      {#if spinning}
        Крутит {p.spin?.n ?? ""}…
      {:else if result}
        Выпало: <b>{result.t || "без названия"}</b>
      {:else}
        {n} {n < 5 ? "варианта" : "вариантов"} · двойной щелчок — изменить
      {/if}
    </div>
  {/if}
</div>
