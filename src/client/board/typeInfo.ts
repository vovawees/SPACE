/* Значки типов объектов — для панели настроек, палитры и подсказок. */
import type { Component } from "svelte";
import CalendarCheck from "@lucide/svelte/icons/calendar-check";
import ChartColumn from "@lucide/svelte/icons/chart-column";
import CircleDot from "@lucide/svelte/icons/circle-dot";
import Clock from "@lucide/svelte/icons/clock";
import Code from "@lucide/svelte/icons/square-code";
import Cpu from "@lucide/svelte/icons/cpu";
import Dices from "@lucide/svelte/icons/dices";
import FerrisWheel from "@lucide/svelte/icons/ferris-wheel";
import File from "@lucide/svelte/icons/file";
import FrameIcon from "@lucide/svelte/icons/frame";
import Gauge from "@lucide/svelte/icons/gauge";
import Hash from "@lucide/svelte/icons/hash";
import Hourglass from "@lucide/svelte/icons/hourglass";
import Image from "@lucide/svelte/icons/image";
import Link from "@lucide/svelte/icons/link";
import MessageSquare from "@lucide/svelte/icons/message-square";
import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
import MoveUpRight from "@lucide/svelte/icons/move-up-right";
import Music from "@lucide/svelte/icons/music";
import Package from "@lucide/svelte/icons/package";
import PenLine from "@lucide/svelte/icons/pen-line";
import QrCode from "@lucide/svelte/icons/qr-code";
import Shapes from "@lucide/svelte/icons/shapes";
import Sigma from "@lucide/svelte/icons/sigma";
import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
import SmilePlus from "@lucide/svelte/icons/smile-plus";
import SquareCheck from "@lucide/svelte/icons/square-check";
import Star from "@lucide/svelte/icons/star";
import StickyNote from "@lucide/svelte/icons/sticky-note";
import Table2 from "@lucide/svelte/icons/table-2";
import Timer from "@lucide/svelte/icons/timer";
import ToggleRight from "@lucide/svelte/icons/toggle-right";
import Type from "@lucide/svelte/icons/type";
import Video from "@lucide/svelte/icons/video";
import Vote from "@lucide/svelte/icons/vote";
import Watch from "@lucide/svelte/icons/watch";
import Coins from "@lucide/svelte/icons/coins";
import Rotate3d from "@lucide/svelte/icons/rotate-3d";
import Spade from "@lucide/svelte/icons/spade";
import Shuffle from "@lucide/svelte/icons/shuffle";
import Trophy from "@lucide/svelte/icons/trophy";
import ListOrdered from "@lucide/svelte/icons/list-ordered";
import BellRing from "@lucide/svelte/icons/bell-ring";
import ListTodo from "@lucide/svelte/icons/list-todo";
import TextCursorInput from "@lucide/svelte/icons/text-cursor-input";
import CalendarDays from "@lucide/svelte/icons/calendar-days";
import Sparkles from "@lucide/svelte/icons/sparkles";
import ChessPawn from "@lucide/svelte/icons/chess-pawn";
import Cloud from "@lucide/svelte/icons/cloud";
import Gift from "@lucide/svelte/icons/gift";
import type { NodeType } from "./model.ts";

export type Icon = Component<Record<string, unknown>>;

export const TYPE_ICONS: Partial<Record<NodeType, Icon>> = {
  note: StickyNote,
  text: Type,
  code: Code,
  image: Image,
  video: Video,
  file: File,
  shelf: Package,
  link: Link,
  frame: FrameIcon,
  shape: Shapes,
  path: MoveUpRight,
  ink: PenLine,
  sticker: SmilePlus,
  table: Table2,
  task: SquareCheck,
  poll: Vote,
  timer: Timer,
  audio: Music,
  counter: Hash,
  dice: Dices,
  progress: Gauge,
  comment: MessageSquare,
  button: MousePointerClick,
  switch: ToggleRight,
  slider: SlidersHorizontal,
  rating: Star,
  clock: Clock,
  countdown: Hourglass,
  chart: ChartColumn,
  qr: QrCode,
  wheel: FerrisWheel,
  status: CircleDot,
  tracker: CalendarCheck,
  calc: Sigma,
  gate: Cpu,
  stopwatch: Watch,
  coin: Coins,
  flipcard: Rotate3d,
  deck: Spade,
  random: Shuffle,
  score: Trophy,
  turns: ListOrdered,
  buzzer: BellRing,
  checklist: ListTodo,
  input: TextCursorInput,
  calendar: CalendarDays,
  icon: Sparkles,
  token: ChessPawn,
  words: Cloud,
  spoiler: Gift,
};

export const typeIcon = (t: NodeType): Icon => TYPE_ICONS[t] ?? Shapes;
