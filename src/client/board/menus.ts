/* Контекстные меню: по узлу (что можно сделать с выделенным) и по пустому
   месту (что можно здесь создать). Описываются данными для MenuHost. */
import AlignCenterHorizontal from "@lucide/svelte/icons/align-center-horizontal";
import AlignCenterVertical from "@lucide/svelte/icons/align-center-vertical";
import AlignEndHorizontal from "@lucide/svelte/icons/align-end-horizontal";
import AlignEndVertical from "@lucide/svelte/icons/align-end-vertical";
import AlignHorizontalDistributeCenter from "@lucide/svelte/icons/align-horizontal-distribute-center";
import AlignStartHorizontal from "@lucide/svelte/icons/align-start-horizontal";
import AlignStartVertical from "@lucide/svelte/icons/align-start-vertical";
import AlignVerticalDistributeCenter from "@lucide/svelte/icons/align-vertical-distribute-center";
import ArrowDown from "@lucide/svelte/icons/arrow-down";
import Blend from "@lucide/svelte/icons/blend";
import Bold from "@lucide/svelte/icons/bold";
import CaseSensitive from "@lucide/svelte/icons/case-sensitive";
import ArrowDownToLine from "@lucide/svelte/icons/arrow-down-to-line";
import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import ArrowUpToLine from "@lucide/svelte/icons/arrow-up-to-line";
import Circle from "@lucide/svelte/icons/circle";
import ClipboardPaste from "@lucide/svelte/icons/clipboard-paste";
import CodeXml from "@lucide/svelte/icons/code-xml";
import Copy from "@lucide/svelte/icons/copy";
import CopyPlus from "@lucide/svelte/icons/copy-plus";
import Diamond from "@lucide/svelte/icons/diamond";
import Download from "@lucide/svelte/icons/download";
import ExternalLink from "@lucide/svelte/icons/external-link";
import Eye from "@lucide/svelte/icons/eye";
import Focus from "@lucide/svelte/icons/focus";
import Frame from "@lucide/svelte/icons/frame";
import Keyboard from "@lucide/svelte/icons/keyboard";
import PaletteIcon from "@lucide/svelte/icons/palette";
import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import Layers from "@lucide/svelte/icons/layers";
import LayoutGrid from "@lucide/svelte/icons/layout-grid";
import Link2 from "@lucide/svelte/icons/link-2";
import Lock from "@lucide/svelte/icons/lock";
import LockOpen from "@lucide/svelte/icons/lock-open";
import Maximize from "@lucide/svelte/icons/maximize";
import Pencil from "@lucide/svelte/icons/pencil";
import RouteIcon from "@lucide/svelte/icons/route";
import Play from "@lucide/svelte/icons/play";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Scan from "@lucide/svelte/icons/scan";
import Scissors from "@lucide/svelte/icons/scissors";
import Shapes from "@lucide/svelte/icons/shapes";
import Smile from "@lucide/svelte/icons/smile";
import Timer from "@lucide/svelte/icons/timer";
import Spline from "@lucide/svelte/icons/spline";
import Square from "@lucide/svelte/icons/square";
import SquareDashed from "@lucide/svelte/icons/square-dashed";
import StickyNote from "@lucide/svelte/icons/sticky-note";
import TextWrap from "@lucide/svelte/icons/text-wrap";
import Trash from "@lucide/svelte/icons/trash";
import Type from "@lucide/svelte/icons/type";
import Upload from "@lucide/svelte/icons/upload";
import X from "@lucide/svelte/icons/x";
import Ungroup from "@lucide/svelte/icons/ungroup";
import Paintbrush from "@lucide/svelte/icons/paintbrush";
import Settings2 from "@lucide/svelte/icons/settings-2";
import Zap from "@lucide/svelte/icons/zap";
import { canLogic } from "./logic.svelte.ts";
import { TEXT_FX, canTextStyle, copyStyle, copiedStyle, hasStyle, pasteStyle, resetStyle } from "./style.ts";
import { session } from "../lib/session.svelte.ts";
import { BACKDROPS, backdropGlyph } from "../lib/look.svelte.ts";
import { EMOJI_GROUPS } from "./library.ts";
import { addComment, addCommentRemote } from "./nodes/comment.ts";
import { promptText } from "../ui/confirm.svelte.ts";
import { audioItems, counterItems, diceItems, pollItems, progressItems, tableItems, taskItems, timerItems } from "./nodes/actions.ts";
import { widgetItems } from "./nodes/widgetItems.ts";
import { toasts } from "../lib/toast.svelte.ts";
import { copyText, download } from "../lib/util.ts";
import { menu, type MenuEntry, type MenuItem } from "../ui/menu.svelte.ts";
import type { Board } from "./board.svelte.ts";
import { copySelection, pasteFromClipboard } from "./clip.ts";
import { headGlyph, routeOf } from "./connector.ts";
import { addFiles, downloadShelf, fileUrl, takeFromShelf, unfurlInto } from "./files.ts";
import type { Pt } from "./geometry.ts";
import type { Interact } from "./interact.svelte.ts";
import {
  CODE_LANGS,
  COLOR_ITEMS,
  FONTS,
  FONT_GROUPS,
  FONT_TYPES,
  HEADS,
  HEAD_LABELS,
  PREVIEW_LANGS,
  ROUTE_LABELS,
  SHAPE_LABELS,
  SHAPE_KINDS,
  TEXT_TYPES,
  WIDGET_TYPES,
  fontOf,
  type Dash,
  type FontName,
  type Fill,
  type Head,
  type HeadSize,
  type NodeData,
  type Route,
  type ShapeKind,
  type StrokeSize,
  type TextSize,
} from "./model.ts";
import { embedFor } from "./embeds.ts";
import { align, distribute, duplicate, fitFrame, place, removeSelected, tidy, wrapInFrame, zoomToFit, zoomToSelection } from "./ops.ts";
import type { NodeView } from "./store.svelte.ts";

type Entry = MenuEntry | false | null | undefined;
const clean = (list: Entry[]): MenuEntry[] => {
  const out = list.filter(Boolean) as MenuEntry[];
  // без двойных и крайних разделителей
  return out.filter((e, i) => e !== "-" || (i > 0 && i < out.length - 1 && out[i - 1] !== "-"));
};

export function pickFiles(accept = ""): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (accept) input.accept = accept;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

export const SIZES: [StrokeSize, string][] = [
  ["s", "Тонкая"],
  ["m", "Средняя"],
  ["l", "Толстая"],
  ["xl", "Очень толстая"],
];
export const TEXT_SIZES: [TextSize, string][] = [
  ["s", "Мелкий"],
  ["m", "Обычный"],
  ["l", "Крупный"],
  ["xl", "Заголовок"],
];
export const HEAD_SIZES: [HeadSize, string][] = [
  ["s", "Маленькие"],
  ["m", "Обычные"],
  ["l", "Крупные"],
];
export const ROUTES: Route[] = ["straight", "curve", "elbow"];
export const DASHES: [Dash, string][] = [
  ["solid", "Сплошная"],
  ["dash", "Штрихи"],
  ["dot", "Точки"],
];
export const FILLS: [Fill, string][] = [
  ["none", "Без заливки"],
  ["tint", "Полупрозрачная"],
  ["solid", "Сплошная"],
];

export function choice<T extends string>(list: [T, string][], cur: T | undefined, set: (v: T) => void): MenuEntry[] {
  return list.map(([v, label]) => ({ label, checked: cur === v, run: () => set(v) }));
}

/** Выбор наконечника с образцами. */
export function headChoice(cur: Head, start: boolean, set: (h: Head) => void): MenuEntry[] {
  return HEADS.map((h) => ({ label: HEAD_LABELS[h], glyph: headGlyph(h, start), checked: cur === h, run: () => set(h) }));
}

/* ------------------------------ линии ------------------------------ */

/** Сменить маршрут линий. Ломаная хранит одно «колено», остальные — изломы,
    поэтому при переходе между ними изломы сбрасываются. Выбор запоминается
    для новых стрелок. */
export function setRoute(b: Board, ids: string[], route: Route) {
  const s = b.view;
  s.transact(() => {
    for (const id of ids) {
      const v = s.get(id);
      if (!v || v.type !== "path") continue;
      const was = routeOf(v.props);
      const patch: Partial<NodeData> = { route, curve: undefined };
      const ctrl = s.connector(v).ctrl;
      if ((was === "elbow") !== (route === "elbow") && ctrl.length > 2) {
        Object.assign(patch, s.pathPatch([ctrl[0]!, ctrl[ctrl.length - 1]!], v.props.b0, v.props.b1));
      }
      s.update(id, patch);
    }
  });
  b.style.route = route;
}

/** Развернуть линию: концы, наконечники, их форма и подпись меняются местами. */
export function reversePath(b: Board, v: NodeView) {
  const p = v.props;
  const rf = p.rf && p.rf.length === 4 ? [p.rf[2]!, p.rf[3]!, p.rf[0]!, p.rf[1]!] : undefined;
  b.view.update(v.id, {
    pts: [...(p.pts ?? [])].reverse(),
    b0: p.b1 ?? null,
    b1: p.b0 ?? null,
    head0: p.head1 ?? "none",
    head1: p.head0 ?? "none",
    hb0: p.hb1,
    hb1: p.hb0,
    rf,
    lt: p.lt === undefined ? undefined : Math.round((1 - p.lt) * 1000) / 1000,
  });
}

/** Что поставить на конце стрелки, отпущенной в пустоте. */
export type LinkEnd = "same" | (Partial<NodeData> & Pick<NodeData, "type" | "w" | "h">);

export function linkEndMenu(src: NodeView, pick: (d: LinkEnd) => void): MenuEntry[] {
  const shape = (kind: ShapeKind, w: number, h: number): LinkEnd => ({ type: "shape", kind, w, h, fill: "tint", stroke: "m", dash: "solid", align: "center" });
  const same = src.type === "shape" ? "Такая же фигура" : src.type === "text" ? "Такой же текст" : "Такая же заметка";
  return [
    { heading: "Добавить на конце" },
    { label: same, icon: CopyPlus, run: () => pick("same") },
    "-",
    { label: "Заметка", icon: StickyNote, run: () => pick({ type: "note", w: 260, h: 120, fit: true }) },
    { label: "Прямоугольник", icon: Square, run: () => pick(shape("rect", 180, 100)) },
    { label: "Эллипс", icon: Circle, run: () => pick(shape("ellipse", 170, 110)) },
    { label: "Ромб — решение", icon: Diamond, run: () => pick(shape("diamond", 180, 120)) },
    { label: "Текст", icon: Type, run: () => pick({ type: "text", w: 240, h: 40, fit: true, size: "m" }) },
    "-",
    { label: "Оставить просто стрелку", icon: ArrowRight, run: () => {} },
  ];
}

/** Языки кода: частые — сразу, остальные — в подменю «Ещё языки». */
export function langItems(cur: string, pick: (id: string) => void): MenuEntry[] {
  const item = (l: (typeof CODE_LANGS)[number]) => ({ label: l.label, checked: cur === l.id, run: () => pick(l.id) });
  const more = CODE_LANGS.filter((l) => l.more).sort((a, b) => a.label.localeCompare(b.label, "ru"));
  const inMore = more.some((l) => l.id === cur);
  return [...CODE_LANGS.filter((l) => !l.more).map(item), "-", { label: inMore ? `Ещё: ${CODE_LANGS.find((l) => l.id === cur)!.label}` : "Ещё языки", checked: inMore, items: more.map(item) }];
}

const same = <T>(list: T[]): T | undefined => (list.length && list.every((x) => x === list[0]) ? list[0] : undefined);

export function opacityItems(views: NodeView[], set: (p: Partial<NodeData>) => void): MenuEntry[] {
  const cur = same(views.map((v) => Math.round((v.props.opacity ?? 1) * 100)));
  return [100, 80, 60, 40, 20].map((n) => ({ label: n === 100 ? "Непрозрачный" : `${n} %`, checked: cur === n, run: () => set({ opacity: n === 100 ? undefined : n / 100 }) }));
}

/** Шрифты по группам, подписи — образцы своим шрифтом. */
function fontList(cur: string | undefined, pick: (id: FontName) => void, disabled = false): MenuEntry[] {
  return FONT_GROUPS.flatMap((g) => [
    { heading: g },
    ...FONTS.filter((f) => f.group === g).map((f) => ({ label: f.label, font: f.css, fontAdj: f.adj, checked: cur === f.id, disabled, run: () => pick(f.id) })),
  ]);
}

/** Шрифт объектов; board — шрифт доски: без своего шрифта объект берёт его. */
export function fontItems(views: NodeView[], set: (p: Partial<NodeData>) => void, board = ""): MenuEntry[] {
  const bf = board && board !== "sans" ? fontOf(board) : undefined;
  const cur = same(views.filter((v) => FONT_TYPES.has(v.type)).map((v) => v.props.font ?? (bf ? "" : "sans")));
  const list = fontList(cur, (id) => set({ font: id === "sans" && !bf ? undefined : id }));
  return bf ? [{ label: `Как у доски · ${bf.label}`, font: bf.css, fontAdj: bf.adj, checked: cur === "", run: () => set({ font: undefined }) }, "-", ...list] : list;
}

/** Шрифт доски — общий для всех участников, для объектов без своего шрифта. */
export function boardFontItems(b: Board): MenuEntry[] {
  return fontList(b.store.font || "sans", (id) => b.store.setFont(id), b.readonly);
}

/** Начертание текста: жирный, курсив, прописные — переключатели для контекстной панели. */
export function textStyleItems(views: NodeView[], set: (p: Partial<NodeData>) => void): MenuEntry[] {
  const list = views.filter((v) => canTextStyle(v.type));
  if (!list.length) return [];
  const all = (f: (v: NodeView) => boolean) => list.every(f);
  const bold = all((v) => v.props.tw === "bold" || v.props.tw === "heavy");
  const it = all((v) => !!v.props.ti);
  const up = all((v) => v.props.tt === "up");
  const put = set;
  return [
    { label: "Жирный", checked: bold, keys: "Mod+B", run: () => put({ tw: bold ? undefined : "bold" }) },
    { label: "Курсив", checked: it, keys: "Mod+I", run: () => put({ ti: it ? undefined : true }) },
    { label: "ПРОПИСНЫЕ", checked: up, run: () => put({ tt: up ? undefined : "up" }) },
    {
      label: "Эффект текста",
      items: TEXT_FX.map(([x, l]) => ({ label: l, checked: same(list.map((v) => v.props.tfx ?? "")) === x, run: () => put({ tfx: (x || undefined) as NodeData["tfx"] }) })),
    },
  ];
}

export function nodeMenu(b: Board, ix: Interact): MenuEntry[] {
  const s = b.view;
  const views = s.selected();
  const ids = views.map((v) => v.id);
  const ro = b.readonly;
  const one = views.length === 1 ? views[0]! : null;
  const locked = views.length > 0 && views.every((v) => v.locked);
  const set = (patch: Partial<NodeData>) => s.updateMany(ids.map((id) => [id, patch]));
  const colors = new Set(views.map((v) => v.props.color ?? "default"));
  const typed = one ? typeItems(b, ix, one) : [];
  return clean([
    ...typed,
    typed.length > 0 && "-",
    { label: "Копировать", icon: Copy, keys: "Mod+C", run: () => void copySelection(b) },
    !ro && {
      label: "Вырезать",
      icon: Scissors,
      keys: "Mod+X",
      run: async () => {
        await copySelection(b);
        removeSelected(b);
      },
    },
    !ro && { label: "Дублировать", icon: CopyPlus, keys: "Mod+D", run: () => duplicate(b, ids) },
    "-",
    !ro && {
      label: "Цвет",
      custom: "colors",
      colors: COLOR_ITEMS,
      allowCustom: true,
      current: colors.size === 1 ? [...colors][0] : undefined,
      pick: (c: string) => set({ color: c as NodeData["color"] }),
    },
    !ro && views.length > 0 && { label: "Прозрачность", icon: Blend, items: opacityItems(views, set) },
    !ro && views.length > 0 && { label: "Все настройки…", icon: Settings2, keys: "I", run: () => b.inspect("props") },
    !ro && views.length > 0 && { label: "Оформление…", icon: Paintbrush, run: () => b.inspect("style") },
    !ro &&
      views.length > 0 && {
        label: "Стиль",
        icon: Paintbrush,
        items: [
          { label: "Копировать оформление", icon: Copy, keys: "Mod+Alt+C", disabled: !one, run: () => one && copyStyle(one) },
          { label: "Вставить оформление", icon: ClipboardPaste, keys: "Mod+Alt+V", disabled: !copiedStyle(), run: () => pasteStyle(b, ids) },
          { label: "Сбросить оформление", icon: RotateCcw, disabled: !views.some((v) => hasStyle(v.props)), run: () => resetStyle(b, ids) },
        ],
      },
    !ro && one?.type === "path" && canLogic(s, one) && { label: one.props.lg ? "Логика стрелки…" : "Добавить логику…", icon: Zap, run: () => b.inspect("logic", { arrow: one.id }) },
    !ro && views.some((v) => FONT_TYPES.has(v.type)) && { label: "Шрифт", icon: CaseSensitive, items: fontItems(views, set, b.store.font) },
    !ro && views.some((v) => canTextStyle(v.type)) && { label: "Начертание", icon: Bold, items: textStyleItems(views, set) },
    !ro && {
      label: "Порядок",
      icon: Layers,
      items: [
        { label: "На передний план", icon: ArrowUpToLine, keys: "Mod+Shift+]", run: () => s.reorder(ids, "top") },
        { label: "Выше", icon: ArrowUp, keys: "Mod+]", run: () => s.reorder(ids, "up") },
        { label: "Ниже", icon: ArrowDown, keys: "Mod+[", run: () => s.reorder(ids, "down") },
        { label: "На задний план", icon: ArrowDownToLine, keys: "Mod+Shift+[", run: () => s.reorder(ids, "bottom") },
      ],
    },
    !ro &&
      views.length > 1 && {
        label: "Выровнять",
        icon: AlignStartVertical,
        items: [
          { label: "По левому краю", icon: AlignStartVertical, run: () => align(b, ids, "left") },
          { label: "По центру", icon: AlignCenterVertical, run: () => align(b, ids, "hcenter") },
          { label: "По правому краю", icon: AlignEndVertical, run: () => align(b, ids, "right") },
          "-",
          { label: "По верху", icon: AlignStartHorizontal, run: () => align(b, ids, "top") },
          { label: "По середине", icon: AlignCenterHorizontal, run: () => align(b, ids, "vcenter") },
          { label: "По низу", icon: AlignEndHorizontal, run: () => align(b, ids, "bottom") },
          "-",
          { label: "Равные промежутки по горизонтали", icon: AlignHorizontalDistributeCenter, disabled: views.length < 3, run: () => distribute(b, ids, "x") },
          { label: "Равные промежутки по вертикали", icon: AlignVerticalDistributeCenter, disabled: views.length < 3, run: () => distribute(b, ids, "y") },
          "-",
          { label: "Разложить сеткой", icon: LayoutGrid, keys: "G", run: () => tidy(b, ids) },
        ],
      },
    !ro && !(one?.type === "frame") && { label: "Обернуть в рамку", icon: Frame, keys: "Mod+G", run: () => wrapInFrame(b, ids) },
    !ro && {
      label: locked ? "Открепить" : "Закрепить",
      icon: locked ? LockOpen : Lock,
      keys: "Mod+L",
      run: () => set({ locked: locked ? undefined : true }),
    },
    "-",
    !ro && !(one?.type === "comment") && { label: "Комментировать", icon: MessageSquarePlus, run: () => commentOn(b, ids) },
    { label: "Обсудить в чате", icon: MessageCircle, run: () => discuss(b) },
    { label: "Показать крупно", icon: Focus, keys: "Shift+2", run: () => zoomToSelection(b) },
    one && {
      label: "Ссылка на объект",
      icon: Link2,
      run: async () => {
        if (await copyText(`${location.origin}/b/${b.id}?n=${one.id}`)) toasts.show("Ссылка скопирована", { kind: "ok" });
      },
    },
    !ro && "-",
    !ro && { label: "Удалить", icon: Trash, keys: "Del", danger: true, run: () => removeSelected(b) },
  ]);
}

function typeItems(b: Board, ix: Interact, v: NodeView): MenuEntry[] {
  const s = b.view;
  const ro = b.readonly;
  const p = v.props;
  const set = (patch: Partial<NodeData>) => s.update(v.id, patch);
  const out: Entry[] = [];
  if (TEXT_TYPES.has(v.type) && !ro) out.push({ label: v.type === "shape" || v.type === "path" ? "Подпись" : "Редактировать", icon: Pencil, keys: "Enter", run: () => ix.edit(v.id, "end") });
  if (!ro && v.fit === false && ["note", "text", "code", "link", "file", "shelf"].includes(v.type) && p.fit === false)
    out.push({ label: "Высота по содержимому", icon: Maximize, run: () => set({ fit: true }) });
  switch (v.type) {
    case "note":
      if (!ro) out.push({ label: "Превратить в код", icon: CodeXml, run: () => set({ type: "code", lang: "markdown", view: "preview", fit: true } as Partial<NodeData>) });
      break;
    case "text":
      if (!ro) out.push({ label: "Размер", icon: Type, items: choice(TEXT_SIZES, p.size ?? "m", (size) => set({ size })) });
      break;
    case "code": {
      if (!ro)
        out.push({
          label: "Язык",
          icon: CodeXml,
          items: langItems(p.lang ?? "text", (lang) => set({ lang })),
        });
      if (PREVIEW_LANGS.has(p.lang ?? ""))
        out.push({ label: p.view === "preview" ? "Показать код" : "Показать результат", icon: Eye, run: () => set({ view: p.view === "preview" ? "code" : "preview" }) });
      if (!ro) out.push({ label: "Перенос строк", icon: TextWrap, checked: p.wrap !== false, run: () => set({ wrap: p.wrap === false ? undefined : false }) });
      out.push({
        label: "Скопировать код",
        icon: Copy,
        run: async () => (await copyText(v.textValue)) && toasts.show("Код скопирован", { kind: "ok" }),
      });
      out.push({ label: "Скачать файлом", icon: Download, run: () => download(new Blob([v.textValue], { type: "text/plain" }), p.title || `code.${extOf(p.lang)}`) });
      break;
    }
    case "image":
      out.push({ label: "Открыть", icon: Eye, keys: "Enter", run: () => (b.ui.viewer = v.id) });
      if (p.src) out.push({ label: "Скачать", icon: Download, run: () => download(fileUrl(p.src, { dl: true, name: p.name }), p.name || "image") });
      if (!ro && p.natW && p.natH)
        out.push({
          label: "Исходный размер",
          icon: Scan,
          run: () => {
            const c = { x: v.x + v.w / 2, y: v.y + v.h / 2 };
            set({ w: p.natW, h: p.natH, x: Math.round(c.x - p.natW! / 2), y: Math.round(c.y - p.natH! / 2) });
          },
        });
      break;
    case "video":
      if (b.live.has(v.id)) out.push({ label: "Закрыть плеер", icon: X, run: () => ix.deactivate(v.id) });
      else out.push({ label: "Смотреть", icon: Play, keys: "Enter", run: () => ix.activate(v.id) });
      if (p.url) out.push({ label: "Открыть на сайте", icon: ExternalLink, run: () => window.open(p.url, "_blank", "noopener") });
      if (p.src && !p.embed) out.push({ label: "Скачать", icon: Download, run: () => download(fileUrl(p.src, { dl: true, name: p.name }), p.name || "video") });
      break;
    case "file":
      if (p.src) {
        out.push({ label: "Открыть", icon: ExternalLink, run: () => window.open(fileUrl(p.src, { name: p.name }), "_blank", "noopener") });
        out.push({ label: "Скачать", icon: Download, run: () => download(fileUrl(p.src, { dl: true, name: p.name }), p.name || "file") });
      }
      break;
    case "shelf":
      out.push({ label: "Скачать всё архивом", icon: Download, run: () => void downloadShelf(p.name || "Полка", p.items ?? []) });
      if (!ro) {
        out.push({ label: "Переименовать", icon: Pencil, run: () => (ix.renaming = v.id) });
        out.push({
          label: "Разложить на доске",
          icon: Ungroup,
          disabled: !(p.items ?? []).length,
          run: () => {
            const n = (p.items ?? []).length;
            for (let i = n - 1; i >= 0; i--) takeFromShelf(b, v.id, i, { x: v.x + v.w + 40, y: v.y + i * 88 });
          },
        });
      }
      break;
    case "link":
      if (p.url) {
        out.push({ label: "Открыть ссылку", icon: ExternalLink, run: () => window.open(p.url, "_blank", "noopener") });
        if (b.live.has(v.id)) out.push({ label: "Закрыть страницу", icon: X, run: () => ix.deactivate(v.id) });
        else if (p.embeddable !== false || embedFor(p.url)) out.push({ label: embedFor(p.url) ? "Открыть плеер на доске" : "Живой просмотр", icon: Eye, run: () => ix.activate(v.id) });
        out.push({ label: "Скопировать адрес", icon: Copy, run: async () => (await copyText(p.url!)) && toasts.show("Адрес скопирован", { kind: "ok" }) });
        if (!ro) out.push({ label: "Обновить превью", icon: RotateCcw, run: () => void unfurlInto(b, v.id, p.url!, false) });
      }
      break;
    case "frame":
      if (!ro) {
        out.push({ label: "Переименовать", icon: Pencil, keys: "Enter", run: () => (ix.renaming = v.id) });
        out.push({ label: "Подогнать под содержимое", icon: Scan, run: () => fitFrame(b, v.id) });
        out.push({ label: "Убрать рамку, оставить содержимое", icon: Ungroup, run: () => s.remove([v.id], false) });
      }
      out.push({ label: "Показать рамку", icon: Focus, run: () => b.camera.fit(v.rect, { maxZoom: 2 }) });
      break;
    case "shape":
      if (!ro) {
        out.push({
          label: "Форма",
          icon: Shapes,
          items: [...SHAPE_KINDS, ...(p.kind === "poly" ? (["poly"] as ShapeKind[]) : [])].map((k) => ({
            label: SHAPE_LABELS[k],
            checked: (p.kind ?? "rect") === k,
            run: () => set({ kind: k }),
          })),
        });
        out.push({ label: "Заливка", items: choice(FILLS, p.fill ?? "tint", (fill) => set({ fill })) });
        out.push({ label: "Контур", items: [...choice(SIZES, p.stroke ?? "m", (stroke) => set({ stroke })), "-", ...choice(DASHES, p.dash ?? "solid", (dash) => set({ dash }))] });
      }
      break;
    case "path":
      if (!ro) {
        const route = routeOf(p);
        out.push({
          label: "Маршрут",
          icon: route === "curve" ? Spline : RouteIcon,
          items: ROUTES.map((r) => ({ label: ROUTE_LABELS[r], checked: route === r, run: () => setRoute(b, [v.id], r) })),
        });
        out.push({ label: "Начало", glyph: headGlyph(p.head0 ?? "none", true), items: headChoice(p.head0 ?? "none", true, (head0) => set({ head0, hb0: undefined })) });
        out.push({ label: "Конец", glyph: headGlyph(p.head1 ?? "none"), items: headChoice(p.head1 ?? "none", false, (head1) => set({ head1, hb1: undefined })) });
        out.push({
          label: "Размер наконечников",
          items: choice(HEAD_SIZES, p.hs ?? "m", (hs) => {
            set({ hs: hs === "m" ? undefined : hs });
            b.style.hs = hs;
          }),
        });
        if (p.hb0 || p.hb1) out.push({ label: "Сбросить форму наконечников", icon: RotateCcw, run: () => set({ hb0: undefined, hb1: undefined }) });
        out.push({ label: "Линия", items: [...choice(SIZES, p.stroke ?? "m", (stroke) => set({ stroke })), "-", ...choice(DASHES, p.dash ?? "solid", (dash) => set({ dash }))] });
        out.push({ label: "Развернуть", icon: ArrowLeftRight, run: () => reversePath(b, v) });
      }
      break;
    case "ink":
      if (!ro) out.push({ label: "Толщина", items: choice(SIZES, p.stroke ?? "m", (stroke) => set({ stroke })) });
      break;
    case "sticker":
      if (!ro) out.push({ label: "Сменить эмодзи", icon: Smile, keys: "Enter", run: () => stickerMenu(b, [v.id], below(b, v)) });
      break;
    case "task":
      if (!ro) out.push(...taskItems(b, v, below(b, v)));
      break;
    case "table":
      if (!ro) out.push({ label: "Редактировать", icon: Pencil, keys: "Enter", run: () => ix.edit(v.id, "end") });
      out.push(...tableItems(b, v));
      break;
    case "poll":
      out.push(...pollItems(b, v));
      break;
    case "timer":
      if (!ro) {
        out.push({ label: "Длительность", icon: Timer, items: timerItems(b, [v]) });
        out.push({ label: "Переименовать", icon: Pencil, keys: "Enter", run: () => (ix.renaming = v.id) });
      }
      break;
    case "audio":
      out.push(...audioItems(v));
      break;
    case "counter":
      out.push(...counterItems(b, [v], () => (ix.renaming = v.id)));
      break;
    case "dice":
      out.push(...diceItems(b, [v]));
      break;
    case "progress":
      out.push(...progressItems(b, [v], () => (ix.renaming = v.id)));
      break;
    default:
      if (WIDGET_TYPES.has(v.type)) out.push(...widgetItems(b, [v]));
  }
  return clean(out);
}

/** Точка экрана под серединой нижнего края узла (для выпадающих выборов). */
function below(b: Board, v: NodeView): Pt {
  return b.camera.toScreen(v.x + v.w / 2, v.y + v.h);
}

function extOf(lang: string | undefined): string {
  return CODE_LANGS.find((l) => l.id === lang)?.ext[0] ?? "txt";
}

export function canvasMenu(b: Board, ix: Interact, at: Pt): MenuEntry[] {
  const ro = b.readonly;
  const st = session.settings;
  const make = (type: "note" | "text" | "code") => () => {
    const id = place(b, type, type === "text" ? { x: at.x + 154, y: at.y } : at);
    ix.edit(id, "end");
  };
  const toggle = (label: string, key: "grid" | "snap" | "glow" | "minimap"): MenuItem => ({ label, checked: st[key], run: () => (st[key] = !st[key]) });
  return clean([
    !ro && { label: "Вставить", icon: ClipboardPaste, keys: "Mod+V", run: () => void pasteFromClipboard(b, at) },
    !ro && "-",
    !ro && { label: "Заметка", icon: StickyNote, keys: "N", run: make("note") },
    !ro && { label: "Текст", icon: Type, keys: "T", run: make("text") },
    !ro && { label: "Код", icon: CodeXml, keys: "C", run: make("code") },
    !ro && {
      label: "Рамка",
      icon: SquareDashed,
      keys: "F",
      run: () => {
        const id = place(b, "frame", at, { name: "Рамка" });
        b.view.selection.set([id]);
      },
    },
    !ro && { label: "Комментарий", icon: MessageSquarePlus, run: () => addComment(b, at) },
    ro && b.perms.comment && !b.preview && {
      label: "Комментарий…",
      icon: MessageSquarePlus,
      run: async () => {
        const text = await promptText({ title: "Комментарий", ok: "Отправить", input: { placeholder: "Что хотите сказать?", multiline: true } });
        if (text?.trim()) addCommentRemote(b, at, text);
      },
    },
    !ro && {
      label: "Загрузить файлы…",
      icon: Upload,
      run: async () => {
        const files = await pickFiles();
        if (files.length) await addFiles(b, files, at);
      },
    },
    "-",
    { label: "Выделить всё", keys: "Mod+A", run: () => b.view.selection.set(b.view.order.map((v) => v.id)) },
    { label: "Показать всё", icon: Scan, keys: "Shift+1", run: () => zoomToFit(b) },
    { label: "Масштаб 100 %", keys: "Mod+0", run: () => b.camera.zoomTo(1) },
    "-",
    {
      label: "Вид",
      items: [toggle("Сетка", "grid"), toggle("Прилипание", "snap"), toggle("Свечение под группами", "glow"), toggle("Мини-карта", "minimap")],
    },
    { label: "Фон доски", icon: PaletteIcon, items: backdropItems(b) },
    { label: "Шрифт доски", icon: CaseSensitive, items: boardFontItems(b) },
    { label: "Горячие клавиши", icon: Keyboard, keys: "?", run: () => (b.ui.shortcuts = true) },
  ]);
}

/** Булавка комментария у правого верхнего угла выделенного. */
export function commentOn(b: Board, ids: string[]) {
  const r = b.store.boundsOfIds(ids);
  if (r) addComment(b, { x: r.x + r.w - 10, y: r.y + 10 });
}

/** Открыть чат доски с прикреплённым выделением. */
export function discuss(b: Board) {
  b.social.attach = b.store.selection.size > 0;
  b.ui.history = false;
  b.ui.chat = true;
}

/** Фон доски — общий для всех участников. */
export function backdropItems(b: Board): MenuEntry[] {
  return [
    { heading: "Видят все участники" },
    ...BACKDROPS.map((d) => ({
      label: d.label,
      glyph: backdropGlyph(d.id),
      checked: (b.store.bg || "graphite") === d.id,
      disabled: b.readonly,
      run: () => b.store.setBg(d.id),
    })),
  ];
}

/** Выбор эмодзи для стикеров (двойной щелчок по стикеру, меню, панель). */
export function stickerMenu(b: Board, ids: string[], at: { x: number; y: number }) {
  menu.show({ x: at.x, y: at.y, items: stickerItems(b, ids) });
}

export function stickerItems(b: Board, ids: string[]): MenuEntry[] {
  const cur = ids.length === 1 ? b.view.get(ids[0]!)?.props.emoji : undefined;
  const pick = (e: string) => b.view.updateMany(ids.map((id) => [id, { emoji: e }]));
  return EMOJI_GROUPS.flatMap((g) => [{ heading: g.name }, { label: g.name, custom: "emoji" as const, emojis: g.list, current: cur, pick }]);
}
