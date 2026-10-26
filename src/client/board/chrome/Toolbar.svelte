<script lang="ts">
  /* Нижняя панель инструментов и полоса стиля для создаваемых объектов.
     Щелчок — выбрать инструмент, двойной щелчок — закрепить (не сбрасывать
     после создания объекта). */
  import Boxes from "@lucide/svelte/icons/boxes";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Eraser from "@lucide/svelte/icons/eraser";
  import Flashlight from "@lucide/svelte/icons/flashlight";
  import Frame from "@lucide/svelte/icons/frame";
  import Hand from "@lucide/svelte/icons/hand";
  import ImagePlus from "@lucide/svelte/icons/image-plus";
  import Minus from "@lucide/svelte/icons/minus";
  import MousePointer2 from "@lucide/svelte/icons/mouse-pointer-2";
  import MoveUpRight from "@lucide/svelte/icons/move-up-right";
  import Pencil from "@lucide/svelte/icons/pencil";
  import SquareCode from "@lucide/svelte/icons/square-code";
  import Square from "@lucide/svelte/icons/square";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import Type from "@lucide/svelte/icons/type";
  import WandSparkles from "@lucide/svelte/icons/wand-sparkles";
  import type { Component } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { session } from "../../lib/session.svelte.ts";
  import { menu, type MenuEntry } from "../../ui/menu.svelte.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { pickColor } from "../../ui/colorpick.svelte.ts";
  import { useBoard, type Tool } from "../board.svelte.ts";
  import { addFiles } from "../files.ts";
  import { headGlyph } from "../connector.ts";
  import { HEAD_SIZES, ROUTES, choice, headChoice, pickFiles } from "../menus.ts";
  import {
    COLORS,
    COLOR_LABELS,
    ROUTE_LABELS,
    SHAPE_KINDS,
    SHAPE_LABELS,
    STROKE_PX,
    colorCss,
    colorKey,
    isHex,
    type ColorName,
    type Dash,
    type Fill,
    type Route,
    type StrokeSize,
    type TextSize,
  } from "../model.ts";
  import { shapeGlyph } from "../shapes.ts";

  type Icon = Component<Record<string, unknown>>;
  interface ToolDef {
    id: Tool;
    label: string;
    key: string;
    icon: Icon;
    hint?: string;
  }

  const b = useBoard();
  const compact = new MediaQuery("max-width: 640px");


  const T: Record<string, ToolDef> = {
    select: { id: "select", label: "Выделение", key: "V", icon: MousePointer2 },
    hand: { id: "hand", label: "Рука", key: "H", icon: Hand, hint: "или зажмите пробел" },
    note: { id: "note", label: "Заметка", key: "N", icon: StickyNote },
    text: { id: "text", label: "Текст", key: "T", icon: Type },
    code: { id: "code", label: "Код", key: "C", icon: SquareCode },
    shape: { id: "shape", label: "Фигура", key: "R", icon: Square },
    draw: { id: "draw", label: "Рисование", key: "D", icon: Pencil, hint: "круг, стрелка и рамка распознаются" },
    arrow: { id: "arrow", label: "Стрелка", key: "A", icon: MoveUpRight, hint: "тяните от объекта к объекту" },
    line: { id: "line", label: "Линия", key: "L", icon: Minus },
    frame: { id: "frame", label: "Рамка", key: "F", icon: Frame },
    eraser: { id: "eraser", label: "Ластик", key: "E", icon: Eraser },
    laser: { id: "laser", label: "Указка", key: "K", icon: Flashlight, hint: "след исчезает сам" },
  };

  const full: ToolDef[][] = [
    [T.select!, T.hand!],
    [T.note!, T.text!, T.code!, T.shape!, T.draw!, T.arrow!, T.line!, T.frame!],
    [T.eraser!, T.laser!],
  ];
  const short: ToolDef[] = [T.select!, T.hand!, T.note!, T.draw!, T.shape!, T.arrow!];
  const extra: ToolDef[] = [T.text!, T.code!, T.line!, T.frame!, T.eraser!, T.laser!];
  const readonlyTools: ToolDef[] = [T.select!, T.hand!, T.laser!];

  const current = $derived<Tool>(b.tool === "pen" ? "draw" : b.tool);
  const extraActive = $derived(extra.find((t) => t.id === current));

  function pick(t: Tool) {
    if (current === t && t !== "select" && t !== "hand") b.toolLock = !b.toolLock;
    else b.setTool(t);
  }

  function shapeMenu(e: MouseEvent) {
    e.stopPropagation();
    const anchor = (e.currentTarget as HTMLElement).closest("button") as HTMLElement;
    menu.dropdown(
      anchor,
      SHAPE_KINDS.map((k) => ({
        label: SHAPE_LABELS[k],
        iconSvg: shapeGlyph(k, 16),
        keys: k === "rect" ? "R" : k === "ellipse" ? "O" : undefined,
        checked: b.shapeKind === k,
        run: () => {
          b.shapeKind = k;
          b.setTool("shape");
        },
      })),
      "top-start",
    );
  }

  function moreMenu(e: MouseEvent) {
    const items: MenuEntry[] = extra.map((t) => ({ label: t.label, icon: t.icon, keys: t.key, checked: current === t.id, run: () => b.setTool(t.id) }));
    items.push(
      "-",
      { label: "Библиотека объектов", icon: Boxes, keys: "B", checked: session.settings.library, run: () => (session.settings.library = !session.settings.library) },
      { label: "Загрузить файлы…", icon: ImagePlus, run: () => void upload() },
    );
    menu.dropdown(e.currentTarget as HTMLElement, items, "top-end");
  }

  async function upload() {
    const files = await pickFiles();
    if (files.length) await addFiles(b, files, b.camera.center);
  }

  /* ------------------------------ стиль ------------------------------ */

  const st = b.style;
  const showStyle = $derived(!b.readonly && ["note", "text", "shape", "draw", "pen", "arrow", "line"].includes(b.tool));
  const strokes = $derived(["shape", "draw", "pen", "arrow", "line"].includes(b.tool));
  // уведомления поднимаются над полосой стиля, чтобы её не закрывать
  $effect(() => {
    const root = document.documentElement.style;
    root.setProperty("--toast-bottom", showStyle ? "136px" : "86px");
    return () => root.removeProperty("--toast-bottom");
  });
  const SIZES: StrokeSize[] = ["s", "m", "l", "xl"];
  const TEXT: [TextSize, string][] = [
    ["s", "S"],
    ["m", "M"],
    ["l", "L"],
    ["xl", "XL"],
  ];
  const FILLS: [Fill, string][] = [
    ["none", "Без заливки"],
    ["tint", "Полупрозрачная"],
    ["solid", "Сплошная"],
  ];
  const DASHES: [Dash, string][] = [
    ["solid", "Сплошная"],
    ["dash", "Штрихи"],
    ["dot", "Точки"],
  ];
  const ROUTE_D: Record<Route, string> = {
    straight: "M3 14 15 4",
    curve: "M3 14C9 14 9 4 15 4",
    elbow: "M3 14H9V4h6",
  };

  function headMenu(e: MouseEvent, end: 0 | 1) {
    menu.dropdown(
      e.currentTarget as HTMLElement,
      [
        { heading: end ? "Конец стрелки" : "Начало стрелки" },
        ...headChoice(end ? st.head1 : st.head0, !end, (h) => {
          if (end) st.head1 = h;
          else st.head0 = h;
        }),
        "-",
        { heading: "Размер наконечников" },
        ...choice(HEAD_SIZES, st.hs, (hs) => (st.hs = hs)),
      ],
      "top-start",
    );
  }

  const weightPx = (s: StrokeSize) => Math.max(2, Math.min(9, STROKE_PX[s] * (b.tool === "draw" || b.tool === "pen" ? 1.15 : 1)));
</script>

<div class="dock" class:chat-open={b.ui.chat || !!b.ui.style || !!b.ui.logic}>
  {#if showStyle}
    <div class="style panel" role="toolbar" aria-label="Стиль">
      <div class="colors">
        {#each COLORS as c (c)}
          <button
            class="color"
            class:on={st.color === c}
            aria-label={COLOR_LABELS[c as ColorName]}
            onclick={() => (st.color = c)}
            {@attach tip(COLOR_LABELS[c as ColorName], undefined, "top")}
          >
            <span class="swatch" class:default={c === "default"} style:--sw={colorCss(c)}></span>
          </button>
        {/each}
        <button
          class="color"
          class:on={isHex(st.color)}
          aria-label="Свой цвет"
          onclick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            pickColor(st.color, { x: r.left, y: r.top }, (c) => (st.color = colorKey(c)), { title: "Цвет новых объектов" });
          }}
          {@attach tip("Свой цвет", undefined, "top")}
        >
          <span class="swatch custom" style:--sw={isHex(st.color) ? st.color : "transparent"}></span>
        </button>
      </div>
      {#if b.tool === "text"}
        <div class="tb-sep"></div>
        {#each TEXT as [v, label] (v)}
          <button class="chip" class:on={st.size === v} onclick={() => (st.size = v)} aria-label="Размер {label}">{label}</button>
        {/each}
      {/if}
      {#if strokes}
        <div class="tb-sep"></div>
        {#each SIZES as v (v)}
          <button class="chip" class:on={st.stroke === v} onclick={() => (st.stroke = v)} aria-label="Толщина {v.toUpperCase()}" {@attach tip(`Толщина ${v.toUpperCase()}`, undefined, "top")}>
            <span class="weight" style:height="{weightPx(v)}px"></span>
          </button>
        {/each}
      {/if}
      {#if b.tool === "shape"}
        <div class="tb-sep"></div>
        {#each FILLS as [v, label] (v)}
          <button class="chip" class:on={st.fill === v} onclick={() => (st.fill = v)} aria-label={label} {@attach tip(label, undefined, "top")}>
            <span class="fill f-{v}"></span>
          </button>
        {/each}
      {/if}
      {#if b.tool === "shape" || b.tool === "arrow" || b.tool === "line"}
        <div class="tb-sep"></div>
        {#each DASHES as [v, label] (v)}
          <button class="chip" class:on={st.dash === v} onclick={() => (st.dash = v)} aria-label={label} {@attach tip(label, undefined, "top")}>
            <svg width="18" height="10" viewBox="0 0 18 10"><line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray={v === "dash" ? "4 4" : v === "dot" ? "0.1 4" : undefined} /></svg>
          </button>
        {/each}
      {/if}
      {#if b.tool === "arrow"}
        <div class="tb-sep"></div>
        {#each ROUTES as r (r)}
          <button class="chip" class:on={st.route === r} aria-label={ROUTE_LABELS[r]} aria-pressed={st.route === r} onclick={() => (st.route = r)} {@attach tip(ROUTE_LABELS[r], undefined, "top")}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d={ROUTE_D[r]} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        {/each}
        <div class="tb-sep"></div>
        <button class="chip glyph" aria-label="Начало стрелки" onclick={(e) => headMenu(e, 0)} {@attach tip("Начало стрелки", undefined, "top")}>
          {@html headGlyph(st.head0, true, 26, 16)}<ChevronDown size={12} />
        </button>
        <button class="chip glyph" aria-label="Конец стрелки" onclick={(e) => headMenu(e, 1)} {@attach tip("Конец стрелки", undefined, "top")}>
          {@html headGlyph(st.head1 === "none" ? "arrow" : st.head1, false, 26, 16)}<ChevronDown size={12} />
        </button>
      {/if}
      {#if b.tool === "draw" || b.tool === "pen"}
        <div class="tb-sep"></div>
        <button
          class="chip"
          class:on={session.settings.smartDraw && b.tool === "draw"}
          onclick={() => {
            if (b.tool === "pen") {
              session.settings.smartDraw = true;
              b.setTool("draw", b.toolLock);
            } else session.settings.smartDraw = !session.settings.smartDraw;
          }}
          {@attach tip(session.settings.smartDraw && b.tool === "draw" ? "Распознавание фигур включено" : "Распознавать фигуры", undefined, "top")}
        >
          <WandSparkles size={15} /> <span class="chip-label">Фигуры</span>
        </button>
      {/if}
    </div>
  {/if}

  <div class="tools panel" role="toolbar" aria-label="Инструменты">
    {#if b.readonly}
      {#each readonlyTools as t (t.id)}
        {@render toolBtn(t)}
      {/each}
    {:else if compact.current}
      {#each short as t (t.id)}
        {@render toolBtn(t)}
      {/each}
      <button class="tool" class:on={!!extraActive} aria-label="Ещё инструменты" onclick={moreMenu}>
        {#if extraActive}
          <extraActive.icon size={19} />
        {:else}
          <Ellipsis size={19} />
        {/if}
      </button>
    {:else}
      {#each full as group, gi (gi)}
        {#if gi}<div class="tb-sep"></div>{/if}
        {#each group as t (t.id)}
          {@render toolBtn(t)}
        {/each}
      {/each}
      <div class="tb-sep"></div>
      <button class="tool" aria-label="Загрузить файлы" onclick={() => void upload()} {@attach tip("Загрузить файлы", undefined, "top")}>
        <ImagePlus size={19} />
      </button>
    {/if}
  </div>
</div>

{#snippet toolBtn(t: ToolDef)}
  {@const Icon = t.icon}
  <button
    class="tool"
    class:on={current === t.id}
    class:locked={current === t.id && b.toolLock}
    aria-label={t.label}
    aria-pressed={current === t.id}
    onclick={() => pick(t.id)}
    ondblclick={() => t.id !== "select" && t.id !== "hand" && b.setTool(t.id, true)}
    {@attach tip(t.hint ? `${t.label} — ${t.hint}` : t.label, t.key, "top")}
  >
    {#if t.id === "shape"}
      <span class="shape-ic">{@html shapeGlyph(b.shapeKind, 19, 1.9)}</span>
    {:else}
      <Icon size={19} />
    {/if}
    {#if t.id === "shape" && !b.readonly}
      <span
        class="caret"
        role="button"
        tabindex="-1"
        aria-label="Выбрать фигуру"
        onclick={shapeMenu}
        onkeydown={() => {}}
        ondblclick={(e) => e.stopPropagation()}><ChevronUp size={10} strokeWidth={2.5} /></span
      >
    {/if}
  </button>
{/snippet}

<style>
  .dock {
    position: fixed;
    left: 50%;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    max-width: calc(100vw - 16px);
    transition:
      opacity 160ms var(--ease-out),
      translate 160ms var(--ease-out);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: var(--r-4);
    overflow-x: auto;
    scrollbar-width: none;
    max-width: 100%;
  }
  .style {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    border-radius: var(--r-3);
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    animation: style-in 180ms var(--ease-out) both;
  }
  @keyframes style-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
  }
  .colors {
    display: flex;
    align-items: center;
  }
  .color {
    width: 28px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-1);
    flex: none;
  }
  .color:hover {
    background: var(--hover);
  }
  .color .swatch {
    transition: transform var(--t-fast) var(--ease-out);
  }
  .swatch.custom {
    background:
      radial-gradient(circle, var(--sw) 0 4.5px, transparent 5px),
      conic-gradient(#f87171, #fbbf24, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171);
  }
  .color.on .swatch {
    transform: scale(1.12);
    box-shadow:
      0 0 0 2px var(--surface-1),
      0 0 0 3.5px var(--accent);
  }
  .fill {
    width: 15px;
    height: 15px;
    border-radius: 4px;
    border: 1.75px solid currentColor;
  }
  .fill.f-tint {
    background: color-mix(in oklab, currentColor 30%, transparent);
  }
  .fill.f-solid {
    background: currentColor;
  }
  .chip-label {
    font-size: 12.5px;
  }
  .chip.glyph {
    gap: 1px;
  }
  .shape-ic {
    display: grid;
    place-items: center;
  }
  /* на телефоне чат и панели — листом снизу; панель инструментов уходит */
  @media (max-width: 760px) {
    .dock.chat-open {
      opacity: 0;
      pointer-events: none;
      translate: 0 16px;
    }
  }
  @media (max-width: 640px) {
    .dock {
      bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    }
    .chip-label {
      display: none;
    }
  }
</style>
