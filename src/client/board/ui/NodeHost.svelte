<script lang="ts">
  /* Обёртка узла: положение, размер, поворот, состояния выделения.
     Содержимое рисует компонент своего типа. Узлы «по содержимому»
     сами меряют высоту; в документ её пишет только тот, кто правил. */
  import type { Component } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss, colorKey, type NodeType } from "../model.ts";
  import CodeNode from "../nodes/CodeNode.svelte";
  import FileNode from "../nodes/FileNode.svelte";
  import FrameNode from "../nodes/FrameNode.svelte";
  import ImageNode from "../nodes/ImageNode.svelte";
  import InkNode from "../nodes/InkNode.svelte";
  import LinkNode from "../nodes/LinkNode.svelte";
  import NoteNode from "../nodes/NoteNode.svelte";
  import PathNode from "../nodes/PathNode.svelte";
  import ShapeNode from "../nodes/ShapeNode.svelte";
  import ShelfNode from "../nodes/ShelfNode.svelte";
  import VideoNode from "../nodes/VideoNode.svelte";
  import AudioNode from "../nodes/AudioNode.svelte";
  import PollNode from "../nodes/PollNode.svelte";
  import StickerNode from "../nodes/StickerNode.svelte";
  import TableNode from "../nodes/TableNode.svelte";
  import TaskNode from "../nodes/TaskNode.svelte";
  import TimerNode from "../nodes/TimerNode.svelte";
  import CommentNode from "../nodes/CommentNode.svelte";
  import CounterNode from "../nodes/CounterNode.svelte";
  import DiceNode from "../nodes/DiceNode.svelte";
  import ProgressNode from "../nodes/ProgressNode.svelte";
  import ButtonNode from "../nodes/ButtonNode.svelte";
  import SwitchNode from "../nodes/SwitchNode.svelte";
  import SliderNode from "../nodes/SliderNode.svelte";
  import RatingNode from "../nodes/RatingNode.svelte";
  import ClockNode from "../nodes/ClockNode.svelte";
  import CountdownNode from "../nodes/CountdownNode.svelte";
  import ChartNode from "../nodes/ChartNode.svelte";
  import QrNode from "../nodes/QrNode.svelte";
  import WheelNode from "../nodes/WheelNode.svelte";
  import StatusNode from "../nodes/StatusNode.svelte";
  import TrackerNode from "../nodes/TrackerNode.svelte";
  import CalcNode from "../nodes/CalcNode.svelte";
  import GateNode from "../nodes/GateNode.svelte";
  import StopwatchNode from "../nodes/StopwatchNode.svelte";
  import CoinNode from "../nodes/CoinNode.svelte";
  import FlipcardNode from "../nodes/FlipcardNode.svelte";
  import DeckNode from "../nodes/DeckNode.svelte";
  import RandomNode from "../nodes/RandomNode.svelte";
  import ScoreNode from "../nodes/ScoreNode.svelte";
  import TurnsNode from "../nodes/TurnsNode.svelte";
  import BuzzerNode from "../nodes/BuzzerNode.svelte";
  import ChecklistNode from "../nodes/ChecklistNode.svelte";
  import InputNode from "../nodes/InputNode.svelte";
  import CalendarNode from "../nodes/CalendarNode.svelte";
  import IconNode from "../nodes/IconNode.svelte";
  import TokenNode from "../nodes/TokenNode.svelte";
  import WordsNode from "../nodes/WordsNode.svelte";
  import SpoilerNode from "../nodes/SpoilerNode.svelte";
  import { playFx } from "../nodes/fx.ts";
  import { styleOf } from "../style.ts";
  import { untrack } from "svelte";
  import type { NodeCompProps } from "../nodes/types.ts";
  import { QUIET, type NodeView } from "../store.svelte.ts";
  import { measureHeight } from "./measure.ts";

  let { v, remote }: { v: NodeView; remote?: string } = $props();

  const COMPONENTS: Record<NodeType, Component<NodeCompProps>> = {
    note: NoteNode,
    text: NoteNode,
    code: CodeNode,
    image: ImageNode,
    video: VideoNode,
    file: FileNode,
    shelf: ShelfNode,
    link: LinkNode,
    frame: FrameNode,
    shape: ShapeNode,
    path: PathNode,
    ink: InkNode,
    sticker: StickerNode,
    table: TableNode,
    task: TaskNode,
    poll: PollNode,
    timer: TimerNode,
    audio: AudioNode,
    counter: CounterNode,
    dice: DiceNode,
    progress: ProgressNode,
    comment: CommentNode,
    button: ButtonNode,
    switch: SwitchNode,
    slider: SliderNode,
    rating: RatingNode,
    clock: ClockNode,
    countdown: CountdownNode,
    chart: ChartNode,
    qr: QrNode,
    wheel: WheelNode,
    status: StatusNode,
    tracker: TrackerNode,
    calc: CalcNode,
    gate: GateNode,
    stopwatch: StopwatchNode,
    coin: CoinNode,
    flipcard: FlipcardNode,
    deck: DeckNode,
    random: RandomNode,
    score: ScoreNode,
    turns: TurnsNode,
    buzzer: BuzzerNode,
    checklist: ChecklistNode,
    input: InputNode,
    calendar: CalendarNode,
    icon: IconNode,
    token: TokenNode,
    words: WordsNode,
    spoiler: SpoilerNode,
  };

  const b = useBoard();
  const s = $derived(b.view);
  const sel = $derived(s.selection.has(v.id));
  const editing = $derived(s.editing === v.id);
  const color = $derived(colorKey(v.props.color));
  const dim = $derived(b.ix.erasing.size > 0 && b.ix.erasing.has(v.id));
  const hot = $derived(b.ix.hot === v.id || b.ix.hotFrame === v.id);
  const Comp = $derived(COMPONENTS[v.type] ?? NoteNode);
  const free = $derived(v.type === "path");
  const op = $derived(typeof v.props.opacity === "number" ? Math.max(0.1, Math.min(1, v.props.opacity)) : 1);
  const look = $derived(styleOf(v.props));
  // спрятан логикой: участникам не виден, редакторам — призраком
  const hid = $derived(!!v.props.hid);
  const gone = $derived(hid && b.readonly);
  const tag = $derived(v.props.tag?.trim() ?? "");

  /* разовый эффект от логики — у всех, кто видит доску */
  let el = $state<HTMLElement>();
  let fxSeq = untrack(() => v.props.fxe?.s ?? 0);
  $effect(() => {
    const fx = v.props.fxe;
    if (!fx || fx.s === fxSeq) return;
    fxSeq = fx.s;
    if (el && !gone) playFx(el, fx.k);
  });

  function onHeight(h: number) {
    if (!v.fit || h <= 0) return;
    if (v.mh !== h) v.mh = h;
    if (v.ownsHeight && !b.readonly && Math.abs(v.h - h) > 1) s.update(v.id, { h: Math.round(h) }, QUIET);
  }
</script>

<div
  bind:this={el}
  class="node t-{v.type}{v.props.font ? ` f-${v.props.font}` : ''}{look.cls ? ` ${look.cls}` : ''}"
  class:sel
  class:editing
  class:fit={v.fit}
  class:tinted={color !== "default"}
  class:locked={v.locked}
  class:dim
  class:hot
  class:remote={!!remote}
  class:moving={sel && b.ix.kind === "move"}
  class:hid
  class:gone
  data-id={v.id}
  style={look.vars || null}
  style:transform={free ? null : `translate(${v.x}px,${v.y}px)${v.r ? ` rotate(${v.r}rad)` : ""}`}
  style:width={free ? null : `${v.w}px`}
  style:height={free || v.fit ? null : `${v.h}px`}
  style:--c={colorCss(color)}
  style:--peer={remote}
  style:opacity={op < 1 ? op : null}
  {@attach v.fit ? measureHeight(onHeight) : null}
>
  <Comp {v} {sel} {editing} />
  {#if tag}<span class="node-tag" style:--tagc={v.props.tagc ? colorCss(v.props.tagc) : null}>{tag}</span>{/if}
</div>
