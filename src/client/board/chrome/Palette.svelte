<script lang="ts">
  /* Ctrl+K — команды и поиск по доске; Ctrl+F — сразу поиск объектов. */
  import CodeXml from "@lucide/svelte/icons/code-xml";
  import Copy from "@lucide/svelte/icons/copy";
  import CopyPlus from "@lucide/svelte/icons/copy-plus";
  import Download from "@lucide/svelte/icons/download";
  import Eraser from "@lucide/svelte/icons/eraser";
  import File from "@lucide/svelte/icons/file";
  import Flashlight from "@lucide/svelte/icons/flashlight";
  import Frame from "@lucide/svelte/icons/frame";
  import Globe from "@lucide/svelte/icons/globe";
  import Hand from "@lucide/svelte/icons/hand";
  import House from "@lucide/svelte/icons/house";
  import Image from "@lucide/svelte/icons/image";
  import Boxes from "@lucide/svelte/icons/boxes";
  import LayoutTemplate from "@lucide/svelte/icons/layout-template";
  import Music from "@lucide/svelte/icons/music";
  import SmilePlus from "@lucide/svelte/icons/smile-plus";
  import SquareCheck from "@lucide/svelte/icons/square-check";
  import Table2 from "@lucide/svelte/icons/table-2";
  import Timer from "@lucide/svelte/icons/timer";
  import Vote from "@lucide/svelte/icons/vote";
  import ImagePlus from "@lucide/svelte/icons/image-plus";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import MapIcon from "@lucide/svelte/icons/map";
  import Minus from "@lucide/svelte/icons/minus";
  import Megaphone from "@lucide/svelte/icons/megaphone";
  import Dices from "@lucide/svelte/icons/dices";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Hash from "@lucide/svelte/icons/hash";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import MousePointer2 from "@lucide/svelte/icons/mouse-pointer-2";
  import MoveUpRight from "@lucide/svelte/icons/move-up-right";
  import Package from "@lucide/svelte/icons/package";
  import PenLine from "@lucide/svelte/icons/pen-line";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Play from "@lucide/svelte/icons/play";
  import Redo2 from "@lucide/svelte/icons/redo-2";
  import RotateCcwClock from "@lucide/svelte/icons/rotate-ccw-clock";
  import Scan from "@lucide/svelte/icons/scan";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import Shapes from "@lucide/svelte/icons/shapes";
  import Share2 from "@lucide/svelte/icons/share-2";
  import Spline from "@lucide/svelte/icons/spline";
  import Square from "@lucide/svelte/icons/square";
  import SquareCode from "@lucide/svelte/icons/square-code";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import Trash from "@lucide/svelte/icons/trash";
  import Type from "@lucide/svelte/icons/type";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import WandSparkles from "@lucide/svelte/icons/wand-sparkles";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import ToggleRight from "@lucide/svelte/icons/toggle-right";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Star from "@lucide/svelte/icons/star";
  import CaseSensitive from "@lucide/svelte/icons/case-sensitive";
  import Clock from "@lucide/svelte/icons/clock";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import QrCode from "@lucide/svelte/icons/qr-code";
  import FerrisWheel from "@lucide/svelte/icons/ferris-wheel";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import CalendarCheck from "@lucide/svelte/icons/calendar-check";
  import Sigma from "@lucide/svelte/icons/sigma";
  import Cpu from "@lucide/svelte/icons/cpu";
  import type { Component } from "svelte";
  import { onMount } from "svelte";
  import type { BoardSummary } from "../../../shared/types.ts";
  import { api } from "../../lib/api.ts";
  import { boardUrl, router } from "../../lib/router.svelte.ts";
  import { ACCENTS, BACKDROPS } from "../../lib/look.svelte.ts";
  import { REACTIONS } from "../social.svelte.ts";
  import { threadOf } from "../nodes/comment.ts";
  import { session } from "../../lib/session.svelte.ts";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { download, keyLabel } from "../../lib/util.ts";
  import { useBoard, type Tool } from "../board.svelte.ts";
  import { typeIcon } from "../typeInfo.ts";
  import { addFiles } from "../files.ts";
  import { pickFiles } from "../menus.ts";
  import { FONTS, TYPE_LABELS, type NodeType } from "../model.ts";
  import { duplicate, removeSelected, tidy, wrapInFrame, zoomToFit, zoomToSelection } from "../ops.ts";
  import type { NodeView } from "../store.svelte.ts";
  import { tableText } from "../nodes/table.svelte.ts";
  import { LIB_ITEMS, useLibItem } from "../library.ts";
  import Volume2 from "@lucide/svelte/icons/volume-2";

  type Icon = Component<Record<string, unknown>>;
  interface Cmd {
    id: string;
    label: string;
    icon?: Icon;
    keys?: string;
    words?: string;
    group: string;
    run: () => void;
    when?: () => boolean;
  }
  interface Hit {
    v: NodeView;
    label: string;
    sub: string;
    score: number;
  }

  const b = useBoard();
  const searchOnly = b.ui.search && !b.ui.palette;
  let q = $state("");
  let active = $state(0);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLDivElement>();

  function close() {
    b.ui.palette = false;
    b.ui.search = false;
  }

  const tool = (id: Tool, label: string, icon: Icon, keys: string, words = ""): Cmd => ({
    id: "tool:" + id,
    label,
    icon,
    keys,
    words: "инструмент " + words,
    group: "Инструменты",
    run: () => b.setTool(id),
    when: () => !b.readonly || id === "select" || id === "hand" || id === "laser",
  });
  const st = session.settings;
  const flag = (key: "grid" | "snap" | "glow" | "minimap" | "smartDraw" | "sound", label: string, icon?: Icon): Cmd => ({
    id: "flag:" + key,
    label: `${st[key] ? "Выключить" : "Включить"}: ${label}`,
    icon,
    group: "Вид",
    run: () => (st[key] = !st[key]),
  });
  const ro = () => !b.readonly;
  const hasSel = () => b.view.selection.size > 0 && !b.readonly;

  const commands: Cmd[] = [
    tool("select", "Выделение", MousePointer2, "V", "курсор"),
    tool("hand", "Рука", Hand, "H", "двигать"),
    tool("note", "Заметка", StickyNote, "N", "стикер"),
    tool("text", "Текст", Type, "T", "надпись"),
    tool("code", "Код", SquareCode, "C", "программа сниппет"),
    tool("shape", "Фигура", Square, "R", "прямоугольник круг"),
    tool("draw", "Рисование с распознаванием", Pencil, "D", "карандаш умное"),
    tool("pen", "Перо", PenLine, "P", "рисовать от руки"),
    tool("arrow", "Стрелка", MoveUpRight, "A", "связь"),
    tool("line", "Линия", Minus, "L"),
    tool("frame", "Рамка", Frame, "F", "группа секция"),
    tool("eraser", "Ластик", Eraser, "E", "стереть"),
    tool("laser", "Указка", Flashlight, "K", "лазер показать"),
    {
      id: "upload",
      label: "Загрузить файлы…",
      icon: ImagePlus,
      group: "Создать",
      words: "картинка видео файл",
      when: ro,
      run: async () => {
        const files = await pickFiles();
        if (files.length) await addFiles(b, files, b.camera.center);
      },
    },
    ...LIB_ITEMS.filter((i) => ((i.cat === "basic" || i.cat === "widgets" || i.cat === "games") && !i.ask) || i.cat === "templates").map(
      (i): Cmd => ({
        id: "lib:" + i.id,
        label: i.cat === "templates" ? `Шаблон: ${i.label}` : `Создать: ${i.label.toLowerCase()}`,
        icon: (i.icon as Icon | undefined) ?? LayoutTemplate,
        words: `${i.words ?? ""} ${i.desc ?? ""} создать добавить новый`,
        group: "Создать",
        when: ro,
        run: () => void useLibItem(b, i.id, { animate: !st.reduceMotion }),
      }),
    ),
    { id: "library", label: st.library ? "Скрыть библиотеку" : "Библиотека объектов", icon: Boxes, keys: "B", group: "Вид", words: "панель слева фигуры стикеры шаблоны сервисы", when: ro, run: () => (st.library = !st.library) },
    { id: "fit", label: "Показать всё", icon: Scan, keys: "Shift+1", group: "Вид", run: () => zoomToFit(b) },
    { id: "fitsel", label: "Показать выделенное", icon: ZoomIn, keys: "Shift+2", group: "Вид", when: () => b.view.selection.size > 0, run: () => zoomToSelection(b) },
    { id: "z100", label: "Масштаб 100 %", keys: "Mod+0", group: "Вид", run: () => b.camera.zoomTo(1) },
    flag("minimap", "мини-карта", MapIcon),
    flag("grid", "сетка", LayoutGrid),
    flag("glow", "свечение под группами"),
    flag("snap", "прилипание"),
    flag("smartDraw", "распознавание фигур", WandSparkles),
    flag("sound", "звуки", Volume2),
    ...BACKDROPS.map((d) => ({
      id: "bg:" + d.id,
      label: `Фон доски: ${d.label}`,
      icon: PaletteIcon,
      group: "Вид",
      words: "фон цвет оформление тема",
      when: () => ro() && (b.store.bg || "graphite") !== d.id,
      run: () => b.store.setBg(d.id),
    })),
    ...FONTS.map((f) => ({
      id: "font:" + f.id,
      label: `Шрифт доски: ${f.label}`,
      icon: CaseSensitive,
      group: "Вид",
      words: "шрифт доски текст оформление",
      when: () => ro() && (b.store.font || "sans") !== f.id,
      run: () => b.store.setFont(f.id),
    })),
    ...ACCENTS.map((a) => ({
      id: "accent:" + a.id,
      label: `Акцент: ${a.label}`,
      icon: PaletteIcon,
      group: "Вид",
      words: "акцент цвет оформление тема",
      when: () => st.accent !== a.id,
      run: () => (st.accent = a.id),
    })),
    { id: "undo", label: "Отменить", icon: Undo2, keys: "Mod+Z", group: "Правка", when: () => ro() && b.store.canUndo, run: () => b.store.undo.undo() },
    { id: "redo", label: "Повторить", icon: Redo2, keys: "Mod+Shift+Z", group: "Правка", when: () => ro() && b.store.canRedo, run: () => b.store.undo.redo() },
    { id: "all", label: "Выделить всё", keys: "Mod+A", group: "Правка", run: () => b.view.selection.set(b.view.order.map((v) => v.id)) },
    { id: "dup", label: "Дублировать выделенное", icon: CopyPlus, keys: "Mod+D", group: "Правка", when: hasSel, run: () => duplicate(b, b.store.selection.list) },
    { id: "wrap", label: "Обернуть в рамку", icon: Frame, keys: "Mod+G", group: "Правка", when: hasSel, run: () => wrapInFrame(b, b.store.selection.list) },
    { id: "tidy", label: "Разложить сеткой", icon: LayoutGrid, keys: "G", group: "Правка", when: () => hasSel() && b.view.selection.size > 1, run: () => tidy(b, b.store.selection.list) },
    { id: "del", label: "Удалить выделенное", icon: Trash, keys: "Del", group: "Правка", when: hasSel, run: () => removeSelected(b) },
    { id: "share", label: "Поделиться доской…", icon: Share2, group: "Доска", words: "доступ ссылка пригласить qr", run: () => (b.ui.share = true) },
    { id: "history", label: "История версий", icon: RotateCcwClock, group: "Доска", words: "откат восстановить снимок", run: () => ((b.ui.history = true), (b.ui.chat = false)) },
    { id: "chat", label: b.ui.chat ? "Закрыть чат доски" : "Чат доски", icon: MessageCircle, keys: "M", group: "Общение", words: "сообщения переписка обсуждение", run: () => ((b.ui.chat = !b.ui.chat), b.ui.chat && (b.ui.history = false)) },
    { id: "say", label: "Сообщение у курсора", icon: MessageSquareText, keys: "/", group: "Общение", words: "сказать курсор чат", run: () => b.social.openSay() },
    { id: "summon", label: "Позвать всех ко мне", icon: Megaphone, group: "Общение", words: "собрать участников сюда", run: () => b.social.summon() },
    ...REACTIONS.map((e) => ({ id: "react:" + e, label: `Реакция ${e}`, group: "Общение", words: "реакция эмодзи смайл", run: () => b.social.react(e) })),
    {
      id: "export",
      label: "Скачать файл доски",
      icon: Download,
      group: "Доска",
      words: "экспорт резервная копия",
      run: () => download(`/api/boards/${b.id}/export`, `${(b.store.title || "Без названия").replace(/[\\/:*?"<>|]+/g, "_")}.space`),
    },
    {
      id: "copy",
      label: "Создать копию доски",
      icon: Copy,
      group: "Доска",
      words: "дублировать",
      run: async () => {
        try {
          const c = await api.post<BoardSummary>(`/api/boards/${b.id}/duplicate`, {});
          router.go(boardUrl(c.id));
        } catch (e) {
          toasts.error(e);
        }
      },
    },
    { id: "keys", label: "Горячие клавиши", icon: Keyboard, keys: "?", group: "Доска", run: () => (b.ui.shortcuts = true) },
    { id: "settings", label: "Настройки", icon: Settings, group: "Доска", words: "профиль вход пароль", run: () => (b.ui.settings = true) },
    { id: "home", label: "Мои доски", icon: House, group: "Доска", words: "главная домой", run: () => router.go("/") },
  ];

  /* ------------------------------ поиск ------------------------------ */

  const norm = (t: string) => t.toLowerCase().replace(/ё/g, "е");

  function score(text: string, query: string): number {
    const t = norm(text);
    const i = t.indexOf(query);
    if (i < 0) return 0;
    if (i === 0) return 3;
    return /[\s\-_./(«"]/.test(t[i - 1]!) ? 2 : 1;
  }



  function textOf(v: NodeView): string {
    const p = v.props;
    switch (v.type) {
      case "frame":
      case "shelf":
        return [p.name, ...(p.items ?? []).map((i) => i.name)].filter(Boolean).join(" · ");
      case "link":
        return [p.title, p.site, p.url].filter(Boolean).join(" · ");
      case "file":
      case "image":
      case "video":
        return [p.title, p.name, p.url].filter(Boolean).join(" · ");
      case "code":
        return [p.title, v.textValue].filter(Boolean).join("\n");
      case "table":
        return tableText(v);
      case "poll":
        return [v.textValue, ...(p.opts ?? []).map((o) => o.t)].filter(Boolean).join("\n");
      case "timer":
      case "counter":
      case "progress":
      case "button":
      case "switch":
      case "slider":
      case "rating":
      case "countdown":
      case "tracker":
      case "calc":
      case "gate":
        return p.title ?? "";
      case "clock":
        return [p.title, p.tz].filter(Boolean).join(" · ");
      case "chart":
        return [p.title, ...(p.data ?? []).map((d) => d.l)].filter(Boolean).join(" · ");
      case "qr":
        return [p.title, p.url].filter(Boolean).join(" · ");
      case "wheel":
        return [p.title, ...(p.opts ?? []).map((o) => o.t)].filter(Boolean).join(" · ");
      case "status":
        return [p.title, ...(p.sts ?? []).map((o) => o.t)].filter(Boolean).join(" · ");
      case "dice":
        return "кубики";
      case "comment":
        return threadOf(p).map((m) => `${m.n}: ${m.x}`).join("\n");
      case "audio":
        return [p.title, p.name].filter(Boolean).join(" · ");
      case "sticker":
        return p.emoji ?? "";
      default:
        return v.textValue;
    }
  }

  function snippet(text: string, query: string): string {
    const t = text.replace(/\s+/g, " ").trim();
    const i = norm(t).indexOf(query);
    if (i < 0) return t.slice(0, 90);
    const from = Math.max(0, i - 30);
    return (from ? "…" : "") + t.slice(from, from + 100);
  }

  const query = $derived(norm(q.trim()));

  const cmds = $derived.by(() => {
    if (searchOnly) return [];
    const avail = commands.filter((c) => !c.when || c.when());
    if (!query) return avail.filter((c) => ["fit", "share", "history", "upload", "export", "keys", "minimap", "library"].some((k) => c.id === k || c.id === "flag:" + k));
    return avail
      .map((c) => ({ c, s: Math.max(score(c.label, query) * 2, score(c.words ?? "", query), score(c.group, query) * 0.5) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.c);
  });

  const hits = $derived.by((): Hit[] => {
    if (query.length < (searchOnly ? 1 : 2)) return [];
    const out: Hit[] = [];
    for (const v of b.view.order) {
      const text = textOf(v);
      if (!text) continue;
      const s = score(text, query);
      if (!s) continue;
      const first = text.split("\n").find((l) => l.trim()) ?? "";
      out.push({ v, label: first.slice(0, 80) || TYPE_LABELS[v.type], sub: snippet(text, query), score: s });
      if (out.length > 400) break;
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 30);
  });

  type Row = { kind: "cmd"; c: Cmd } | { kind: "hit"; h: Hit };
  const rows = $derived<Row[]>([...cmds.map((c) => ({ kind: "cmd" as const, c })), ...hits.map((h) => ({ kind: "hit" as const, h }))]);

  $effect(() => {
    void query;
    active = 0;
  });

  function choose(r: Row | undefined) {
    if (!r) return;
    close();
    if (r.kind === "cmd") {
      r.c.run();
      return;
    }
    const v = r.h.v;
    b.view.selection.set([v.id]);
    b.camera.fit(b.view.bounds(v), { maxZoom: 1.5 });
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(rows.length - 1, active + 1);
      scrollActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
      scrollActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    }
    e.stopPropagation();
  }

  function scrollActive() {
    queueMicrotask(() => list?.querySelector(".row.active")?.scrollIntoView({ block: "nearest" }));
  }

  onMount(() => {
    input?.focus();
  });

  function mark(text: string): { a: string; m: string; z: string } {
    const i = norm(text).indexOf(query);
    if (!query || i < 0) return { a: text, m: "", z: "" };
    return { a: text.slice(0, i), m: text.slice(i, i + query.length), z: text.slice(i + query.length) };
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={close}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="palette" role="dialog" aria-modal="true" aria-label={searchOnly ? "Поиск на доске" : "Команды"} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={onkey}>
    <div class="head">
      <Search size={17} />
      <input
        bind:this={input}
        bind:value={q}
        placeholder="Искать…"
        spellcheck="false"
        autocomplete="off"
        aria-label="Запрос"
      />
      <span class="kbd"><span>Esc</span></span>
    </div>
    <div class="list" bind:this={list} role="listbox">
      {#each rows as r, i (r.kind === "cmd" ? r.c.id : r.h.v.id)}
        {#if r.kind === "cmd" && (i === 0 || rows[i - 1]?.kind !== "cmd" || (rows[i - 1] as { c: Cmd }).c.group !== r.c.group) && !query}
          <div class="group">{r.c.group}</div>
        {:else if r.kind === "hit" && (i === 0 || rows[i - 1]?.kind !== "hit")}
          <div class="group">На доске · {hits.length}{hits.length === 30 ? "+" : ""}</div>
        {/if}
        <button class="row" class:active={i === active} role="option" aria-selected={i === active} onmousemove={() => (active = i)} onclick={() => choose(r)}>
          {#if r.kind === "cmd"}
            {@const m = mark(r.c.label)}
            <span class="ic">{#if r.c.icon}<r.c.icon size={16} />{/if}</span>
            <span class="label">{m.a}<b>{m.m}</b>{m.z}</span>
            {#if r.c.keys}
              <span class="kbd">{#each keyLabel(r.c.keys) as k, ki (ki)}<span>{k}</span>{/each}</span>
            {/if}
          {:else}
            {@const TIcon = typeIcon(r.h.v.type)}
            {@const m = mark(r.h.sub)}
            <span class="ic"><TIcon size={16} /></span>
            <span class="text">
              <span class="label">{r.h.label}</span>
              {#if r.h.sub && r.h.sub !== r.h.label}
                <span class="sub">{m.a}<b>{m.m}</b>{m.z}</span>
              {/if}
            </span>
            <span class="type">{TYPE_LABELS[r.h.v.type]}</span>
          {/if}
        </button>
      {:else}
        <div class="empty">{query ? "Ничего не нашлось" : "Начните вводить"}</div>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    background: rgb(0 0 0 / 0.25);
    animation: fade 120ms ease-out;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .palette {
    position: absolute;
    left: 50%;
    top: 12vh;
    transform: translateX(-50%);
    width: min(580px, calc(100vw - 20px));
    max-height: min(480px, 70vh);
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border: 1px solid var(--line-2);
    border-radius: var(--r-4);
    box-shadow: var(--shadow-3);
    overflow: hidden;
    animation: pal-in 160ms var(--ease-out);
    outline: none;
  }
  @keyframes pal-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-6px) scale(0.985);
    }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 52px;
    border-bottom: 1px solid var(--line);
    color: var(--ink-3);
    flex: none;
  }
  .head input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: none;
    border: 0;
    outline: none;
    font-size: 15px;
    color: var(--ink);
  }
  .head input::placeholder {
    color: var(--ink-3);
  }
  .list {
    overflow-y: auto;
    padding: 6px;
    overscroll-behavior: contain;
  }
  .group {
    padding: 10px 10px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-3);
    letter-spacing: 0.02em;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 6px 10px;
    border-radius: var(--r-2);
    text-align: left;
    color: var(--ink);
    font-size: 13.5px;
  }
  .row.active {
    background: var(--hover);
  }
  .row.active .ic {
    color: var(--accent);
  }
  .ic {
    width: 18px;
    display: grid;
    place-items: center;
    color: var(--ink-3);
    flex: none;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  b {
    font-weight: 650;
    color: var(--accent);
  }
  .type {
    font-size: 11.5px;
    color: var(--ink-3);
    flex: none;
  }
  .empty {
    padding: 28px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13.5px;
  }
</style>
