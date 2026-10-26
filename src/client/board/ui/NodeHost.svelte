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

  function onHeight(h: number) {
    if (!v.fit || h <= 0) return;
    if (v.mh !== h) v.mh = h;
    if (v.ownsHeight && !b.readonly && Math.abs(v.h - h) > 1) s.update(v.id, { h: Math.round(h) }, QUIET);
  }
</script>

<div
  class="node t-{v.type}{v.props.font ? ` f-${v.props.font}` : ''}"
  class:sel
  class:editing
  class:fit={v.fit}
  class:tinted={color !== "default"}
  class:locked={v.locked}
  class:dim
  class:hot
  class:remote={!!remote}
  class:moving={sel && b.ix.kind === "move"}
  data-id={v.id}
  style:transform={free ? null : `translate(${v.x}px,${v.y}px)${v.r ? ` rotate(${v.r}rad)` : ""}`}
  style:width={free ? null : `${v.w}px`}
  style:height={free || v.fit ? null : `${v.h}px`}
  style:--c={colorCss(color)}
  style:--peer={remote}
  style:opacity={op < 1 ? op : null}
  {@attach v.fit ? measureHeight(onHeight) : null}
>
  <Comp {v} {sel} {editing} />
</div>
