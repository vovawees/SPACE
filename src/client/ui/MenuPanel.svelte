<script lang="ts">
  import { pickColor, recentColors } from "./colorpick.svelte.ts";
  import { computePosition, flip, offset, shift, size, type Placement, type VirtualElement } from "@floating-ui/dom";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Check from "@lucide/svelte/icons/check";
  import { onMount, tick } from "svelte";
  import { keyLabel } from "../lib/util.ts";
  import type { MenuEntry, MenuItem } from "./menu.svelte.ts";
  import MenuPanel from "./MenuPanel.svelte";

  interface Props {
    entries: MenuEntry[];
    anchor: Element | VirtualElement;
    placement: Placement;
    level?: number;
    onclose: () => void;
    onback?: () => void;
    focusFirst?: boolean;
  }
  let { entries, anchor, placement, level = 0, onclose, onback, focusFirst = false }: Props = $props();

  let panel: HTMLDivElement;
  let active = $state(-1);
  let sub = $state<{ index: number; el: HTMLElement } | null>(null);
  let subFocus = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  /** Меню вырастает из точки, к которой привязано. */
  const ORIGIN: Partial<Record<Placement, string>> = {
    "bottom-start": "top left",
    bottom: "top center",
    "bottom-end": "top right",
    "top-start": "bottom left",
    top: "bottom center",
    "top-end": "bottom right",
    "right-start": "top left",
    right: "center left",
    "right-end": "bottom left",
    "left-start": "top right",
    left: "center right",
    "left-end": "bottom right",
  };

  const isItem = (e: MenuEntry): e is MenuItem => typeof e === "object" && "label" in e;
  const selectable = $derived(entries.map((e, i) => (isItem(e) && !e.disabled && !e.custom ? i : -1)).filter((i) => i >= 0));

  onMount(() => {
    if (focusFirst && selectable.length) active = selectable[0]!;
    // фокус — только после показа: невидимый (visibility: hidden) элемент его не примет
    void place().then(() => panel?.focus({ preventScroll: true }));
  });

  async function place() {
    const { x, y, placement: final } = await computePosition(anchor, panel, {
      placement,
      strategy: "fixed",
      middleware: [
        offset(level ? { mainAxis: 2, crossAxis: -5 } : 4),
        flip({ fallbackAxisSideDirection: "end" }),
        shift({ padding: 8 }),
        size({
          padding: 8,
          apply({ availableHeight }) {
            panel.style.maxHeight = `${Math.max(160, availableHeight)}px`;
          },
        }),
      ],
    });
    // left/top, а не transform: иначе анимация появления затрёт позицию и меню «прилетит» из угла
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.style.transformOrigin = ORIGIN[final] ?? "top left";
    panel.dataset.shown = "";
  }

  function run(item: MenuItem, el: HTMLElement | null) {
    if (item.disabled) return;
    if (item.items) {
      if (el) openSub(entries.indexOf(item), el, true);
      return;
    }
    onclose();
    item.run?.();
  }

  function openSub(index: number, el: HTMLElement, focus = false) {
    clearTimeout(hoverTimer);
    sub = { index, el };
    subFocus = focus;
  }

  function hover(i: number, e: PointerEvent) {
    active = i;
    const item = entries[i];
    clearTimeout(hoverTimer);
    const el = e.currentTarget as HTMLElement;
    if (isItem(item!) && item.items) hoverTimer = setTimeout(() => openSub(i, el), 90);
    else if (sub) hoverTimer = setTimeout(() => (sub = null), 160);
  }

  async function onkey(e: KeyboardEvent) {
    if (sub && subFocus) return; // клавиши обрабатывает подменю
    const pos = selectable.indexOf(active);
    if (e.key === "ArrowDown") {
      active = selectable[(pos + 1) % selectable.length] ?? -1;
    } else if (e.key === "ArrowUp") {
      active = selectable[(pos - 1 + selectable.length) % selectable.length] ?? -1;
    } else if (e.key === "ArrowRight") {
      const item = entries[active];
      if (item && isItem(item) && item.items) {
        await tick();
        const el = panel.querySelector<HTMLElement>(`[data-i="${active}"]`);
        if (el) openSub(active, el, true);
      }
    } else if (e.key === "ArrowLeft" || (e.key === "Escape" && level > 0)) {
      if (level > 0) onback?.();
      else return;
    } else if (e.key === "Enter" || e.key === " ") {
      const item = entries[active];
      if (item && isItem(item)) run(item, panel.querySelector<HTMLElement>(`[data-i="${active}"]`));
    } else if (e.key === "Escape") {
      onclose();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div
  class="menu glass"
  bind:this={panel}
  role="menu"
  tabindex="-1"
  onkeydown={onkey}
  oncontextmenu={(e) => e.preventDefault()}
  style:z-index={60 + level}
>
  {#each entries as entry, i (i)}
    {#if entry === "-"}
      <div class="sep"></div>
    {:else if !isItem(entry)}
      <div class="heading">{entry.heading}</div>
    {:else if entry.custom === "colors"}
      <div class="colors" role="group" aria-label={entry.label}>
        {#each entry.colors ?? [] as c (c.value)}
          <button
            class="dot"
            class:on={entry.current === c.value}
            style:--dot={c.css}
            title={c.label}
            aria-label={c.label}
            onclick={() => {
              onclose();
              entry.pick?.(c.value);
            }}
          ></button>
        {/each}
        {#if entry.allowCustom}
          {#each recentColors(entry.current) as c (c)}
            <button
              class="dot"
              class:on={entry.current === c}
              style:--dot={c}
              title="Свой цвет {c}"
              aria-label="Свой цвет {c}"
              onclick={() => {
                onclose();
                entry.pick?.(c);
              }}
            ></button>
          {/each}
          <button
            class="dot custom"
            title="Свой цвет…"
            aria-label="Свой цвет…"
            onclick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const pick = entry.pick;
              const cur = entry.current;
              onclose();
              pickColor(cur, { x: r.left, y: r.bottom }, (hex) => pick?.(hex), { title: entry.label });
            }}
          ></button>
        {/if}
      </div>
    {:else if entry.custom === "emoji"}
      <div class="emojis" role="group" aria-label={entry.label}>
        {#each entry.emojis ?? [] as em (em)}
          <button
            class="emo"
            class:on={entry.current === em}
            aria-label={em}
            onclick={() => {
              onclose();
              entry.pick?.(em);
            }}>{em}</button
          >
        {/each}
      </div>
    {:else}
      <button
        class="item"
        class:active={active === i}
        class:danger={entry.danger}
        class:open={sub?.index === i}
        disabled={entry.disabled}
        role="menuitem"
        data-i={i}
        onpointerenter={(e) => hover(i, e)}
        onclick={(e) => run(entry, e.currentTarget)}
      >
        <span class="ic">
          {#if entry.checked}
            <Check size={15} strokeWidth={2.2} />
          {:else if entry.icon}
            <entry.icon size={15} strokeWidth={1.9} />
          {:else if entry.iconSvg}
            {@html entry.iconSvg}
          {/if}
        </span>
        <span class="label">{entry.label}</span>
        {#if entry.glyph}
          <!-- образцы строит сам код (headGlyph), пользовательского ввода тут нет -->
          <span class="glyph">{@html entry.glyph}</span>
        {/if}
        {#if entry.keys}
          <span class="keys">{keyLabel(entry.keys).join(" ")}</span>
        {/if}
        {#if entry.items}
          <ChevronRight size={14} class="chev" />
        {/if}
      </button>
    {/if}
  {/each}
</div>

{#if sub}
  {@const item = entries[sub.index] as MenuItem}
  {#key sub.index}
    <MenuPanel
      entries={item.items ?? []}
      anchor={sub.el}
      placement="right-start"
      level={level + 1}
      {onclose}
      focusFirst={subFocus}
      onback={() => {
        sub = null;
        panel.focus();
      }}
    />
  {/key}
{/if}

<style>
  .menu {
    position: fixed;
    left: 0;
    top: 0;
    visibility: hidden;
    min-width: 212px;
    max-width: 340px;
    padding: 5px;
    border-radius: var(--r-3);
    overflow-y: auto;
    user-select: none;
  }
  .menu:global([data-shown]) {
    visibility: visible;
    animation: menu-in 150ms var(--ease-spring, var(--ease-out));
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      scale: 0.92;
    }
  }
  .item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 32px;
    padding: 0 9px 0 8px;
    border-radius: 7px;
    font-size: 13.25px;
    color: var(--ink);
    text-align: left;
  }
  .item.active,
  .item.open {
    background: var(--hover);
  }
  .item:disabled {
    color: var(--ink-4);
  }
  .item.danger {
    color: var(--danger);
  }
  .item.danger.active {
    background: var(--danger-soft);
  }
  .ic {
    width: 16px;
    display: grid;
    place-items: center;
    color: var(--ink-2);
    flex: none;
  }
  .danger .ic {
    color: inherit;
  }
  .label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .keys {
    font-size: 11.5px;
    color: var(--ink-3);
    letter-spacing: 0.02em;
    padding-left: 12px;
  }
  .glyph {
    display: grid;
    place-items: center;
    color: var(--ink-2);
    margin-left: 10px;
    flex: none;
  }
  .item.active .glyph {
    color: var(--ink);
  }
  .item :global(.chev) {
    color: var(--ink-3);
    margin-right: -3px;
  }
  .sep {
    height: 1px;
    background: var(--line);
    margin: 4px 6px;
  }
  .heading {
    padding: 7px 9px 3px;
    font-size: 11px;
    font-weight: 620;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .colors {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    padding: 5px 6px 6px;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    transition: transform var(--t-fast);
  }
  .dot::before {
    content: "";
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--dot);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
  }
  .dot:hover {
    transform: scale(1.12);
  }
  .dot.on {
    box-shadow: 0 0 0 2px var(--ink-2);
  }
  .dot.custom::before {
    background:
      radial-gradient(circle, var(--surface-2) 0 3.5px, transparent 4px),
      conic-gradient(#f87171, #fbbf24, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171);
  }
  .emojis {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    padding: 4px 4px 6px;
  }
  .emo {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    font-size: 20px;
    line-height: 1;
    font-family: "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", var(--font-ui);
    transition: transform 120ms var(--ease-spring, ease-out), background var(--t-fast);
  }
  .emo:hover {
    background: var(--hover);
    transform: scale(1.18);
  }
  .emo.on {
    background: var(--accent-soft);
  }
  /* пальцем — пункты крупнее */
  @media (pointer: coarse) {
    .item {
      height: 42px;
      font-size: 15px;
      gap: 11px;
    }
  }
</style>
