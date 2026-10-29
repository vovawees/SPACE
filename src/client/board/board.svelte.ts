/* Доска целиком: документ + связь с сервером + камера + инструменты +
   присутствие других людей. Один экземпляр на открытую доску; компоненты
   получают его через контекст (useBoard). */
import { runs } from "./run.svelte.ts";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { getContext, setContext, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { BoardPerms, BoardSummary, Role, UserRef } from "../../shared/types.ts";
import { session } from "../lib/session.svelte.ts";
import { Camera } from "./camera.svelte.ts";
import type { Pt, Rect } from "./geometry.ts";
import type { Color, Dash, Fill, Head, HeadSize, Route, ShapeKind, StrokeSize, TextSize } from "./model.ts";
import type { Interact } from "./interact.svelte.ts";
import { Logic } from "./logic.svelte.ts";
import { Watchdog } from "./net.ts";
import { Social } from "./social.svelte.ts";
import { BoardStore, type NodeView } from "./store.svelte.ts";

export type Tool =
  | "select"
  | "hand"
  | "note"
  | "text"
  | "code"
  | "shape"
  | "draw"
  | "pen"
  | "arrow"
  | "line"
  | "frame"
  | "eraser"
  | "laser";

export interface Peer {
  clientId: number;
  user: UserRef;
  cursor: Pt | null;
  sel: string[];
  view: Rect | null;
  editing: string | null;
  laser: number[];
  stroke: { pts: number[]; color: string; size: StrokeSize } | null;
  /** Сообщение у курсора (пока печатает и ещё несколько секунд). */
  say: string | null;
}

export interface Style {
  /** Имя цвета палитры или свой #rrggbb. */
  color: Color;
  stroke: StrokeSize;
  fill: Fill;
  dash: Dash;
  size: TextSize;
  head0: Head;
  head1: Head;
  /** Маршрут новых стрелок. */
  route: Route;
  /** Размер наконечников новых стрелок. */
  hs: HeadSize;
}

export type Lod = "near" | "mid" | "far";
/** Вкладки панели настроек: свойства объекта, оформление, логика. */
export type InspectTab = "props" | "style" | "logic";
export type Status = "connecting" | "online" | "offline";

const KEY = Symbol("board");

export function useBoard(): Board {
  return getContext<Board>(KEY);
}

export function provideBoard(b: Board) {
  setContext(KEY, b);
}

const STYLE_KEY = "space:style";

/** Пауза между попытками подключения — от полсекунды до 5 с (по умолчанию
    растёт до 30 с). Поля уходят в сокет провайдера. */
const RETRY = { delay: 500, minDelay: 400, maxDelay: 5000, factor: 1.6 };

/** Сколько узлов в зоне отрисовки, при котором DOM уступает место canvas (и обратно). */
const DENSE = 700;
const DENSE_BACK = 480;

function countIn(s: BoardStore, r: Rect, limit: number): number {
  let n = 0;
  for (const v of s.inRect(r)) if (v.type !== "frame" && ++n > limit) break;
  return n;
}

export class Board {
  readonly id: string;
  readonly doc = new Y.Doc();
  readonly store: BoardStore;
  readonly camera = new Camera();
  readonly provider: HocuspocusProvider;
  readonly local: IndexeddbPersistence;

  summary = $state<BoardSummary | null>(null);
  role = $state<Role>("editor");
  /** Права на доске от сервера; без связи — по роли. */
  perms = $state<BoardPerms>({ edit: true, comment: true, chat: true, invite: true, manage: false, restore: true, copy: true });
  status = $state<Status>("connecting");
  /** С какого момента нет связи (null — всё хорошо). */
  downAt = $state<number | null>(Date.now());
  synced = $state(false);
  localReady = $state(false);
  unsynced = $state(0);
  denied = $state<string | null>(null);

  tool = $state<Tool>("select");
  /** Инструмент не сбрасывается после создания объекта (двойной щелчок по кнопке). */
  toolLock = $state(false);
  shapeKind = $state<ShapeKind>("rect");
  style = $state<Style>(loadStyle());
  /** Зажат пробел — временная «рука». */
  spaceDown = $state(false);

  /** Узлы с открытым «живым» содержимым (плеер, страница, звук). Они не
      закрываются при выборе другого объекта, не выгружаются за краем экрана
      и при отдалении — видео и музыка продолжают играть. */
  readonly live = new SvelteSet<string>();

  peers = $state.raw<Peer[]>([]);
  following = $state<number | null>(null);

  /** Открытые панели. */
  ui = $state({
    /** Панель настроек выделенного (справа; на телефоне — лист снизу).
        arrow — какая стрелка открыта во вкладке «Логика». */
    inspect: null as { tab: InspectTab; arrow?: string } | null,
    chat: false,
    palette: false,
    search: false,
    share: false,
    history: false,
    settings: false,
    shortcuts: false,
    viewer: null as string | null,
  });

  /** Сколько места у краёв экрана занимают пристёгнутые панели — чтобы
      панель над выделением и камера не прятали объект под ними. */
  inset = $state({ right: 0, bottom: 0 });

  /** Просмотр снимка из истории: доска только для чтения. */
  preview = $state<{ id: number; createdAt: number; store: BoardStore } | null>(null);

  /** Уровень детализации — с запасом, чтобы не дребезжал на границе.
      near — узлы целиком, mid — упрощённые, far — вся доска одной картинкой
      (canvas). На плотной доске far включается раньше: DOM из тысяч узлов
      не может двигаться плавно. */
  private lodPrev: Lod = "near";
  readonly lod = $derived.by((): Lod => {
    const z = this.camera.z;
    const cur = this.lodPrev;
    let next: Lod =
      cur === "far" ? (z > 0.19 ? (z > 0.46 ? "near" : "mid") : "far")
      : cur === "mid" ? (z < 0.16 ? "far" : z > 0.44 ? "near" : "mid")
      : z < 0.4 ? (z < 0.16 ? "far" : "mid") : "near";
    if (next !== "far" && this.density > (cur === "far" ? DENSE_BACK : DENSE)) next = "far";
    this.lodPrev = next;
    return next;
  });
  /** 1 / масштаб — для «экранных» толщин и подписей (CSS --iz), плавно, без
      ступеней. Ставится только тем узлам и слоям, которым нужна. */
  readonly iz = $derived(1 / this.camera.z);
  private izLast = 1;
  /** То же, но меняется, только когда камера остановилась: для невидимых зон попадания. */
  readonly izIdle = $derived.by(() => {
    if (!this.camera.moving) this.izLast = 1 / this.camera.z;
    return this.izLast;
  });
  /** Узлов в зоне отрисовки (не больше DENSE + 1); пересчёт — только при смене зоны или состава. */
  private readonly density = $derived.by(() => {
    const c = this.camera.cull;
    void this.view.order;
    return untrack(() => countIn(this.view, c, DENSE));
  });
  /** Указатель и жесты; создаётся экраном доски. */
  ix!: Interact;
  readonly = $derived(!this.perms.edit || this.role === "viewer" || !!this.preview);

  private awarenessTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingAwareness: Record<string, unknown> = {};
  /** Чат, реакции, сообщения у курсора. */
  readonly social: Social;
  /** Правила на стрелках: «когда — тогда». */
  readonly logic: Logic;
  /** Перезапуск зависшей связи. */
  private readonly net: Watchdog;
  private closed = false;

  constructor(id: string) {
    this.id = id;
    const me = session.me!;
    this.store = new BoardStore(this.doc, { id: me.id, name: me.name, color: me.color });
    this.social = new Social(this);
    this.logic = new Logic(this);
    this.local = new IndexeddbPersistence(`space:${id}`, this.doc);
    void this.local.whenSynced.then(() => (this.localReady = true));

    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.provider = new HocuspocusProvider({
      url: `${proto}://${location.host}/collab`,
      name: id,
      document: this.doc,
      flushDelay: 25,
      ...RETRY,
      onStatus: ({ status }) => {
        const next: Status = status === "connected" ? "online" : status === "connecting" ? "connecting" : "offline";
        if (next === this.status) return;
        this.status = next;
        if (next === "online") this.downAt = null;
        else this.downAt ??= Date.now();
      },
      onSynced: () => (this.synced = true),
      onAuthenticated: ({ scope }) => {
        if (scope === "readonly") this.perms = { ...this.perms, edit: false };
      },
      onAuthenticationFailed: ({ reason }) => (this.denied = reason),
      onUnsyncedChanges: ({ number }) => (this.unsynced = number),
      onAwarenessChange: () => this.readPeers(),
    });
    this.net = new Watchdog(this.provider, () => this.closed || !!this.denied);

    this.setPresence({
      user: { id: me.id, name: me.name, color: me.color, colorLight: me.color + "33" },
      pointer: null,
      sel: [],
      view: null,
      editing: null,
      laser: [],
      stroke: null,
      say: null,
    }, true);

    $effect.root(() => {
      $effect(() => {
        this.store.readonly = this.readonly;
      });
      $effect(() => {
        localStorage.setItem(STYLE_KEY, JSON.stringify(this.style));
      });
      // выделение и редактирование видят другие
      $effect(() => {
        this.setPresence({ sel: this.store.selection.list });
      });
      $effect(() => {
        this.setPresence({ editing: this.store.editing });
      });
      // открытый чат — всё прочитано
      $effect(() => {
        if (this.ui.chat) untrack(() => this.social.markRead());
      });
      // следование за участником
      $effect(() => {
        const f = this.following;
        if (f === null) return;
        const peer = this.peers.find((p) => p.clientId === f);
        if (!peer) {
          this.following = null;
          return;
        }
        if (peer.view) this.camera.fit(peer.view, { pad: 0, insetTop: 0, insetBottom: 0, maxZoom: 8, animate: false });
      });
    });
  }

  get me(): UserRef {
    return this.store.me;
  }

  /** Что сейчас показано: живая доска или снимок из истории. */
  get view(): BoardStore {
    return this.preview?.store ?? this.store;
  }

  /** Поля присутствия копятся и отправляются не чаще ~30 раз в секунду. */
  setPresence(fields: Record<string, unknown>, now = false) {
    Object.assign(this.pendingAwareness, fields);
    if (now) return this.flushPresence();
    if (this.awarenessTimer) return;
    this.awarenessTimer = setTimeout(() => this.flushPresence(), 33);
  }

  private flushPresence() {
    clearTimeout(this.awarenessTimer);
    this.awarenessTimer = undefined;
    const aw = this.provider.awareness;
    if (!aw) return;
    const cur = aw.getLocalState() ?? {};
    aw.setLocalState({ ...cur, ...this.pendingAwareness });
    this.pendingAwareness = {};
  }

  private readPeers() {
    const aw = this.provider.awareness;
    if (!aw) return;
    const out: Peer[] = [];
    const live = new Set<number>();
    for (const [clientId, s] of aw.getStates()) {
      if (clientId === aw.clientID || !s?.user) continue;
      live.add(clientId);
      this.social.peerState(clientId, s.user as UserRef, s);
      out.push({
        clientId,
        user: s.user as UserRef,
        cursor: validPt(s.pointer),
        sel: (s.sel as string[]) ?? [],
        view: (s.view as Rect | null) ?? null,
        editing: (s.editing as string | null) ?? null,
        laser: (s.laser as number[]) ?? [],
        stroke: (s.stroke as Peer["stroke"]) ?? null,
        say: typeof s.say === "string" ? s.say.slice(0, 140) : null,
      });
    }
    for (const p of this.peers) if (!live.has(p.clientId)) this.social.forget(p.clientId);
    this.peers = out;
  }

  /** Ведущая вкладка — с наименьшим номером клиента среди всех на доске.
      Она одна делает то, что должно случиться ровно один раз (перезапуск
      таймера по кругу, сигнал по времени). */
  get leader(): boolean {
    const me = this.doc.clientID;
    return this.peers.every((p) => p.clientId > me);
  }

  /** Люди без повторов (одно лицо с двух вкладок). */
  get people(): Peer[] {
    const seen = new Map<string, Peer>();
    for (const p of this.peers) if (!seen.has(p.user.id)) seen.set(p.user.id, p);
    return [...seen.values()];
  }

  /** Открыть панель настроек на вкладке (повторно на той же — закрыть). */
  inspect(tab: InspectTab = "props", opts: { arrow?: string; toggle?: boolean } = {}) {
    const cur = this.ui.inspect;
    if (opts.toggle && cur && cur.tab === tab && (!opts.arrow || cur.arrow === opts.arrow)) {
      this.ui.inspect = null;
      return;
    }
    this.ui.inspect = { tab, arrow: opts.arrow };
  }

  setTool(t: Tool, lock = false) {
    this.tool = t;
    this.toolLock = lock;
    if (t !== "select") this.store.editing = null;
  }

  /** После создания объекта — обратно к выделению (если инструмент не закреплён). */
  doneCreating() {
    if (!this.toolLock) this.tool = "select";
  }

  /** «Повторить»: подключиться сейчас, не дожидаясь следующей попытки. */
  reconnect() {
    this.net.now();
  }

  destroy() {
    this.closed = true;
    this.net.destroy();
    clearTimeout(this.awarenessTimer);
    runs.stopAll();
    this.logic.destroy();
    this.social.destroy();
    this.provider.destroy();
    void this.local.destroy();
    this.store.destroy();
    this.preview?.store.destroy();
    this.doc.destroy();
  }
}

/* Поле «pointer», а не «cursor»: cursor в awareness занимает y-codemirror
   (позиция каретки в тексте). */
function validPt(v: unknown): Pt | null {
  const p = v as Pt | null;
  return p && typeof p.x === "number" && typeof p.y === "number" ? p : null;
}

function loadStyle(): Style {
  const d: Style = { color: "default", stroke: "m", fill: "tint", dash: "solid", size: "m", head0: "none", head1: "arrow", route: "curve", hs: "m" };
  try {
    const saved = JSON.parse(localStorage.getItem(STYLE_KEY) || "{}") as Partial<Style>;
    return saved && typeof saved === "object" ? { ...d, ...saved } : d;
  } catch {
    return d;
  }
}
