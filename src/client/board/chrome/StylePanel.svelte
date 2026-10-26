<script lang="ts">
  /* Оформление выделенного: готовые наборы, заливка и градиент, цвет текста,
     обводка, углы, тень, прозрачность, анимация, отражение, фильтр и метка.
     Всё применяется сразу и отменяется Ctrl+Z. На телефоне — листом снизу. */
  import { computePosition, flip, offset, shift, size } from "@floating-ui/dom";
  import ClipboardPaste from "@lucide/svelte/icons/clipboard-paste";
  import Copy from "@lucide/svelte/icons/copy";
  import Plus from "@lucide/svelte/icons/plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import X from "@lucide/svelte/icons/x";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { hexToRgb, hsvToHex, rgbToHsv } from "../../lib/color.ts";
  import { pickColor, picker } from "../../ui/colorpick.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { COLORS, COLOR_ITEMS, colorCss, isHex, type NodeData, type NodeProps, type NodeType } from "../model.ts";
  import type { NodeView } from "../store.svelte.ts";
  import { BORDERS, EFFECTS, FILTERS, PRESETS, SHADOWS, canBox, canFill, canFilter, canFlip, copiedStyle, copyStyle, pasteStyle, resetStyle, type BorderStyle, type Preset, type Shadow } from "../style.ts";

  const b = useBoard();
  const s = $derived(b.view);
  const sheet = new MediaQuery("(max-width: 640px)");

  const views = $derived(s.selected().filter((v) => v.type !== "comment"));
  const p = $derived<NodeProps>(views[0]?.props ?? {});
  const any = (f: (t: NodeType) => boolean) => views.some((v) => f(v.type));
  const fillOk = $derived(any(canFill));
  const boxOk = $derived(any(canBox));
  const radOk = $derived(views.some((v) => canBox(v.type) && v.type !== "shape" && v.type !== "sticker" && v.type !== "text"));
  const flipOk = $derived(any(canFlip));
  const filterOk = $derived(any(canFilter));
  const tagOk = $derived(views.some((v) => v.type !== "path" && v.type !== "ink"));
  const shadowOk = $derived(views.some((v) => v.type !== "path" && v.type !== "frame"));

  // пусто — закрыть
  $effect(() => {
    if (!views.length || b.readonly) untrack(() => (b.ui.style = null));
  });

  /* ------------------------------ запись ------------------------------ */

  type Pred = (v: NodeView) => boolean;
  function set(patch: Partial<NodeData>, only?: Pred) {
    const list = only ? views.filter(only) : views;
    if (list.length) s.updateMany(list.map((v) => [v.id, patch]));
  }

  /* ползунки: значение под пальцем своё, в документ — не чаще 15 раз в секунду */
  let dragK = $state<string | null>(null);
  let dragV = $state(0);
  let pend: Partial<NodeData> | null = null;
  let tmr: ReturnType<typeof setTimeout> | undefined;
  function flush() {
    clearTimeout(tmr);
    tmr = undefined;
    if (pend) set(pend);
    pend = null;
  }
  function slide(k: string, v: number, patch: Partial<NodeData>) {
    dragK = k;
    dragV = v;
    pend = { ...pend, ...patch };
    tmr ??= setTimeout(flush, 66);
  }
  function slideEnd() {
    flush();
    dragK = null;
  }
  const num = (k: keyof NodeProps, def: number): number => {
    if (dragK === k) return dragV;
    const x = p[k];
    return typeof x === "number" ? x : def;
  };

  /* ------------------------------ цвета ------------------------------ */

  const PALETTE = COLOR_ITEMS.filter((c) => c.value !== "default");
  const NEUTRAL = [
    { value: "#ffffff", css: "#ffffff", label: "Белый" },
    { value: "#111113", css: "#111113", label: "Чёрный" },
  ];
  const SW = [...PALETTE, ...NEUTRAL];
  const known = (c: string | undefined) => !!c && SW.some((x) => x.value === c);

  const under = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.bottom + 6 };
  };

  /** Второй цвет градиента по умолчанию — соседний оттенок. */
  function partner(c: string): string {
    if (isHex(c)) {
      const rgb = hexToRgb(c);
      if (rgb) {
        const h = rgbToHsv(rgb);
        return hsvToHex({ ...h, h: (h.h + 48) % 360, s: Math.min(1, h.s + 0.08) });
      }
    }
    const i = COLORS.indexOf(c as (typeof COLORS)[number]);
    const list = COLORS.filter((x) => x !== "default" && x !== "gray");
    return i < 0 ? "violet" : list[(list.indexOf(c as (typeof list)[number]) + 2 + list.length) % list.length]!;
  }

  function setFill(c: string | undefined) {
    if (!c) return set({ fc: undefined, fc2: undefined, ga: undefined }, (v) => canFill(v.type));
    set({ fc: c, ...(c === "transparent" ? { fc2: undefined } : {}) }, (v) => canFill(v.type));
  }
  function toggleGradient() {
    if (p.fc2) return set({ fc2: undefined, ga: undefined }, (v) => canFill(v.type));
    const base = p.fc && p.fc !== "transparent" ? p.fc : "blue";
    set({ fc: base, fc2: partner(base), ga: p.ga ?? 135 }, (v) => canFill(v.type));
  }
  function setBorder(c: string | undefined) {
    if (!c) return set({ bc: undefined, bw: undefined, bs: undefined }, (v) => canBox(v.type));
    set({ bc: c, bw: typeof p.bw === "number" && p.bw > 0 ? p.bw : 2 }, (v) => canBox(v.type));
  }

  /* ------------------------------ наборы ------------------------------ */

  const LOOK_KEYS = ["fc", "fc2", "ga", "tc", "bc", "bw", "bs", "rad", "shd"] as const;
  function applyPreset(pr: Preset) {
    const patch: Record<string, unknown> = {};
    for (const k of LOOK_KEYS) patch[k] = (pr.style as Record<string, unknown>)[k] ?? undefined;
    const font = (pr.style as { font?: string }).font;
    if (font) patch.font = font;
    set(patch as Partial<NodeData>);
  }
  const previewBg = (pr: Preset) => {
    const st = pr.style;
    if (!st.fc || st.fc === "transparent") return "none";
    const a = colorCss(st.fc);
    return `linear-gradient(${st.ga ?? 135}deg, ${a}, ${st.fc2 ? colorCss(st.fc2) : a})`;
  };

  /* ------------------------------ прочее ------------------------------ */

  const flipH = $derived(p.flip === "h" || p.flip === "hv");
  const flipV = $derived(p.flip === "v" || p.flip === "hv");
  function setFlip(h: boolean, v: boolean) {
    set({ flip: h && v ? "hv" : h ? "h" : v ? "v" : undefined }, (x) => canFlip(x.type));
  }
  const TAGS = ["⭐", "🔥", "✅", "❗", "💡", "🚧", "🎯", "❤️", "NEW", "TODO"];
  let tagText = $state("");
  $effect(() => {
    tagText = p.tag ?? "";
  });
  function commitTag(t: string) {
    const v = t.trim().slice(0, 24);
    set({ tag: v || undefined, ...(v ? {} : { tagc: undefined }) }, (x) => x.type !== "path" && x.type !== "ink");
  }

  let clipSeq = $state(0);
  const hasClip = $derived(clipSeq >= 0 && b.ui.style ? !!copiedStyle() : false);

  /* ------------------------------ место ------------------------------ */

  const PAD = { top: 64, bottom: 76, left: 8, right: 8 };
  let panel = $state<HTMLDivElement>();
  $effect(() => {
    const at = b.ui.style;
    const el = panel;
    if (!at || !el) return;
    if (sheet.current) {
      el.style.left = "";
      el.style.top = "";
      el.style.maxHeight = "";
      el.dataset.shown = "";
      return;
    }
    const anchor = { getBoundingClientRect: () => ({ x: at.x, y: at.y, left: at.x, top: at.y, right: at.x, bottom: at.y, width: 0, height: 0 }) };
    void computePosition(anchor, el, { placement: "bottom-start", strategy: "fixed", middleware: [
        offset(8),
        flip({ padding: PAD }),
        // Не выше свободного места: длинная панель прокручивается и не заезжает под нижнюю панель инструментов.
        size({ padding: PAD, apply: ({ availableHeight, elements }) => void (elements.floating.style.maxHeight = `${Math.round(Math.max(260, Math.min(640, availableHeight)))}px`) }),
        shift({ padding: PAD, crossAxis: true }),
      ] }).then(({ x, y }) => {
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.dataset.shown = "";
    });
  });

  function key(e: KeyboardEvent) {
    if (e.key !== "Escape" || picker.open) return;
    e.preventDefault();
    e.stopPropagation();
    b.ui.style = null;
  }
</script>

<svelte:window onkeydowncapture={key} />

{#snippet colors(cur: string | undefined, apply: (c: string | undefined) => void, title: string, none: string, extra?: { value: string; css: string; label: string })}
  <div class="sp-colors" role="radiogroup" aria-label={title}>
    <button type="button" class="sp-dot none" class:on={!cur} role="radio" aria-checked={!cur} aria-label={none} title={none} onclick={() => apply(undefined)}></button>
    {#if extra}
      <button type="button" class="sp-dot clear" class:on={cur === extra.value} role="radio" aria-checked={cur === extra.value} aria-label={extra.label} title={extra.label} onclick={() => apply(extra.value)}></button>
    {/if}
    {#each SW as c (c.value)}
      <button type="button" class="sp-dot" class:on={cur === c.value} style:--sw={c.css} role="radio" aria-checked={cur === c.value} aria-label={c.label} title={c.label} onclick={() => apply(c.value)}></button>
    {/each}
    <button
      type="button"
      class="sp-dot custom"
      class:on={!!cur && isHex(cur) && !known(cur)}
      style:--sw={cur && isHex(cur) && !known(cur) ? cur : null}
      aria-label="Свой цвет"
      title="Свой цвет"
      onclick={(e) => pickColor(cur, under(e), (hex) => apply(hex), { title })}
    >
      {#if !(cur && isHex(cur) && !known(cur))}<Plus size={13} />{/if}
    </button>
  </div>
{/snippet}

{#snippet chips(list: [string, string][], cur: string | undefined, apply: (v: string) => void, label: string)}
  <div class="sp-chips" role="radiogroup" aria-label={label}>
    {#each list as [val, text] (val)}
      <button type="button" class="sp-chip" class:on={(cur ?? "none") === val} role="radio" aria-checked={(cur ?? "none") === val} onclick={() => apply(val)}>{text}</button>
    {/each}
  </div>
{/snippet}

{#if b.ui.style && views.length}
  <div
    class="sp panel"
    class:sheet={sheet.current}
    bind:this={panel}
    role="dialog"
    aria-label="Оформление"
    tabindex="-1"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
  >
    <header class="sp-head">
      <span class="sp-title">Оформление{views.length > 1 ? ` · ${views.length}` : ""}</span>
      <button type="button" class="chip" aria-label="Закрыть" onclick={() => (b.ui.style = null)}><X size={15} /></button>
    </header>

    <div class="sp-body">
      {#if fillOk || boxOk}
        <section>
          <h4>Готовые наборы</h4>
          <div class="sp-presets">
            {#each PRESETS as pr (pr.id)}
              <button
                type="button"
                class="sp-preset"
                onclick={() => applyPreset(pr)}
                title={pr.label}
                style:--pv-bg={previewBg(pr)}
                style:--pv-tc={pr.style.tc ? colorCss(pr.style.tc) : null}
                style:--pv-bc={pr.style.bc ? colorCss(pr.style.bc) : "transparent"}
                style:--pv-bs={pr.style.bs ?? "solid"}
                style:--pv-r="{Math.min(12, pr.style.rad ?? 8)}px"
              >
                <span class="pv">Aa</span>
                <span class="pl">{pr.label}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if fillOk}
        <section>
          <h4>Заливка</h4>
          {@render colors(p.fc, setFill, "Заливка", "Как обычно", { value: "transparent", css: "transparent", label: "Прозрачная" })}
          {#if p.fc && p.fc !== "transparent"}
            <label class="sp-row">
              <span>Градиент</span>
              <button type="button" class="switch" class:on={!!p.fc2} role="switch" aria-checked={!!p.fc2} aria-label="Градиент" onclick={toggleGradient}></button>
            </label>
            {#if p.fc2}
              <div class="sp-row">
                <span>Второй цвет</span>
                <button
                  type="button"
                  class="sp-dot big"
                  style:--sw={colorCss(p.fc2)}
                  aria-label="Второй цвет"
                  onclick={(e) => pickColor(p.fc2, under(e), (hex) => set({ fc2: hex }, (v) => canFill(v.type)), { title: "Второй цвет" })}
                ></button>
                <button type="button" class="sp-chip" onclick={() => set({ fc: p.fc2, fc2: p.fc }, (v) => canFill(v.type))}>⇄ Поменять</button>
              </div>
              <div class="sp-slider">
                <span>Угол</span>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={num("ga", 135)}
                  oninput={(e) => slide("ga", +e.currentTarget.value, { ga: +e.currentTarget.value })}
                  onchange={slideEnd}
                  aria-label="Угол градиента"
                />
                <output>{num("ga", 135)}°</output>
              </div>
            {/if}
          {/if}
        </section>
      {/if}

      {#if fillOk || views.some((v) => v.type === "text" || v.type === "shape")}
        <section>
          <h4>Цвет текста</h4>
          {@render colors(p.tc, (c) => set({ tc: c }), "Цвет текста", "Авто")}
        </section>
      {/if}

      {#if boxOk}
        <section>
          <h4>Обводка</h4>
          {@render colors(p.bc, setBorder, "Обводка", "Как обычно")}
          {#if p.bc || typeof p.bw === "number"}
            <div class="sp-slider">
              <span>Толщина</span>
              <input
                type="range"
                min="0"
                max="12"
                step="1"
                value={num("bw", 2)}
                oninput={(e) => slide("bw", +e.currentTarget.value, { bw: +e.currentTarget.value })}
                onchange={slideEnd}
                aria-label="Толщина обводки"
              />
              <output>{num("bw", 2)} px</output>
            </div>
            {@render chips(BORDERS, p.bs ?? "solid", (bs) => set({ bs: bs === "solid" ? undefined : (bs as BorderStyle), bw: typeof p.bw === "number" ? p.bw : 2 }, (v) => canBox(v.type)), "Вид обводки")}
          {/if}
        </section>
      {/if}

      {#if radOk}
        <section>
          <div class="sp-slider">
            <span>Скругление</span>
            <input
              type="range"
              min="0"
              max="60"
              step="1"
              value={num("rad", 10)}
              oninput={(e) => slide("rad", +e.currentTarget.value, { rad: +e.currentTarget.value })}
              onchange={slideEnd}
              aria-label="Скругление углов"
            />
            <output>{typeof p.rad === "number" || dragK === "rad" ? `${num("rad", 10)} px` : "авто"}</output>
            {#if typeof p.rad === "number"}
              <button type="button" class="chip sm" aria-label="Как обычно" title="Как обычно" onclick={() => set({ rad: undefined })}><RotateCcw size={13} /></button>
            {/if}
          </div>
        </section>
      {/if}

      {#if shadowOk}
        <section>
          <h4>Тень</h4>
          {@render chips([["auto", "Обычная"], ...SHADOWS], p.shd ?? "auto", (shd) => set({ shd: shd === "auto" ? undefined : (shd as Shadow) }), "Тень")}
        </section>
      {/if}

      <section>
        <div class="sp-slider">
          <span>Прозрачность</span>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={Math.round(num("opacity", 1) * 100)}
            oninput={(e) => {
              const v = +e.currentTarget.value / 100;
              slide("opacity", v, { opacity: v >= 1 ? undefined : v });
            }}
            onchange={slideEnd}
            aria-label="Непрозрачность"
          />
          <output>{Math.round(num("opacity", 1) * 100)} %</output>
        </div>
      </section>

      <section>
        <h4>Анимация</h4>
        {@render chips(EFFECTS, p.fx ?? "none", (fx) => set({ fx: fx === "none" ? undefined : fx }), "Анимация")}
      </section>

      {#if flipOk}
        <section>
          <h4>Отражение</h4>
          <div class="sp-chips">
            <button type="button" class="sp-chip" class:on={flipH} aria-pressed={flipH} onclick={() => setFlip(!flipH, flipV)}>↔ По горизонтали</button>
            <button type="button" class="sp-chip" class:on={flipV} aria-pressed={flipV} onclick={() => setFlip(flipH, !flipV)}>↕ По вертикали</button>
          </div>
        </section>
      {/if}

      {#if filterOk}
        <section>
          <h4>Фильтр</h4>
          {@render chips(FILTERS, p.flt ?? "none", (flt) => set({ flt: flt === "none" ? undefined : flt }, (v) => canFilter(v.type)), "Фильтр")}
        </section>
      {/if}

      {#if tagOk}
        <section>
          <h4>Метка</h4>
          <div class="sp-row">
            <input
              class="input sm"
              maxlength="24"
              placeholder="Эмодзи или пара слов"
              bind:value={tagText}
              onchange={() => commitTag(tagText)}
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTag(tagText);
                }
                e.stopPropagation();
              }}
            />
            {#if p.tag}
              <button type="button" class="chip sm" aria-label="Убрать метку" title="Убрать метку" onclick={() => commitTag("")}><X size={13} /></button>
            {/if}
          </div>
          <div class="sp-chips">
            {#each TAGS as t (t)}
              <button type="button" class="sp-chip" class:on={p.tag === t} onclick={() => commitTag(p.tag === t ? "" : t)}>{t}</button>
            {/each}
          </div>
          {#if p.tag}
            {@render colors(p.tagc, (c) => set({ tagc: c }), "Цвет метки", "Как обычно")}
          {/if}
        </section>
      {/if}

      <section>
        <label class="sp-row">
          <span>Спрятать от зрителей <small>редакторы видят призраком</small></span>
          <button type="button" class="switch" class:on={!!p.hid} role="switch" aria-checked={!!p.hid} aria-label="Спрятать от зрителей" onclick={() => set({ hid: p.hid ? undefined : true })}></button>
        </label>
      </section>
    </div>

    <footer class="sp-foot">
      <button type="button" class="btn ghost sm" disabled={views.length !== 1} onclick={() => {
          if (views[0]) copyStyle(views[0]);
          clipSeq++;
        }} title="Копировать оформление"><Copy size={14} /> Копировать</button>
      <button type="button" class="btn ghost sm" disabled={!hasClip} onclick={() => pasteStyle(b, views.map((v) => v.id))} title="Вставить оформление"><ClipboardPaste size={14} /> Вставить</button>
      <span class="sp-sp"></span>
      <button type="button" class="btn ghost sm" onclick={() => resetStyle(b, views.map((v) => v.id))} title="Сбросить оформление"><RotateCcw size={14} /> Сбросить</button>
    </footer>
  </div>
{/if}

<style>
  .sp {
    position: fixed;
    left: 0;
    top: 0;
    width: 300px;
    max-height: min(calc(100dvh - 150px), 640px);
    display: flex;
    flex-direction: column;
    visibility: hidden;
    z-index: 2;
  }
  .sp:global([data-shown]) {
    visibility: visible;
    animation: sp-in 150ms var(--ease-out);
  }
  @keyframes sp-in {
    from {
      opacity: 0;
      translate: 0 4px;
    }
  }
  .sp.sheet {
    left: 8px !important;
    right: 8px;
    top: auto !important;
    bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-height: 62dvh;
  }
  .sp-head {
    display: flex;
    align-items: center;
    padding: 8px 8px 4px 14px;
  }
  .sp-title {
    flex: 1;
    font-size: 12px;
    font-weight: 640;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .sp-body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 14px 6px;
    scrollbar-width: thin;
  }
  section {
    padding: 8px 0;
    border-top: 1px solid var(--line);
    display: grid;
    gap: 8px;
  }
  section:first-child {
    border-top: 0;
  }
  h4 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-2);
  }
  .sp-colors {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sp-dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--sw, var(--surface-3));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.2);
    display: grid;
    place-items: center;
    color: var(--ink-2);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .sp-dot:hover {
    transform: scale(1.12);
  }
  .sp-dot.on {
    box-shadow:
      0 0 0 2px var(--panel),
      0 0 0 4px var(--accent);
  }
  .sp-dot.none {
    background: linear-gradient(135deg, transparent 46%, var(--danger) 46% 54%, transparent 54%), var(--surface-2);
    box-shadow: inset 0 0 0 1.5px var(--line-3);
  }
  .sp-dot.none.on,
  .sp-dot.clear.on {
    box-shadow:
      inset 0 0 0 1.5px var(--line-3),
      0 0 0 2px var(--panel),
      0 0 0 4px var(--accent);
  }
  .sp-dot.clear {
    background: repeating-conic-gradient(var(--surface-3) 0 25%, var(--surface-1) 0 50%) 0 0 / 8px 8px;
    box-shadow: inset 0 0 0 1.5px var(--line-3);
  }
  .sp-dot.custom:not([style]) {
    background: conic-gradient(var(--c-red), var(--c-yellow), var(--c-green), var(--c-blue), var(--c-violet), var(--c-red));
    color: #fff;
  }
  .sp-dot.big {
    width: 26px;
    height: 26px;
  }
  .sp-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .sp-chip {
    height: 28px;
    padding: 0 10px;
    border-radius: 99px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 520;
    white-space: nowrap;
    transition:
      background var(--t-fast),
      color var(--t-fast),
      border-color var(--t-fast);
  }
  .sp-chip:hover {
    color: var(--ink);
    border-color: var(--line-3);
  }
  .sp-chip.on {
    background: var(--accent-soft);
    border-color: var(--accent-line);
    color: var(--accent);
  }
  .sp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .sp-row > span {
    flex: 1;
  }
  .sp-row small {
    display: block;
    font-size: 11.5px;
    color: var(--ink-3);
  }
  .sp-slider {
    display: grid;
    grid-template-columns: 92px 1fr 48px auto;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .sp-slider input {
    width: 100%;
    accent-color: var(--accent);
  }
  .sp-slider output {
    font-size: 12px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .chip.sm {
    min-width: 26px;
    height: 26px;
    padding: 0;
  }
  .sp-presets {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .sp-preset {
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: 2px 0;
    border-radius: var(--r-1);
  }
  .sp-preset:hover {
    background: var(--hover);
  }
  .pv {
    width: 40px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--pv-r);
    background-color: var(--surface-2);
    background-image: var(--pv-bg);
    color: var(--pv-tc, var(--ink));
    border: 1.5px var(--pv-bs) var(--pv-bc);
    font-size: 12px;
    font-weight: 650;
    box-shadow: var(--shadow-1);
  }
  .pl {
    font-size: 10.5px;
    color: var(--ink-3);
    max-width: 52px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sp-foot {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px 8px;
    border-top: 1px solid var(--line);
  }
  .sp-foot .btn {
    gap: 5px;
  }
  .sp-sp {
    flex: 1;
  }
  @media (pointer: coarse) {
    .sp-dot {
      width: 30px;
      height: 30px;
    }
    .sp-chip {
      height: 34px;
      padding: 0 12px;
    }
  }
</style>
