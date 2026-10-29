<script lang="ts">
  /* Плавающая панель над выделением: самое нужное для выбранного типа
     объектов в один щелчок, остальное — в «⋯» (то же, что правая кнопка). */
  import AlignStartVertical from "@lucide/svelte/icons/align-start-vertical";
  import Calendar from "@lucide/svelte/icons/calendar";
  import Check from "@lucide/svelte/icons/check";
  import Flag from "@lucide/svelte/icons/flag";
  import Grid3x3 from "@lucide/svelte/icons/grid-3x3";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Table2 from "@lucide/svelte/icons/table-2";
  import UserRound from "@lucide/svelte/icons/user-round";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Code from "@lucide/svelte/icons/code";
  import Dices from "@lucide/svelte/icons/dices";
  import Download from "@lucide/svelte/icons/download";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Eye from "@lucide/svelte/icons/eye";
  import Frame from "@lucide/svelte/icons/frame";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import Lock from "@lucide/svelte/icons/lock";
  import LockOpen from "@lucide/svelte/icons/lock-open";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Play from "@lucide/svelte/icons/play";
  import Scan from "@lucide/svelte/icons/scan";
  import Square from "@lucide/svelte/icons/square";
  import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
  import TextAlignCenter from "@lucide/svelte/icons/text-align-center";
  import TextAlignEnd from "@lucide/svelte/icons/text-align-end";
  import TextAlignStart from "@lucide/svelte/icons/text-align-start";
  import TextCursorInput from "@lucide/svelte/icons/text-cursor-input";
  import TextWrap from "@lucide/svelte/icons/text-wrap";
  import Trash from "@lucide/svelte/icons/trash";
  import Paintbrush from "@lucide/svelte/icons/paintbrush";
  import Settings2 from "@lucide/svelte/icons/settings-2";
  import Zap from "@lucide/svelte/icons/zap";
  import SquareMousePointer from "@lucide/svelte/icons/square-mouse-pointer";
  import { MediaQuery } from "svelte/reactivity";
  import { download } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import { menu, type MenuEntry } from "../../ui/menu.svelte.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { downloadShelf, fileUrl } from "../files.ts";
  import { headGlyph, routeOf } from "../connector.ts";
  import { DASHES, FILLS, HEAD_SIZES, ROUTES, SIZES, TEXT_SIZES, choice, fontItems, headChoice, langItems, nodeMenu, reversePath, setRoute, stickerItems, textStyleItems } from "../menus.ts";
  import { PRIO_CSS, assigneeItems, counterItems, diceItems, dueItems, loadMembers, prioItems, progressItems, resetVotes, tableItems, timerItems, timerShort, toggleDone } from "../nodes/actions.ts";
  import { counterReset, counterSet, counterValue, diceCount, diceSides, rollDice } from "../nodes/games.ts";
  import { votesOf } from "../nodes/poll.ts";
  import { dueInfo } from "../nodes/task.ts";
  import {
    COLOR_ITEMS,
    FONT_TYPES,
    PREVIEW_LANGS,
    ROUTE_LABELS,
    SHAPE_KINDS,
    SHAPE_LABELS,
    colorCss,
    langLabel,
    type NodeData,
    type Head,
    type NodeType,
    type Route,
    type ShapeKind,
    TITLED_TYPES,
    WIDGET_TYPES,
  } from "../model.ts";
  import { embedFor } from "../embeds.ts";
  import { canLogic, ruleSummary } from "../logic.svelte.ts";
  import { primaryAction, widgetItems } from "../nodes/widgetItems.ts";
  import { align, distribute, fitFrame, removeSelected, tidy, wrapInFrame } from "../ops.ts";

  const b = useBoard();
  const ix = b.ix;
  const cam = b.camera;
  const s = $derived(b.view);

  const views = $derived(s.selected());
  const one = $derived(views.length === 1 ? views[0]! : null);
  const types = $derived(new Set<NodeType>(views.map((v) => v.type)));
  const only = $derived(types.size === 1 ? [...types][0]! : null);
  const locked = $derived(views.length > 0 && views.every((v) => v.locked));
  const editingCode = $derived(!!s.editing && s.get(s.editing)?.type === "code");

  /* на телефоне панель не летает за выделением, а стоит внизу над инструментами */
  const narrow = new MediaQuery("max-width: 640px");
  const coarse = new MediaQuery("pointer: coarse");
  const docked = $derived(narrow.current);

  // контекстное меню у точки (правая кнопка, «что поставить на конце») — панель не мешает
  const pointMenu = $derived(!!menu.open && !menu.open.anchor);
  const visible = $derived(
    !b.readonly && views.length > 0 && only !== "comment" && b.tool === "select" && !ix.busy && !ix.renaming && !editingCode && !pointMenu && !(docked && b.ui.inspect),
  );

  /* ------------------------------ положение ------------------------------ */

  let bw = $state(0);
  let bh = $state(0);
  const GAP = 40;


  const pos = $derived.by(() => {
    if (!visible) return null;
    if (docked) return { x: 0, y: 0, above: true };
    const r = s.boundsOfIds(s.selection.ids);
    if (!r) return null;
    const a = cam.toScreen(r.x, r.y);
    const c = cam.toScreen(r.x + r.w, r.y + r.h);
    const w = bw || 300;
    const h = bh || 40;
    let x = (a.x + c.x) / 2 - w / 2;
    x = Math.max(8, Math.min(cam.vw - w - 8 - b.inset.right, x));
    let y = a.y - GAP - h;
    let above = true;
    if (y < 62) {
      y = c.y + GAP;
      above = false;
      if (y + h > cam.vh - 70) {
        y = 62;
        above = true;
      }
    }
    if (c.y < 0 || a.y > cam.vh || c.x < 0 || a.x > cam.vw) return null;
    return { x: Math.round(x), y: Math.round(y), above };
  });

  const place = $derived(pos?.above === false ? "bottom-start" : "top-start");

  /* ------------------------------ действия ------------------------------ */

  const ids = $derived(views.map((v) => v.id));
  const set = (patch: Partial<NodeData>) => s.updateMany(ids.map((id) => [id, patch]));
  const anchorOf = (e: MouseEvent) => e.currentTarget as HTMLElement;
  const drop = (e: MouseEvent, items: MenuEntry[]) => menu.dropdown(anchorOf(e), items, place);

  const colorTypes = new Set<NodeType>(["note", "text", "code", "shape", "path", "ink", "frame", "link", "file", "shelf", "task", "table", "poll", "timer", "audio", "counter", "dice", "progress", ...WIDGET_TYPES]);
  const hasColor = $derived(views.some((v) => colorTypes.has(v.type)));
  const color = $derived.by(() => {
    const c = new Set(views.filter((v) => colorTypes.has(v.type)).map((v) => v.props.color ?? "default"));
    return c.size === 1 ? [...c][0]! : null;
  });

  function colorMenu(e: MouseEvent) {
    drop(e, [{ label: "Цвет", custom: "colors", colors: COLOR_ITEMS, allowCustom: true, current: color ?? undefined, pick: (c: string) => set({ color: c as NodeData["color"] }) }]);
  }

  const textTypes = new Set<NodeType>(["note", "text", "shape"]);
  const allText = $derived(views.length > 0 && views.every((v) => textTypes.has(v.type)));
  /* у линий с подписью — только размер подписи */
  const allLabels = $derived(views.length > 0 && views.every((v) => v.type === "path" && v.textValue.trim() !== ""));
  const alignVal = $derived(one?.props.align ?? (views.every((v) => (v.props.align ?? "left") === (views[0]?.props.align ?? "left")) ? (views[0]?.props.align ?? "left") : "left"));
  const ALIGN_NEXT = { left: "center", center: "right", right: "left" } as const;
  const sizeVal = $derived(one?.props.size ?? (one?.type === "path" ? "s" : "m"));

  const strokeTypes = new Set<NodeType>(["shape", "path", "ink"]);
  const allStroke = $derived(views.length > 0 && views.every((v) => strokeTypes.has(v.type)));
  const strokeVal = $derived(one?.props.stroke ?? "m");

  function strokeMenu(e: MouseEvent) {
    const p = one?.props ?? {};
    const items: MenuEntry[] = [{ heading: "Толщина" }, ...choice(SIZES, p.stroke ?? "m", (stroke) => set({ stroke }))];
    if (!types.has("ink")) items.push("-", { heading: "Линия" }, ...choice(DASHES, p.dash ?? "solid", (dash) => set({ dash })));
    drop(e, items);
  }

  function shapeMenu(e: MouseEvent) {
    const p = one?.props ?? {};
    const kinds: ShapeKind[] = [...SHAPE_KINDS, ...(p.kind === "poly" ? (["poly"] as ShapeKind[]) : [])];
    drop(e, [
      { heading: "Форма" },
      ...kinds.map((k) => ({ label: SHAPE_LABELS[k], checked: (p.kind ?? "rect") === k, run: () => set({ kind: k }) })),
      "-",
      { heading: "Заливка" },
      ...choice(FILLS, p.fill ?? "tint", (fill) => set({ fill })),
    ]);
  }

  function sizeMenu(e: MouseEvent) {
    const fonts = views.some((v) => FONT_TYPES.has(v.type));
    const styled = textStyleItems(views, set);
    drop(e, [
      { heading: allLabels ? "Размер подписи" : "Размер текста" },
      ...choice(TEXT_SIZES, sizeVal, (size) => set({ size })),
      ...(fonts ? ["-" as const, { label: "Шрифт", items: fontItems(views, set, s.font) }] : []),
      ...(styled.length ? ["-" as const, { heading: "Начертание" }, ...styled] : []),
    ]);
  }

  function langMenu(e: MouseEvent) {
    if (!one) return;
    const cur = one.props.lang ?? "text";
    drop(
      e,
      langItems(cur, (lang) => s.update(one.id, { lang })),
    );
  }

  function alignMenu(e: MouseEvent) {
    drop(e, [
      { label: "По левому краю", run: () => align(b, ids, "left") },
      { label: "По центру", run: () => align(b, ids, "hcenter") },
      { label: "По правому краю", run: () => align(b, ids, "right") },
      "-",
      { label: "По верху", run: () => align(b, ids, "top") },
      { label: "По середине", run: () => align(b, ids, "vcenter") },
      { label: "По низу", run: () => align(b, ids, "bottom") },
      "-",
      { label: "Равные промежутки по горизонтали", disabled: views.length < 3, run: () => distribute(b, ids, "x") },
      { label: "Равные промежутки по вертикали", disabled: views.length < 3, run: () => distribute(b, ids, "y") },
    ]);
  }

  function more(e: MouseEvent) {
    drop(e, nodeMenu(b, ix));
  }

  /** Панель настроек справа (на телефоне — лист снизу): вкладка и, для логики, стрелка. */
  const insp = $derived(b.ui.inspect);
  function openStyle() {
    b.inspect("style", { toggle: true });
  }
  function openProps() {
    b.inspect("props", { toggle: true });
  }
  function openLogic(id: string) {
    b.inspect("logic", { arrow: id, toggle: true });
  }

  /* ------------------------------ виджеты ------------------------------ */

  const widget = $derived(only && WIDGET_TYPES.has(only) ? only : null);
  const primary = $derived(widget ? primaryAction(b, views) : null);
  const logicOk = $derived(one?.type === "path" && canLogic(s, one));

  /** Подменю из готового списка действий — для быстрых кнопок. */
  function sub(e: MouseEvent, items: MenuEntry[], label: string) {
    const it = items.find((x): x is Exclude<MenuEntry, "-" | { heading: string }> => typeof x === "object" && "label" in x && x.label === label);
    if (it?.items) drop(e, [{ heading: label }, ...it.items]);
  }
  const fmt = (n: number) => String(n).replace(".", ",");
  const diceLabel = $derived(one?.type === "dice" ? (one.props.faces?.length ? "Свои" : `d${diceSides(one.props)}`) : "Грани");

  /* ------------------------------ задачи ------------------------------ */

  const tasks = $derived(only === "task" ? views : []);
  const allDone = $derived(tasks.length > 0 && tasks.every((v) => v.props.done));
  const same = <T,>(list: T[]): T | null => (list.length && list.every((x) => x === list[0]) ? list[0]! : null);
  const who = $derived(same(tasks.map((v) => v.props.who?.id ?? "")) ? tasks[0]!.props.who : null);
  const prio = $derived(same(tasks.map((v) => v.props.prio ?? "")) || null);
  const due = $derived.by(() => {
    const d = same(tasks.map((v) => v.props.due ?? ""));
    return d ? dueInfo(d, allDone) : null;
  });
  $effect(() => {
    if (tasks.length) void loadMembers(b);
  });

  /** Под кнопкой — туда же откроется системный выбор даты. */
  const under = (e: MouseEvent) => {
    const r = anchorOf(e).getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  };

  /* ------------------------------ линии ------------------------------ */

  const routes = $derived(new Set(views.filter((v) => v.type === "path").map((v) => routeOf(v.props))));
  const route = $derived(routes.size === 1 ? [...routes][0]! : null);
  const ROUTE_D: Record<Route, string> = {
    straight: "M3 14 15 4",
    curve: "M3 14C9 14 9 4 15 4",
    elbow: "M3 14H9V4h6",
  };
  const headOf = (end: 0 | 1): Head => {
    const hs = new Set(views.filter((v) => v.type === "path").map((v) => (end ? v.props.head1 : v.props.head0) ?? "none"));
    return hs.size === 1 ? [...hs][0]! : "none";
  };
  const head0 = $derived(headOf(0));
  const head1 = $derived(headOf(1));

  function headMenu(e: MouseEvent, end: 0 | 1) {
    const cur = end ? head1 : head0;
    const p = one?.props;
    drop(e, [
      { heading: end ? "Конец линии" : "Начало линии" },
      ...headChoice(cur, !end, (h) => {
        set(end ? { head1: h, hb1: undefined } : { head0: h, hb0: undefined });
        if (end && h !== "none") b.style.head1 = h;
        if (!end) b.style.head0 = h;
      }),
      "-",
      { heading: "Размер наконечников" },
      ...choice(HEAD_SIZES, p?.hs ?? "m", (hs) => {
        set({ hs: hs === "m" ? undefined : hs });
        b.style.hs = hs;
      }),
    ]);
  }
</script>

{#if pos}
  <div
    class="ctx panel"
    role="toolbar"
    tabindex="-1"
    aria-label="Свойства выделенного"
    bind:offsetWidth={bw}
    bind:offsetHeight={bh}
    class:docked
    style:transform={docked ? null : `translate(${pos.x}px, ${pos.y}px)`}
    onpointerdown={(e) => e.stopPropagation()}
  >
    {#if locked}
      <button class="chip" onclick={() => set({ locked: undefined })} {@attach tip("Открепить", "Mod+L", "top")}>
        <LockOpen size={15} /> Открепить
      </button>
    {:else}
      {#if hasColor}
        <button class="chip" aria-label="Цвет" onclick={colorMenu} {@attach tip("Цвет", undefined, "top")}>
          <span class="swatch" class:default={color === "default"} class:mixed={!color} style:--sw={color ? colorCss(color) : "transparent"}></span>
        </button>
      {/if}

      {#if allText || allLabels}
        <button class="chip" onclick={sizeMenu} aria-label="Размер текста" {@attach tip(allLabels ? "Размер подписи" : "Размер текста", undefined, "top")}>
          <span class="aa">Aa</span><span class="sub">{sizeVal.toUpperCase()}</span>
        </button>
      {/if}
      {#if allText}
        <button
          class="chip"
          aria-label="Выравнивание текста"
          onclick={() => set({ align: ALIGN_NEXT[alignVal] === "left" ? undefined : ALIGN_NEXT[alignVal] })}
          {@attach tip("Выравнивание текста", undefined, "top")}
        >
          {#if alignVal === "center"}<TextAlignCenter size={16} />{:else if alignVal === "right"}<TextAlignEnd size={16} />{:else}<TextAlignStart size={16} />{/if}
        </button>
      {/if}

      {#if only === "shape"}
        <button class="chip" onclick={shapeMenu} aria-label="Форма и заливка" {@attach tip("Форма и заливка", undefined, "top")}>
          {SHAPE_LABELS[(one?.props.kind ?? "rect") as ShapeKind]}<ChevronDown size={13} />
        </button>
      {/if}

      {#if allStroke}
        <button class="chip" onclick={strokeMenu} aria-label="Линия" {@attach tip("Толщина и штрих", undefined, "top")}>
          <span class="weight" style:height="{({ s: 2, m: 3, l: 5, xl: 7 })[strokeVal]}px"></span><ChevronDown size={13} />
        </button>
      {/if}

      {#if only === "path"}
        <div class="seg" role="group" aria-label="Маршрут">
          {#each ROUTES as r (r)}
            <button class="chip" class:on={route === r} aria-label={ROUTE_LABELS[r]} aria-pressed={route === r} onclick={() => setRoute(b, ids, r)} {@attach tip(ROUTE_LABELS[r], undefined, "top")}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d={ROUTE_D[r]} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          {/each}
        </div>
        <button class="chip glyph" aria-label="Начало линии" onclick={(e) => headMenu(e, 0)} {@attach tip("Начало линии", undefined, "top")}>
          {@html headGlyph(head0, true, 26, 16)}<ChevronDown size={13} />
        </button>
        <button class="chip glyph" aria-label="Конец линии" onclick={(e) => headMenu(e, 1)} {@attach tip("Конец линии", undefined, "top")}>
          {@html headGlyph(head1, false, 26, 16)}<ChevronDown size={13} />
        </button>
        {#if one}
          <button class="chip" aria-label="Развернуть" onclick={() => reversePath(b, one)} {@attach tip("Развернуть", undefined, "top")}><ArrowLeftRight size={15} /></button>
          {#if !one.textValue.trim()}
            <button class="chip" aria-label="Подпись" onclick={() => ix.edit(one.id, "end")} {@attach tip("Подпись", "Enter", "top")}><TextCursorInput size={16} /></button>
          {/if}
        {/if}
      {/if}

      {#if only === "code" && one}
        <button class="chip" onclick={langMenu} aria-label="Язык" {@attach tip("Язык", undefined, "top")}>
          {langLabel(one.props.lang)}<ChevronDown size={13} />
        </button>
        {#if PREVIEW_LANGS.has(one.props.lang ?? "")}
          <button
            class="chip"
            class:on={one.props.view === "preview"}
            aria-label={one.props.view === "preview" ? "Показать код" : "Показать результат"}
            onclick={() => s.update(one.id, { view: one.props.view === "preview" ? "code" : "preview" })}
            {@attach tip(one.props.view === "preview" ? "Показать код" : "Показать результат", undefined, "top")}
          >
            {#if one.props.view === "preview"}<Code size={16} />{:else}<Eye size={16} />{/if}
          </button>
        {/if}
        <button class="chip" class:on={one.props.wrap !== false} aria-label="Перенос строк" onclick={() => s.update(one.id, { wrap: one.props.wrap === false ? undefined : false })} {@attach tip("Перенос строк", undefined, "top")}>
          <TextWrap size={16} />
        </button>
      {/if}

      {#if one?.type === "image"}
        <button class="chip" onclick={() => (b.ui.viewer = one.id)} aria-label="Открыть" {@attach tip("Открыть", "Enter", "top")}><Maximize2 size={15} /></button>
        {#if one.props.src}
          <button class="chip" onclick={() => download(fileUrl(one.props.src, { dl: true, name: one.props.name }), one.props.name || "image")} aria-label="Скачать" {@attach tip("Скачать", undefined, "top")}><Download size={15} /></button>
        {/if}
      {/if}
      {#if one?.type === "video"}
        {#if b.live.has(one.id)}
          <button class="chip" onclick={() => ix.deactivate(one.id)} aria-label="Закрыть плеер" {@attach tip("Закрыть плеер", undefined, "top")}><Square size={14} /></button>
        {:else}
          <button class="chip" onclick={() => ix.activate(one.id)} aria-label="Смотреть" {@attach tip("Смотреть", "Enter", "top")}><Play size={15} /></button>
        {/if}
        {#if one.props.url}
          <button class="chip" onclick={() => window.open(one.props.url, "_blank", "noopener")} aria-label="Открыть на сайте" {@attach tip("Открыть на сайте", undefined, "top")}><ExternalLink size={15} /></button>
        {/if}
      {/if}
      {#if one?.type === "link" && one.props.url}
        <button class="chip" onclick={() => window.open(one.props.url, "_blank", "noopener")} aria-label="Открыть ссылку" {@attach tip("Открыть ссылку", undefined, "top")}><ExternalLink size={15} /></button>
        {#if one.props.embeddable !== false || embedFor(one.props.url)}
          <button
            class="chip"
            class:on={!!one.props.live}
            aria-label="Живой просмотр"
            onclick={() => s.update(one.id, { live: one.props.live ? undefined : true })}
            {@attach tip(one.props.live ? "Показывать карточкой" : embedFor(one.props.url) ? "Показывать плеер" : "Показывать страницу", undefined, "top")}><Eye size={15} /></button
          >
        {/if}
      {/if}
      {#if one?.type === "file" && one.props.src}
        <button class="chip" onclick={() => download(fileUrl(one.props.src, { dl: true, name: one.props.name }), one.props.name || "file")} aria-label="Скачать" {@attach tip("Скачать", undefined, "top")}><Download size={15} /></button>
      {/if}
      {#if one?.type === "shelf"}
        <button class="chip" disabled={!(one.props.items ?? []).length} onclick={() => void downloadShelf(one.props.name || "Полка", one.props.items ?? [])} aria-label="Скачать архивом" {@attach tip("Скачать всё архивом", undefined, "top")}><Download size={15} /></button>
      {/if}
      {#if one?.type === "frame"}
        <button class="chip" onclick={() => (ix.renaming = one.id)} aria-label="Переименовать" {@attach tip("Переименовать", "Enter", "top")}><Pencil size={15} /></button>
        <button class="chip" onclick={() => fitFrame(b, one.id)} aria-label="Подогнать под содержимое" {@attach tip("Подогнать под содержимое", undefined, "top")}><Scan size={15} /></button>
      {/if}

      {#if only === "task"}
        <button class="chip" class:on={allDone} onclick={() => toggleDone(b, views)} aria-label={allDone ? "Вернуть в работу" : "Готово"} aria-pressed={allDone} {@attach tip(allDone ? "Вернуть в работу" : "Готово", undefined, "top")}>
          <Check size={16} strokeWidth={allDone ? 3 : 2} />
        </button>
        <button class="chip" onclick={(e) => drop(e, assigneeItems(b, views))} aria-label="Исполнитель" {@attach tip(who ? `Исполнитель: ${who.name}` : "Исполнитель", undefined, "top")}>
          {#if who}<Avatar name={who.name} color={who.color} size={20} title="" />{:else}<UserRound size={16} />{/if}
        </button>
        <button class="chip" class:late={due?.late} onclick={(e) => drop(e, dueItems(b, views, under(e)))} aria-label="Срок" {@attach tip(due?.full ?? "Срок", undefined, "top")}>
          <Calendar size={15} />{#if due}<span class="lbl">{due.short}</span>{/if}
        </button>
        <button class="chip" onclick={(e) => drop(e, prioItems(b, views))} aria-label="Приоритет" {@attach tip("Приоритет", undefined, "top")}>
          <span class="flag" style:color={prio ? PRIO_CSS[prio as keyof typeof PRIO_CSS] : undefined}><Flag size={15} fill={prio ? "currentColor" : "none"} /></span>
        </button>
      {/if}
      {#if one?.type === "table"}
        <button class="chip" onclick={(e) => drop(e, tableItems(b, one))} aria-label="Строки и столбцы" {@attach tip("Строки и столбцы", undefined, "top")}>
          <Grid3x3 size={16} /><ChevronDown size={13} />
        </button>
        <button class="chip" class:on={one.props.head !== false} aria-pressed={one.props.head !== false} onclick={() => s.update(one.id, { head: one.props.head === false ? undefined : false })} aria-label="Шапка таблицы" {@attach tip("Первая строка — шапка", undefined, "top")}>
          <Table2 size={16} />
        </button>
      {/if}
      {#if one?.type === "poll"}
        <button class="chip" class:on={!!one.props.multi} aria-pressed={!!one.props.multi} onclick={() => s.update(one.id, { multi: one.props.multi ? undefined : true })} aria-label="Несколько ответов" {@attach tip("Несколько ответов", undefined, "top")}>
          <ListChecks size={16} />
        </button>
        <button class="chip" disabled={!votesOf(one).size} onclick={() => void resetVotes(b, one)} aria-label="Сбросить голоса" {@attach tip("Сбросить голоса", undefined, "top")}>
          <RotateCcw size={15} />
        </button>
      {/if}
      {#if only === "timer"}
        <button class="chip" onclick={(e) => drop(e, timerItems(b, views))} aria-label="Длительность" {@attach tip("Длительность", undefined, "top")}>
          <span class="lbl">{one ? timerShort(one) : "Время"}</span><ChevronDown size={13} />
        </button>
        {#if one}
          <button class="chip" onclick={() => (ix.renaming = one.id)} aria-label="Переименовать" {@attach tip("Переименовать", "Enter", "top")}><Pencil size={15} /></button>
        {/if}
      {/if}
      {#if only === "counter"}
        <button class="chip" onclick={(e) => sub(e, counterItems(b, views), "Шаг")} aria-label="Шаг" {@attach tip("Шаг", undefined, "top")}>
          <span class="lbl">±{one ? fmt(one.props.step ?? 1) : "…"}</span><ChevronDown size={13} />
        </button>
        <button class="chip" disabled={views.every((v) => counterValue(v.props) === counterReset(v.props))} onclick={() => views.forEach((v) => counterSet(b, [v.id], counterReset(v.props)))} aria-label="Сбросить" {@attach tip("Сбросить", undefined, "top")}>
          <RotateCcw size={15} />
        </button>
        {#if one}
          <button class="chip" onclick={() => (ix.renaming = one.id)} aria-label="Переименовать" {@attach tip("Переименовать", "Enter", "top")}><Pencil size={15} /></button>
        {/if}
      {/if}
      {#if only === "dice"}
        <button class="chip" onclick={() => rollDice(b, ids)} aria-label="Бросить" {@attach tip("Бросить", "Enter", "top")}>
          <Dices size={16} /><span class="lbl">Бросить</span>
        </button>
        <button class="chip" onclick={(e) => sub(e, diceItems(b, views), "Граней")} aria-label="Граней" {@attach tip("Граней", undefined, "top")}>
          <span class="lbl">{diceLabel}</span><ChevronDown size={13} />
        </button>
        <button class="chip" onclick={(e) => sub(e, diceItems(b, views), "Сколько кубиков")} aria-label="Сколько кубиков" {@attach tip("Сколько кубиков", undefined, "top")}>
          <span class="lbl">×{one ? diceCount(one.props) : "…"}</span><ChevronDown size={13} />
        </button>
      {/if}
      {#if only === "progress"}
        <button class="chip" onclick={(e) => sub(e, progressItems(b, views), "Значение")} aria-label="Значение" {@attach tip("Значение", undefined, "top")}>
          <span class="lbl">{one ? `${Math.round(one.props.pv ?? 0)} %` : "%"}</span><ChevronDown size={13} />
        </button>
        <button class="chip" onclick={(e) => sub(e, progressItems(b, views), "Этапы")} aria-label="Этапы" {@attach tip("Этапы", undefined, "top")}>
          <span class="lbl">Этапы</span><ChevronDown size={13} />
        </button>
        {#if one}
          <button class="chip" onclick={() => (ix.renaming = one.id)} aria-label="Переименовать" {@attach tip("Переименовать", "Enter", "top")}><Pencil size={15} /></button>
        {/if}
      {/if}
      {#if only === "sticker"}
        <button class="chip emo" onclick={(e) => drop(e, stickerItems(b, ids))} aria-label="Сменить эмодзи" {@attach tip("Сменить эмодзи", "Enter", "top")}>
          {one?.props.emoji ?? "🙂"}<ChevronDown size={13} />
        </button>
      {/if}
      {#if one?.type === "audio" && one.props.src}
        <button class="chip" onclick={() => download(fileUrl(one.props.src, { dl: true, name: one.props.name }), one.props.name || "audio")} aria-label="Скачать" {@attach tip("Скачать", undefined, "top")}><Download size={15} /></button>
      {/if}

      {#if widget}
        {#if primary}
          <button class="chip" onclick={primary.run} aria-label={primary.label} {@attach tip(primary.label, undefined, "top")}>
            <span class="lbl">{primary.label}</span>
          </button>
        {/if}
        {#if widgetItems(b, views).length}
          <button class="chip" onclick={(e) => drop(e, widgetItems(b, views))} aria-label="Быстрые настройки" {@attach tip("Быстрые настройки", undefined, "top")}>
            <ChevronDown size={14} />
          </button>
        {/if}
        {#if one && TITLED_TYPES.has(one.type) && one.type !== "timer" && one.type !== "counter" && one.type !== "progress"}
          <button class="chip" onclick={() => (ix.renaming = one.id)} aria-label="Переименовать" {@attach tip("Переименовать", "Enter", "top")}><Pencil size={15} /></button>
        {/if}
      {/if}

      {#if logicOk && one}
        <button class="chip" class:on={!!one.props.lg || insp?.tab === "logic"} onclick={() => openLogic(one.id)} aria-label="Логика" {@attach tip(one.props.lg ? "Логика стрелки" : "Добавить логику", undefined, "top")}>
          <Zap size={15} />{#if one.props.lg}<span class="lbl">{ruleSummary(s, one).replace("⚡", "").trim() || "вкл"}</span>{/if}
        </button>
      {/if}

      <button class="chip" class:on={insp?.tab === "props"} onclick={openProps} aria-label="Настройки" {@attach tip("Все настройки", "I", "top")}><Settings2 size={15} /></button>
      <button class="chip" class:on={insp?.tab === "style"} onclick={openStyle} aria-label="Оформление" {@attach tip("Оформление", undefined, "top")}><Paintbrush size={15} /></button>
      {#if docked || coarse.current}
        <button
          class="chip"
          class:on={ix.multiSelect}
          aria-pressed={ix.multiSelect}
          onclick={() => (ix.multiSelect = !ix.multiSelect)}
          aria-label="Выбирать несколько"
          {@attach tip(ix.multiSelect ? "Касание добавляет или убирает объект" : "Выбирать несколько касаниями", undefined, "top")}
        >
          <SquareMousePointer size={15} />{#if ix.multiSelect}<span class="lbl">{views.length}</span>{/if}
        </button>
      {/if}

      {#if views.length > 1}
        <div class="tb-sep"></div>
        <button class="chip" onclick={alignMenu} aria-label="Выровнять" {@attach tip("Выровнять", undefined, "top")}><AlignStartVertical size={16} /></button>
        <button class="chip" onclick={() => tidy(b, ids)} aria-label="Разложить сеткой" {@attach tip("Разложить сеткой", "G", "top")}><LayoutGrid size={16} /></button>
        {#if !types.has("frame") || views.length > 1}
          <button class="chip" onclick={() => wrapInFrame(b, ids)} aria-label="Обернуть в рамку" {@attach tip("Обернуть в рамку", "Mod+G", "top")}><Frame size={16} /></button>
        {/if}
      {/if}

      <div class="tb-sep"></div>
      <button class="chip" onclick={() => set({ locked: true })} aria-label="Закрепить" {@attach tip("Закрепить", "Mod+L", "top")}><Lock size={15} /></button>
      <button class="chip danger" onclick={() => removeSelected(b)} aria-label="Удалить" {@attach tip("Удалить", "Del", "top")}><Trash size={15} /></button>
    {/if}
    <button class="chip" onclick={more} aria-label="Ещё" {@attach tip("Ещё", undefined, "top")}><Ellipsis size={16} /></button>
  </div>
{/if}

<style>
  .ctx {
    position: fixed;
    left: 0;
    top: 0;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 4px;
    border-radius: var(--r-3);
    max-width: calc(100vw - 16px);
    overflow-x: auto;
    scrollbar-width: none;
    animation: ctx-in 160ms var(--ease-out);
    z-index: 1;
  }
  .ctx.docked {
    left: 50%;
    top: auto;
    bottom: calc(118px + env(safe-area-inset-bottom, 0px));
    translate: -50% 0;
    max-width: calc(100vw - 12px);
    padding: 5px;
    border-radius: var(--r-4);
  }
  @keyframes ctx-in {
    from {
      opacity: 0;
      scale: 0.97;
    }
  }
  .swatch.mixed {
    background: conic-gradient(var(--c-red), var(--c-yellow), var(--c-green), var(--c-blue), var(--c-violet), var(--c-red));
  }
  .aa {
    font-size: 13px;
    font-weight: 620;
    letter-spacing: -0.02em;
  }
  .sub {
    font-size: 10px;
    color: var(--ink-3);
    font-weight: 600;
  }
  .seg {
    display: flex;
    gap: 1px;
  }
  .chip.glyph {
    gap: 2px;
  }
  .lbl {
    font-size: 12.5px;
    font-weight: 560;
    white-space: nowrap;
  }
  .chip.late {
    color: var(--c-red);
  }
  .flag {
    display: inline-flex;
  }
  .chip.emo {
    font-size: 17px;
    line-height: 1;
  }
  .chip :global(svg.lucide-chevron-down) {
    color: var(--ink-3);
    margin-right: -3px;
  }
</style>
