<script lang="ts">
  /* Библиотека — левая выдвижная панель: объекты, фигуры, стикеры,
     шаблоны и сервисы. Щелчок ставит элемент в центр экрана,
     перетаскивание — туда, где его отпустили. Клавиша B — открыть/скрыть. */
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Boxes from "@lucide/svelte/icons/boxes";
  import LayoutTemplate from "@lucide/svelte/icons/layout-template";
  import PanelLeftClose from "@lucide/svelte/icons/panel-left-close";
  import Plug from "@lucide/svelte/icons/plug";
  import Search from "@lucide/svelte/icons/search";
  import Shapes from "@lucide/svelte/icons/shapes";
  import SmilePlus from "@lucide/svelte/icons/smile-plus";
  import Zap from "@lucide/svelte/icons/zap";
  import X from "@lucide/svelte/icons/x";
  import type { Component } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { MediaQuery } from "svelte/reactivity";
  import { fly } from "svelte/transition";
  import { session } from "../../lib/session.svelte.ts";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { addFiles, addUrl, looksLikeUrl } from "../files.ts";
  import { EMOJI_GROUPS, LIB_CATS, LIB_ITEMS, LIB_MIME, searchLib, useLibItem, type LibCat, type LibItem } from "../library.ts";
  import { TEMPLATE_GROUPS } from "../templates.ts";
  import { pickFiles } from "../menus.ts";

  type Icon = Component<Record<string, unknown>>;
  const ICONS: Record<LibCat, Icon> = { basic: Boxes, widgets: Zap, shapes: Shapes, stickers: SmilePlus, templates: LayoutTemplate, services: Plug };

  const b = useBoard();
  const st = session.settings;
  const compact = new MediaQuery("max-width: 640px");
  let q = $state("");
  let asking = $state<LibItem | null>(null);
  let url = $state("");
  let urlInput = $state<HTMLInputElement>();
  let searchInput = $state<HTMLInputElement>();

  const open = $derived(st.library && !b.readonly);
  const cat = $derived<LibCat>(LIB_CATS.some((c) => c.id === st.libCat) ? st.libCat : "basic");
  const found = $derived(q.trim() ? searchLib(q) : []);
  const list = $derived(LIB_ITEMS.filter((i) => i.cat === cat));
  const dur = $derived(st.reduceMotion ? 0 : 200);

  /** Середина видимой части доски — справа от панели. */
  const spot = () => (compact.current ? b.camera.center : b.camera.toWorld((372 + b.camera.vw) / 2, b.camera.vh / 2));

  function toggle(c: LibCat) {
    if (st.library && st.libCat === c) st.library = false;
    else {
      st.libCat = c;
      st.library = true;
    }
    asking = null;
  }

  function close() {
    st.library = false;
    asking = null;
  }

  async function use(it: LibItem) {
    if (it.ask === "url") {
      asking = it;
      url = "";
      requestAnimationFrame(() => urlInput?.focus());
      return;
    }
    if (it.ask === "file") {
      const files = await pickFiles(it.id === "audio" ? "audio/*" : "");
      if (files.length) await addFiles(b, files, spot());
      return;
    }
    // фокус — обратно доске: Enter, Delete и стрелки сразу работают с новым объектом
    (document.activeElement as HTMLElement | null)?.blur();
    if (!useLibItem(b, it.id, { animate: !st.reduceMotion, left: compact.current ? 0 : 372 })) return;
    if (compact.current) close();
  }

  function submitUrl(e: SubmitEvent) {
    e.preventDefault();
    const t = url.trim();
    if (!looksLikeUrl(t) && !looksLikeUrl("https://" + t)) {
      toasts.show("Это не похоже на ссылку", { kind: "error", ms: 1800 });
      return;
    }
    const id = addUrl(b, t, spot());
    if (id) b.store.selection.set([id]);
    asking = null;
    url = "";
  }

  function dragStart(e: DragEvent, it: LibItem) {
    if (!e.dataTransfer || it.ask) return;
    e.dataTransfer.setData(LIB_MIME, it.id);
    e.dataTransfer.effectAllowed = "copy";
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (asking) asking = null;
    else if (q) q = "";
    else close();
  }

  const groups = $derived.by(() => {
    if (!found.length) return [];
    return LIB_CATS.map((c) => ({ c, items: found.filter((i) => i.cat === c.id) })).filter((g) => g.items.length);
  });
</script>

{#if !b.readonly}
  <nav class="lib-rail panel" class:compact={compact.current} aria-label="Библиотека">
    {#each LIB_CATS as c, i (c.id)}
      {@const I = ICONS[c.id]}
      <button class="tool" class:on={open && cat === c.id} onclick={() => toggle(c.id)} aria-label={c.label} aria-pressed={open && cat === c.id} {@attach tip(c.label, i === 0 ? "B" : undefined, "right")}>
        <I size={19} strokeWidth={1.8} />
      </button>
    {/each}
  </nav>
{/if}

{#snippet tile(it: LibItem)}
  {#if it.cat === "shapes"}
    <button class="lib-shape" draggable="true" ondragstart={(e) => dragStart(e, it)} onclick={() => use(it)} aria-label={it.label} {@attach tip(it.label, undefined, "top")}>
      {@html it.svg}
    </button>
  {:else if it.cat === "stickers"}
    <button class="lib-emoji" draggable="true" ondragstart={(e) => dragStart(e, it)} onclick={() => use(it)} aria-label={it.label}>{it.emoji}</button>
  {:else if it.cat === "templates"}
    <button class="lib-tpl" draggable="true" ondragstart={(e) => dragStart(e, it)} onclick={() => use(it)}>
      <span class="lib-thumb">{@html it.svg}</span>
      <span class="lib-tpl-label">{it.label}</span>
      <span class="lib-tpl-desc">{it.desc}</span>
    </button>
  {:else if it.cat === "services"}
    <button class="lib-svc" class:on={asking?.id === it.id} onclick={() => use(it)}>
      <span class="lib-svc-ic">{@html it.svg}</span>
      <span class="lib-svc-text"><span class="lib-svc-label">{it.label}</span><span class="lib-svc-desc">{it.desc}</span></span>
    </button>
  {:else}
    {@const I = it.icon}
    <button class="lib-tile" draggable={!it.ask} ondragstart={(e) => dragStart(e, it)} onclick={() => use(it)}>
      {#if I}<I size={22} strokeWidth={1.7} />{/if}
      <span>{it.label}</span>
    </button>
  {/if}
{/snippet}

{#snippet grid(items: LibItem[], c: LibCat)}
  {#if c === "stickers" && !q.trim()}
    {#each EMOJI_GROUPS as g (g.name)}
      <div class="lib-head">{g.name}</div>
      <div class="lib-grid stickers">
        {#each items.filter((i) => g.list.includes(i.emoji ?? "")) as it (it.id)}{@render tile(it)}{/each}
      </div>
    {/each}
  {:else if c === "templates" && !q.trim()}
    {#each TEMPLATE_GROUPS as g (g)}
      <div class="lib-head">{g}</div>
      <div class="lib-grid templates">
        {#each items.filter((i) => i.group === g) as it (it.id)}{@render tile(it)}{/each}
      </div>
    {/each}
  {:else}
    <div class="lib-grid {c}">
      {#each items as it (it.id)}{@render tile(it)}{/each}
    </div>
  {/if}
{/snippet}

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside class="lib panel" class:compact={compact.current} aria-label="Библиотека" transition:fly={{ x: -14, duration: dur, easing: cubicOut }} onkeydown={onKey}>
    <header class="lib-top">
      <div class="lib-title">{LIB_CATS.find((c) => c.id === cat)?.label}</div>
      <button class="icon-btn sm" onclick={close} aria-label="Скрыть библиотеку" {@attach tip("Скрыть", "B", "bottom")}>
        {#if compact.current}<X size={16} />{:else}<PanelLeftClose size={16} />{/if}
      </button>
    </header>
    <label class="lib-search">
      <Search size={15} />
      <input bind:this={searchInput} bind:value={q} placeholder="Искать…" aria-label="Поиск в библиотеке" />
      {#if q}<button class="icon-btn sm" onclick={() => (q = "")} aria-label="Очистить"><X size={14} /></button>{/if}
    </label>

    {#if asking}
      <form class="lib-ask" onsubmit={submitUrl} transition:fly={{ y: -6, duration: dur }}>
        <div class="lib-ask-title">{@html asking.svg}<span>{asking.label}</span></div>
        <div class="lib-ask-row">
          <input class="input sm" bind:this={urlInput} bind:value={url} placeholder="Вставьте ссылку…" inputmode="url" autocomplete="off" spellcheck="false" />
          <button class="btn primary sm" type="submit" aria-label="Добавить"><ArrowRight size={15} /></button>
        </div>
        <div class="lib-ask-hint">{asking.desc}. Ссылку можно и просто вставить на доску — Ctrl+V.</div>
      </form>
    {/if}

    <div class="lib-body scroll">
      {#if q.trim()}
        {#each groups as g (g.c.id)}
          <div class="lib-head">{g.c.label}</div>
          {@render grid(g.items, g.c.id)}
        {:else}
          <div class="lib-empty">Ничего не нашлось</div>
        {/each}
      {:else}
        {@render grid(list, cat)}
      {/if}
    </div>
    {#if !compact.current}
      <div class="lib-foot">Щёлкните, чтобы добавить, или перетащите на доску</div>
    {/if}
  </aside>
{/if}

<style>
  .lib-rail {
    position: fixed;
    left: 10px;
    top: 50%;
    translate: 0 -50%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
  }
  .lib-rail.compact {
    display: none;
  }
  .lib {
    position: fixed;
    left: 66px;
    top: 66px;
    bottom: 72px;
    width: 300px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-height: 720px;
  }
  .lib.compact {
    left: 8px;
    right: 8px;
    width: auto;
    top: 58px;
    bottom: 76px;
    max-height: none;
  }
  .lib-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 8px 4px 14px;
  }
  .lib-title {
    font-size: 13.5px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .lib-search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 10px 6px;
    height: 34px;
    padding: 0 4px 0 10px;
    border-radius: var(--r-2);
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-3);
    transition: border-color var(--t-fast);
  }
  .lib-search:focus-within {
    border-color: var(--accent-line);
  }
  .lib-search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  .lib-body {
    flex: 1;
    min-height: 0;
    padding: 2px 10px 12px;
  }
  .lib-head {
    padding: 10px 4px 6px;
    font-size: 11px;
    font-weight: 620;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .lib-grid {
    display: grid;
    gap: 6px;
  }
  .lib-grid.basic,
  .lib-grid.widgets {
    grid-template-columns: repeat(3, 1fr);
  }
  .lib-grid.shapes {
    grid-template-columns: repeat(5, 1fr);
  }
  .lib-grid.stickers {
    grid-template-columns: repeat(6, 1fr);
    gap: 2px;
  }
  .lib-grid.templates {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .lib-grid.services {
    grid-template-columns: 1fr;
    gap: 2px;
  }
  .lib-tile,
  .lib-shape,
  .lib-tpl {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: var(--r-2);
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-2);
    cursor: grab;
    transition:
      background var(--t-fast),
      border-color var(--t-fast),
      color var(--t-fast),
      transform 160ms var(--ease-spring);
    animation: lib-in 220ms var(--ease-out) backwards;
  }
  .lib-tile {
    height: 74px;
    font-size: 12px;
    font-weight: 540;
    text-align: center;
    line-height: 1.2;
    padding: 4px;
  }
  .lib-shape {
    aspect-ratio: 1;
    color: var(--ink-2);
  }
  .lib-tile:hover,
  .lib-shape:hover,
  .lib-tpl:hover {
    background: var(--surface-3);
    border-color: var(--line-3);
    color: var(--ink);
    transform: translateY(-1px);
  }
  .lib-tile:active,
  .lib-shape:active,
  .lib-tpl:active,
  .lib-emoji:active {
    transform: scale(0.96);
    cursor: grabbing;
  }
  .lib-emoji {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: var(--r-2);
    font-size: 26px;
    line-height: 1;
    font-family: "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", var(--font-ui);
    cursor: grab;
    transition:
      background var(--t-fast),
      transform 160ms var(--ease-spring);
  }
  .lib-emoji:hover {
    background: var(--hover);
    transform: scale(1.15) rotate(-4deg);
  }
  .lib-tpl {
    align-items: stretch;
    justify-content: flex-start;
    gap: 3px;
    padding: 6px 6px 8px;
    text-align: left;
  }
  .lib-thumb {
    display: grid;
    place-items: center;
    height: 78px;
    border-radius: 6px;
    background: var(--bg);
    overflow: hidden;
    margin-bottom: 4px;
  }
  .lib-thumb :global(svg) {
    width: 100%;
    height: 100%;
  }
  .lib-tpl-label {
    font-size: 12.5px;
    font-weight: 620;
    color: var(--ink);
    padding: 0 2px;
  }
  .lib-tpl-desc {
    font-size: 11px;
    line-height: 1.3;
    color: var(--ink-3);
    padding: 0 2px;
  }
  .lib-svc {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: var(--r-2);
    text-align: left;
    color: var(--ink);
    transition: background var(--t-fast);
  }
  .lib-svc:hover,
  .lib-svc.on {
    background: var(--hover);
  }
  .lib-svc-ic {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--r-2);
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .lib-svc-text {
    display: grid;
    min-width: 0;
  }
  .lib-svc-label {
    font-size: 13px;
    font-weight: 600;
  }
  .lib-svc-desc {
    font-size: 11.5px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lib-ask {
    margin: 0 10px 6px;
    padding: 10px;
    border-radius: var(--r-2);
    background: var(--accent-soft);
    border: 1px solid var(--accent-line);
    display: grid;
    gap: 8px;
  }
  .lib-ask-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 620;
  }
  .lib-ask-row {
    display: flex;
    gap: 6px;
  }
  .lib-ask-row .input {
    flex: 1;
    min-width: 0;
  }
  .lib-ask-hint {
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--ink-2);
  }
  .lib-empty {
    padding: 24px 8px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
  }
  .lib-foot {
    padding: 8px 14px 10px;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--ink-3);
  }
  @keyframes lib-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  :global([data-reduce-motion]) .lib-tile,
  :global([data-reduce-motion]) .lib-shape,
  :global([data-reduce-motion]) .lib-tpl {
    animation: none;
  }
</style>
