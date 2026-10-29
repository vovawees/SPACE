/* Состояние доски поверх Yjs.

   Y.Doc — источник истины (синхронизируется с сервером и другими людьми).
   Для отрисовки каждый узел зеркалится в NodeView с реактивными полями
   Svelte: правка одного поля перерисовывает только то, что от него зависит.

   Перетаскивание идёт «переходно»: позиции меняются локально каждый кадр,
   а в документ пишутся пачками ~20 раз в секунду (и финально в конце). */
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import * as Y from "yjs";
import type { UserRef } from "../../shared/types.ts";
import { anchorPoint, buildConnector, resolvePoints, type ConnectorGeo, type ConnectorInput, type EndSpec } from "./connector.ts";
import { aabb, boundsOf, center, containsPt, type Pt, type Rect, union } from "./geometry.ts";
import { isFit, TEXT_TYPES, type Binding, type NodeData, type NodeProps, type NodeType } from "./model.ts";
import { SpatialIndex } from "./spatial.ts";
import { untrack } from "svelte";

/** Происхождение локальных правок: попадают в историю отмены. */
export const LOCAL = Symbol("local");
/** Локальные служебные правки (замеры высоты, превью ссылок): без отмены. */
export const QUIET = Symbol("quiet");
/** Правки, сделанные логикой в ответ на действие человека: отменяются вместе с ним. */
export const LOGIC = Symbol("logic");
/** Логика подтягивает итог после чужой правки: без отмены и без цепочек. */
export const LOGIC_SYNC = Symbol("logic-sync");

const GEO = new Set(["x", "y", "w", "h", "r", "z", "parent", "type", "text"]);

export class NodeView {
  readonly id: string;
  readonly ymap: Y.Map<unknown>;
  #type = $state<NodeType>("note");
  #x = $state(0);
  #y = $state(0);
  #w = $state(100);
  #h = $state(100);
  #r = $state(0);
  z = $state("a0");
  parent = $state<string | undefined>(undefined);
  #props = $state.raw<NodeProps>({});
  /** Меняется при каждой правке текста. */
  textRev = $state(0);
  #mh = $state<number | null>(null);
  /** Габариты могли измениться — хранилище обновит пространственный индекс. */
  onGeo: ((v: NodeView) => void) | null = null;
  /** Место в order (сортировка выборок из индекса). */
  oi = 0;
  text: Y.Text | null = null;
  /** Узел сейчас тащат с этого устройства. */
  transient = false;
  /** Этот клиент последним правил содержимое — он и пишет высоту. */
  ownsHeight = false;
  /** Нереактивные кэши компонентов (готовый HTML и т.п.). */
  cache: Record<string, unknown> = {};

  constructor(id: string, ymap: Y.Map<unknown>) {
    this.id = id;
    this.ymap = ymap;
    this.applyKeys(ymap.keys(), true);
  }

  /* Поля геометрии — через сеттеры: кто бы их ни менял (документ, жест,
     замер высоты), индекс узнает об этом. */
  get type(): NodeType {
    return this.#type;
  }
  set type(t: NodeType) {
    if (t === this.#type) return;
    this.#type = t;
    this.onGeo?.(this);
  }
  get x(): number {
    return this.#x;
  }
  set x(n: number) {
    if (n === this.#x) return;
    this.#x = n;
    this.onGeo?.(this);
  }
  get y(): number {
    return this.#y;
  }
  set y(n: number) {
    if (n === this.#y) return;
    this.#y = n;
    this.onGeo?.(this);
  }
  get w(): number {
    return this.#w;
  }
  set w(n: number) {
    if (n === this.#w) return;
    this.#w = n;
    this.onGeo?.(this);
  }
  get h(): number {
    return this.#h;
  }
  set h(n: number) {
    if (n === this.#h) return;
    this.#h = n;
    this.onGeo?.(this);
  }
  get r(): number {
    return this.#r;
  }
  set r(n: number) {
    if (n === this.#r) return;
    this.#r = n;
    this.onGeo?.(this);
  }
  get props(): NodeProps {
    return this.#props;
  }
  set props(p: NodeProps) {
    if (p === this.#props) return;
    this.#props = p;
    this.onGeo?.(this);
  }
  /** Измеренная высота (для узлов «по содержимому»). */
  get mh(): number | null {
    return this.#mh;
  }
  set mh(n: number | null) {
    if (n === this.#mh) return;
    this.#mh = n;
    this.onGeo?.(this);
  }

  get fit(): boolean {
    return isFit(this.type, this.props);
  }

  /** Высота для геометрии: измеренная, если узел «по содержимому». */
  get H(): number {
    return this.fit && this.mh !== null ? this.mh : this.h;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.H };
  }

  get locked(): boolean {
    return !!this.props.locked;
  }

  get textValue(): string {
    void this.textRev;
    return this.text?.toString() ?? "";
  }

  applyKeys(keys: Iterable<string>, initial = false) {
    let props: NodeProps | null = null;
    for (const key of keys) {
      const v = this.ymap.get(key);
      if (this.transient && !initial && (key === "x" || key === "y" || key === "w" || key === "h" || key === "r")) continue;
      switch (key) {
        case "type":
          this.type = v as NodeType;
          break;
        case "x":
          this.x = num(v, 0);
          break;
        case "y":
          this.y = num(v, 0);
          break;
        case "w":
          this.w = Math.max(1, num(v, 100));
          break;
        case "h":
          this.h = Math.max(1, num(v, 100));
          break;
        case "r":
          this.r = num(v, 0);
          break;
        case "z":
          this.z = typeof v === "string" ? v : "a0";
          break;
        case "parent":
          this.parent = typeof v === "string" ? v : undefined;
          break;
        case "text":
          this.text = v instanceof Y.Text ? v : null;
          this.textRev++;
          break;
        default:
          props ??= { ...this.props };
          if (v === undefined) delete (props as Record<string, unknown>)[key];
          else (props as Record<string, unknown>)[key] = v;
      }
    }
    if (props) this.props = props;
  }

  /** Снимок полей узла (для копирования, истории, буфера обмена). */
  data(): NodeData {
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.ymap) out[k] = v instanceof Y.Text ? v.toString() : v;
    return out as unknown as NodeData;
  }
}

function num(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function sortKey(a: NodeView, b: NodeView): number {
  return a.z < b.z ? -1 : a.z > b.z ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ------------------------------ выделение ------------------------------ */

export class Selection {
  ids = $state.raw<ReadonlySet<string>>(new Set());

  has(id: string) {
    return this.ids.has(id);
  }
  get size() {
    return this.ids.size;
  }
  get list(): string[] {
    return [...this.ids];
  }
  set(ids: Iterable<string>) {
    const next = new Set(ids);
    if (next.size === this.ids.size && [...next].every((i) => this.ids.has(i))) return;
    this.ids = next;
  }
  add(ids: Iterable<string>) {
    this.set([...this.ids, ...ids]);
  }
  toggle(id: string) {
    const next = new Set(this.ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.ids = next;
  }
  remove(ids: Iterable<string>) {
    const drop = new Set(ids);
    this.set([...this.ids].filter((i) => !drop.has(i)));
  }
  clear() {
    if (this.ids.size) this.ids = new Set();
  }
}

/* -------------------------------- доска -------------------------------- */

export class BoardStore {
  readonly doc: Y.Doc;
  readonly nodes: Y.Map<Y.Map<unknown>>;
  readonly meta: Y.Map<unknown>;
  readonly views = new Map<string, NodeView>();
  readonly selection = new Selection();
  readonly undo: Y.UndoManager;
  readonly me: UserRef;

  /** Все узлы по возрастанию z. */
  order = $state.raw<NodeView[]>([]);
  title = $state("");
  /** Фон доски (пресет из look.svelte.ts) — общий для всех участников. */
  bg = $state("");
  canUndo = $state(false);
  canRedo = $state(false);
  readonly = $state(false);
  /** Узел, который сейчас редактируется на этом устройстве. */
  editing = $state<string | null>(null);
  /** Счётчик изменений состава (для подписчиков вроде мини-карты). */
  rev = $state(0);
  /** Меняется, когда стрелки привязываются к узлам или отвязываются от них. */
  bindRev = $state(0);

  private orderDirty = false;
  /** Обратный индекс привязок: id цели → id линий. */
  readonly bindings = new Map<string, Set<string>>();
  /** Где какой узел лежит — для выборок по области без обхода всей доски. */
  private readonly spatial = new SpatialIndex<NodeView>((v) => untrack(() => this.bounds(v)));
  /** Меняется при любом изменении габаритов любого узла: подписчики выборок
      по области (видимые узлы, свечение) пересчитываются по нему. */
  geoRev = $state(0);
  /** Узлы, которые сейчас тащат с этого устройства. */
  readonly transients = new Set<NodeView>();

  private markGeo = (v: NodeView) => {
    this.spatial.mark(v);
    // линии, привязанные к узлу, едут вместе с ним
    const bound = this.bindings.get(v.id);
    if (bound) for (const id of bound) {
      const p = this.views.get(id);
      if (p) this.spatial.mark(p);
    }
    this.geoRev++;
  };

  constructor(doc: Y.Doc, me: UserRef) {
    this.doc = doc;
    this.me = me;
    this.nodes = doc.getMap<Y.Map<unknown>>("nodes");
    this.meta = doc.getMap<unknown>("meta");
    for (const [id, m] of this.nodes) this.addView(id, m);
    this.resort();
    const readMeta = () => {
      this.title = String(this.meta.get("title") ?? "");
      this.bg = String(this.meta.get("bg") ?? "");
    };
    readMeta();
    this.meta.observe(readMeta);
    this.nodes.observeDeep(this.onDeep);

    this.undo = new Y.UndoManager([this.nodes, this.meta], {
      trackedOrigins: new Set([LOCAL, LOGIC]),
      captureTimeout: 500,
    });
    const sync = () => {
      this.canUndo = this.undo.canUndo();
      this.canRedo = this.undo.canRedo();
    };
    this.undo.on("stack-item-added", (e: { stackItem: { meta: Map<string, unknown> } }) => {
      e.stackItem.meta.set("sel", this.selection.list);
      sync();
    });
    this.undo.on("stack-item-popped", (e: { stackItem: { meta: Map<string, unknown> } }) => {
      const sel = e.stackItem.meta.get("sel") as string[] | undefined;
      if (sel) this.selection.set(sel.filter((id) => this.views.has(id)));
      sync();
    });
    this.undo.on("stack-cleared", sync);
  }

  destroy() {
    this.nodes.unobserveDeep(this.onDeep);
    this.undo.destroy();
  }

  /* ------------------------- зеркало документа ------------------------- */

  private addView(id: string, m: Y.Map<unknown>) {
    if (!(m instanceof Y.Map)) return;
    const v = new NodeView(id, m);
    this.views.set(id, v);
    this.indexBindings(v);
    v.onGeo = this.markGeo;
    this.markGeo(v);
    this.orderDirty = true;
  }

  private dropView(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    this.unindexBindings(v);
    this.views.delete(id);
    v.onGeo = null;
    this.spatial.delete(v);
    this.transients.delete(v);
    const bound = this.bindings.get(id);
    if (bound) for (const pid of bound) {
      const p = this.views.get(pid);
      if (p) this.spatial.mark(p);
    }
    this.geoRev++;
    this.orderDirty = true;
  }

  private indexBindings(v: NodeView) {
    if (v.type !== "path") return;
    if (v.props.b0 || v.props.b1) this.bindRev++;
    for (const b of [v.props.b0, v.props.b1]) {
      if (!b) continue;
      let set = this.bindings.get(b.id);
      if (!set) this.bindings.set(b.id, (set = new Set()));
      set.add(v.id);
    }
  }

  private unindexBindings(v: NodeView) {
    let hit = false;
    for (const set of this.bindings.values()) if (set.delete(v.id)) hit = true;
    if (hit) this.bindRev++;
  }

  private onDeep = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const touched = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.target === this.nodes) {
        for (const [key, change] of e.changes.keys) {
          if (change.action === "delete") this.dropView(key);
          else {
            this.dropView(key);
            const m = this.nodes.get(key);
            if (m) this.addView(key, m);
          }
        }
        this.rev++;
        continue;
      }
      const id = e.path[0];
      if (typeof id !== "string") continue;
      const v = this.views.get(id);
      if (!v) continue;
      if (e.target instanceof Y.Text) {
        v.textRev++;
        if (e.transaction.local) v.ownsHeight = true;
        continue;
      }
      if (e.target === v.ymap) {
        let set = touched.get(id);
        if (!set) touched.set(id, (set = new Set()));
        for (const k of e.changes.keys.keys()) set.add(k);
      }
    }
    for (const [id, keys] of touched) {
      const v = this.views.get(id);
      if (!v) continue;
      v.applyKeys(keys);
      if (keys.has("z")) this.orderDirty = true;
      if (v.type === "path" && (keys.has("b0") || keys.has("b1"))) {
        this.unindexBindings(v);
        this.indexBindings(v);
      }
    }
    if (this.orderDirty) this.resort();
  };

  private resort() {
    this.orderDirty = false;
    const order = [...this.views.values()].sort(sortKey);
    for (let i = 0; i < order.length; i++) order[i]!.oi = i;
    this.order = order;
  }

  /* ------------------------------- чтение ------------------------------- */

  get(id: string | undefined | null): NodeView | undefined {
    return id ? this.views.get(id) : undefined;
  }

  selected(): NodeView[] {
    const out: NodeView[] = [];
    for (const id of this.selection.ids) {
      const v = this.views.get(id);
      if (v) out.push(v);
    }
    return out;
  }

  /** Узлы, чьи габариты пересекают r, — в порядке отрисовки. Не подписывается
      на геометрию: реактивным потребителям — читать geoRev и order. */
  inRect(r: Rect): NodeView[] {
    const out = untrack(() => this.spatial.query(r));
    // узел мог исчезнуть, а порядок ещё не пересобран
    return out.filter((v) => this.views.get(v.id) === v).sort((a, b) => a.oi - b.oi);
  }

  /** Габариты из индекса (без подписки на узел). */
  indexedBounds(v: NodeView): Rect {
    return untrack(() => this.spatial.box(v)) ?? untrack(() => this.bounds(v));
  }

  /** Габариты узла в мире (с поворотом; для линий — по реальным точкам). */
  bounds(v: NodeView): Rect {
    if (v.type === "path") return this.connector(v).box;
    return aabb(v.rect, v.r);
  }

  boundsOfIds(ids: Iterable<string>): Rect | null {
    const rects: Rect[] = [];
    for (const id of ids) {
      const v = this.views.get(id);
      if (v) rects.push(this.bounds(v));
    }
    return union(rects);
  }

  allBounds(): Rect | null {
    return union(this.order.map((v) => this.bounds(v)));
  }

  children(frameId: string): NodeView[] {
    return this.order.filter((v) => v.parent === frameId);
  }

  /** Кто в какой рамке лежит напрямую: id рамки → её дети. */
  private kidsMap(): Map<string, NodeView[]> {
    const kids = new Map<string, NodeView[]>();
    for (const v of this.order) {
      if (!v.parent) continue;
      let l = kids.get(v.parent);
      if (!l) kids.set(v.parent, (l = []));
      l.push(v);
    }
    return kids;
  }

  /** Всё содержимое рамки, в том числе во вложенных рамках. */
  descendants(frameId: string, kids: Map<string, NodeView[]> = this.kidsMap()): NodeView[] {
    const out: NodeView[] = [];
    const seen = new Set<string>([frameId]);
    const stack = [frameId];
    while (stack.length) {
      for (const c of kids.get(stack.pop()!) ?? []) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
        if (c.type === "frame") stack.push(c.id);
      }
    }
    return out;
  }

  /** Рамки в порядке отрисовки: внешние снизу, вложенные — над ними (иначе заливка
      большой рамки, нарисованной позже, закрыла бы маленькую). */
  layerFrames(frames: NodeView[]): NodeView[] {
    if (!frames.some((f) => f.parent)) return frames;
    const d = new Map<NodeView, number>();
    for (const f of frames) d.set(f, this.depth(f));
    return frames
      .map((f, i) => ({ f, i }))
      .sort((a, c) => d.get(a.f)! - d.get(c.f)! || a.i - c.i)
      .map((x) => x.f);
  }

  /** Глубина вложенности рамки: 0 — верхняя. */
  depth(v: NodeView): number {
    let d = 0;
    const seen = new Set<string>([v.id]);
    for (let p = v.parent; p && !seen.has(p) && d < 32; d++) {
      seen.add(p);
      const f = this.views.get(p);
      if (!f) break;
      p = f.parent;
    }
    return d;
  }

  /** Рамка для прямоугольника r: обычный узел попадает в рамку центром, рамка — только
      целиком и только в рамку больше себя. Из подходящих — самая тесная (вложенная). */
  containerOf(r: Rect, isFrame: boolean, skip?: ReadonlySet<string>, frames?: readonly NodeView[]): NodeView | undefined {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    let best: NodeView | undefined;
    let bestA = Infinity;
    // кандидаты — рамки, задевающие точку (или прямоугольник рамки)
    const list = frames ?? this.inRect(isFrame ? r : { x: cx, y: cy, w: 0, h: 0 });
    for (const f of list) {
      if (f.type !== "frame" || skip?.has(f.id)) continue;
      const fx = f.x;
      const fy = f.y;
      const fw = f.w;
      const fh = f.H;
      const a = fw * fh;
      if (isFrame) {
        if (a <= r.w * r.h || r.x < fx || r.y < fy || r.x + r.w > fx + fw || r.y + r.h > fy + fh) continue;
      } else if (cx < fx || cy < fy || cx > fx + fw || cy > fy + fh) continue;
      // при равной площади — верхняя
      if (a <= bestA) {
        best = f;
        bestA = a;
      }
    }
    return best;
  }

  /** Опорные точки линии (концы — с учётом привязок к узлам). */
  pathPoints(v: NodeView): Pt[] {
    return this.connector(v).ctrl;
  }

  /** Ломаная, повторяющая нарисованную линию. */
  pathTrack(v: NodeView): Pt[] {
    return this.connector(v).track;
  }

  /** Геометрия линии: маршрут, наконечники, подпись. Пересчитывается, только когда что-то сдвинулось. */
  connector(v: NodeView): ConnectorGeo {
    const p = v.props;
    const n0 = p.b0 ? this.views.get(p.b0.id) : undefined;
    const n1 = p.b1 ? this.views.get(p.b1.id) : undefined;
    const key = [v.x, v.y, p, ...nodeKey(n0), ...nodeKey(n1)];
    const c = v.cache.conn as { key: unknown[]; geo: ConnectorGeo } | undefined;
    if (c && c.key.length === key.length && c.key.every((k, i) => k === key[i])) return c.geo;
    const geo = buildConnector(this.connectorInput(v));
    v.cache.conn = { key, geo };
    return geo;
  }

  private connectorInput(v: NodeView): ConnectorInput {
    const p = v.props;
    const raw = (p.pts ?? []).map(([x, y]) => ({ x: v.x + x!, y: v.y + y! }));
    const rf = p.rf && p.rf.length === 4 ? ([{ x: v.x + p.rf[0]!, y: v.y + p.rf[1]! }, { x: v.x + p.rf[2]!, y: v.y + p.rf[3]! }] as [Pt, Pt]) : null;
    return { raw, e0: this.endSpec(p.b0), e1: this.endSpec(p.b1), props: p, rf };
  }

  private endSpec(b: Binding | null | undefined): EndSpec | null {
    const node = b ? this.views.get(b.id) : undefined;
    return node && b ? { node, bind: b } : null;
  }

  /** Опорные точки для произвольных точек и привязок (предпросмотр, создание). */
  resolve(pts: Pt[], bind0?: Binding | null, bind1?: Binding | null, props: NodeProps = {}): Pt[] {
    if (pts.length < 2) return pts;
    return resolvePoints({ raw: pts, e0: this.endSpec(bind0), e1: this.endSpec(bind1), props, rf: null }).ctrl;
  }

  /** Полная геометрия ещё не созданной линии (предпросмотр). */
  previewConnector(pts: Pt[], bind0: Binding | null, bind1: Binding | null, props: NodeProps): ConnectorGeo {
    return buildConnector({ raw: pts, e0: this.endSpec(bind0), e1: this.endSpec(bind1), props, rf: null });
  }

  /**
   * Поля линии по опорным точкам (мировым): начало координат — левый
   * верхний угол, плюс система отсчёта изломов для привязанных концов.
   */
  pathPatch(pts: Pt[], bind0?: Binding | null, bind1?: Binding | null): Partial<NodeData> {
    const b = boundsOf(pts);
    const out: Partial<NodeData> = {
      x: round(b.x),
      y: round(b.y),
      w: Math.max(1, round(b.w)),
      h: Math.max(1, round(b.h)),
      pts: pts.map((p) => [round(p.x - b.x), round(p.y - b.y)]),
      rf: undefined,
    };
    const e0 = this.endSpec(bind0);
    const e1 = this.endSpec(bind1);
    if (pts.length > 2 && (e0 || e1)) {
      const a0 = e0 ? anchorPoint(e0.node, e0.bind) : pts[0]!;
      const a1 = e1 ? anchorPoint(e1.node, e1.bind) : pts[pts.length - 1]!;
      out.rf = [round(a0.x - b.x), round(a0.y - b.y), round(a1.x - b.x), round(a1.y - b.y)];
    }
    return out;
  }

  /** Записать линию заново по её текущему виду (после переноса узлов и т.п.). */
  pathPatchOf(v: NodeView, bind0: Binding | null | undefined = v.props.b0, bind1: Binding | null | undefined = v.props.b1): Partial<NodeData> {
    return this.pathPatch(this.pathPoints(v), bind0, bind1);
  }

  /** Самый верхний узел под точкой (для привязок и бросания на узел). */
  nodeAt(p: Pt, filter: (v: NodeView) => boolean = () => true, pad = 0): NodeView | undefined {
    const list = this.inRect({ x: p.x - pad, y: p.y - pad, w: pad * 2, h: pad * 2 });
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      if (v.type === "path" || v.type === "ink" || !filter(v)) continue;
      if (containsPt(this.bounds(v), p, pad)) return v;
    }
    return undefined;
  }

  /** Самая тесная рамка под точкой. */
  frameAt(p: Pt, exclude: ReadonlySet<string>): NodeView | undefined {
    return this.containerOf({ x: p.x, y: p.y, w: 0, h: 0 }, false, exclude);
  }

  /* ------------------------------- запись ------------------------------- */

  transact(fn: () => void, origin: unknown = LOCAL) {
    if (this.readonly) return;
    this.doc.transact(fn, origin);
  }

  topZ(): string {
    const last = this.order[this.order.length - 1];
    try {
      return generateKeyBetween(last?.z ?? null, null);
    } catch {
      return generateKeyBetween(null, null);
    }
  }

  create(data: NodeData, origin: unknown = LOCAL): string {
    const id = nanoid(10);
    this.createWithId(id, data, origin);
    return id;
  }

  createWithId(id: string, data: NodeData, origin: unknown = LOCAL) {
    // рамку не указали — новый узел ложится в ту, где оказался (как при перетаскивании)
    if (!data.parent && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      const f = this.containerOf({ x: data.x, y: data.y, w: data.w || 0, h: data.h || 0 }, data.type === "frame");
      if (f) data = { ...data, parent: f.id };
    }
    this.transact(() => {
      const m = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined || v === null || k === "text") continue;
        m.set(k, v);
      }
      if (TEXT_TYPES.has(data.type)) m.set("text", new Y.Text(data.text ?? ""));
      if (!data.z) m.set("z", this.topZ());
      if (!data.createdBy) m.set("createdBy", this.me.id);
      this.nodes.set(id, m);
    }, origin);
    const v = this.views.get(id);
    if (v) v.ownsHeight = true;
  }

  /** Создать несколько узлов одной правкой; z — по порядку поверх всех. */
  createMany(list: NodeData[], ids?: string[]): string[] {
    const out = ids ?? list.map(() => nanoid(10));
    let keys: string[] = [];
    try {
      keys = generateNKeysBetween(this.order[this.order.length - 1]?.z ?? null, null, list.length);
    } catch {
      keys = generateNKeysBetween(null, null, list.length);
    }
    this.transact(() => {
      list.forEach((d, i) => this.createWithId(out[i]!, { ...d, z: keys[i] }));
    });
    return out;
  }

  update(id: string, patch: Partial<NodeData>, origin: unknown = LOCAL) {
    const m = this.nodes.get(id);
    if (!m) return;
    this.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (k === "text") {
          const t = m.get("text");
          if (t instanceof Y.Text && typeof v === "string" && t.toString() !== v) {
            t.delete(0, t.length);
            t.insert(0, v);
          }
          continue;
        }
        if (v === undefined || v === null) {
          if (m.has(k)) m.delete(k);
        } else if (!same(m.get(k), v)) m.set(k, v);
      }
    }, origin);
  }

  updateMany(patches: Map<string, Partial<NodeData>> | [string, Partial<NodeData>][], origin: unknown = LOCAL) {
    this.transact(() => {
      for (const [id, p] of patches) this.update(id, p, origin);
    }, origin);
  }

  /** Удалить узлы (рамки — вместе с содержимым). Линии, привязанные к ним, остаются. */
  remove(ids: Iterable<string>, withChildren = true) {
    const drop = new Set(ids);
    if (withChildren) {
      for (const id of [...drop]) {
        const v = this.views.get(id);
        if (v?.type === "frame") for (const c of this.descendants(id)) drop.add(c.id);
      }
    }
    this.transact(() => {
      // отвязать линии: конец остаётся там, где был
      for (const id of drop) {
        for (const pid of this.bindings.get(id) ?? []) {
          if (drop.has(pid)) continue;
          const p = this.views.get(pid);
          if (!p) continue;
          const patch: Partial<NodeData> = {};
          if (p.props.b0?.id === id) patch.b0 = null;
          if (p.props.b1?.id === id) patch.b1 = null;
          Object.assign(patch, this.pathPatchOf(p, patch.b0 === null ? null : p.props.b0, patch.b1 === null ? null : p.props.b1));
          this.update(pid, patch);
        }
      }
      for (const id of drop) {
        this.nodes.delete(id);
        // рамка удалена без содержимого — дети остаются без родителя
      }
      if (!withChildren) {
        // содержимое переходит в рамку уровнем выше (или остаётся без рамки)
        for (const v of this.order) {
          if (!v.parent || !drop.has(v.parent) || drop.has(v.id)) continue;
          let up = this.views.get(v.parent)?.parent;
          for (let i = 0; up && drop.has(up) && i < 32; i++) up = this.views.get(up)?.parent;
          if (up) this.nodes.get(v.id)?.set("parent", up);
          else this.nodes.get(v.id)?.delete("parent");
        }
      }
    });
    this.selection.remove(drop);
    if (this.editing && drop.has(this.editing)) this.editing = null;
  }

  setTitle(title: string) {
    this.transact(() => this.meta.set("title", title.trim() || "Без названия"));
  }

  setBg(bg: string) {
    if (bg === (this.bg || "graphite")) return;
    this.transact(() => (bg === "graphite" ? this.meta.delete("bg") : this.meta.set("bg", bg)));
  }

  /* ------------------------ переходные правки ------------------------ */

  beginTransient(ids: Iterable<string>) {
    this.undo.stopCapturing();
    this.undo.captureTimeout = 1e9;
    for (const id of ids) {
      const v = this.views.get(id);
      if (!v) continue;
      v.transient = true;
      this.transients.add(v);
    }
  }

  /** Записать текущую геометрию переходных узлов в документ. */
  flushTransient(ids: Iterable<string>, keys: readonly ("x" | "y" | "w" | "h" | "r")[] = ["x", "y"]) {
    this.transact(() => {
      for (const id of ids) {
        const v = this.views.get(id);
        const m = this.nodes.get(id);
        if (!v || !m) continue;
        for (const k of keys) {
          const val = Math.round(v[k] * 100) / 100;
          if (m.get(k) !== val) m.set(k, val);
        }
      }
    });
  }

  endTransient(ids: Iterable<string>, keys: readonly ("x" | "y" | "w" | "h" | "r")[] = ["x", "y"]) {
    const list = [...ids];
    this.flushTransient(list, keys);
    for (const id of list) {
      const v = this.views.get(id);
      if (!v) continue;
      v.transient = false;
      this.transients.delete(v);
      v.applyKeys(["x", "y", "w", "h", "r"]);
    }
    this.undo.captureTimeout = 500;
    this.undo.stopCapturing();
  }

  /* ------------------------------ порядок ------------------------------ */

  /** Поднять/опустить выделенное: на один шаг или до края. */
  reorder(ids: string[], dir: "up" | "down" | "top" | "bottom"): void {
    const set = new Set(ids);
    const order = this.order;
    const moving = order.filter((v) => set.has(v.id));
    if (!moving.length) return;
    const rest = order.filter((v) => !set.has(v.id));
    let before: string | null = null;
    let after: string | null = null;
    if (dir === "top") before = rest[rest.length - 1]?.z ?? null;
    else if (dir === "bottom") after = rest[0]?.z ?? null;
    else {
      // ищем ближайший перекрывающийся узел выше/ниже
      const box = union(moving.map((v) => this.bounds(v)))!;
      const idxTop = order.indexOf(moving[moving.length - 1]!);
      const idxBottom = order.indexOf(moving[0]!);
      if (dir === "up") {
        let target = -1;
        for (let i = idxTop + 1; i < order.length; i++) {
          if (set.has(order[i]!.id)) continue;
          if (overlaps(this.bounds(order[i]!), box)) {
            target = i;
            break;
          }
        }
        if (target < 0) return this.reorder(ids, "top");
        before = order[target]!.z;
        const next = order.slice(target + 1).find((v) => !set.has(v.id));
        after = next?.z ?? null;
      } else {
        let target = -1;
        for (let i = idxBottom - 1; i >= 0; i--) {
          if (set.has(order[i]!.id)) continue;
          if (overlaps(this.bounds(order[i]!), box)) {
            target = i;
            break;
          }
        }
        if (target < 0) return this.reorder(ids, "bottom");
        after = order[target]!.z;
        const prev = order
          .slice(0, target)
          .reverse()
          .find((v) => !set.has(v.id));
        before = prev?.z ?? null;
      }
    }
    let keys: string[];
    try {
      keys = generateNKeysBetween(before, after, moving.length);
    } catch {
      return;
    }
    this.transact(() => moving.forEach((v, i) => this.nodes.get(v.id)?.set("z", keys[i]!)));
  }

  /** Разложить узлы по рамкам: обычный узел — в рамку, куда попал его центр, рамка — в ту,
      что вмещает её целиком; из подходящих — самая тесная. moving — что двигали вместе:
      если рамка узла ехала вместе с ним, он в ней и остаётся (взаимное положение то же). */
  reparent(ids: Iterable<string>, moving?: ReadonlySet<string>) {
    const list = [...ids];
    if (!list.length) return;
    let kids: Map<string, NodeView[]> | null = null;
    this.transact(() => {
      for (const id of list) {
        const v = this.views.get(id);
        if (!v) continue;
        if (v.parent && moving?.has(v.parent) && this.views.get(v.parent)?.type === "frame") continue;
        let skip: Set<string> | undefined;
        if (v.type === "frame") {
          kids ??= this.kidsMap();
          skip = new Set([v.id, ...this.descendants(v.id, kids).map((d) => d.id)]);
        }
        const next = this.containerOf(this.bounds(v), v.type === "frame", skip)?.id;
        if (next !== v.parent) {
          const m = this.nodes.get(id);
          if (next) m?.set("parent", next);
          else m?.delete("parent");
        }
      }
    });
  }

  /** Обновить сохранённые точки линий, привязанных к сдвинутым узлам. */
  reflowPaths(moved: Iterable<string>) {
    const paths = new Set<string>();
    for (const id of moved) for (const p of this.bindings.get(id) ?? []) paths.add(p);
    if (!paths.size) return;
    this.transact(() => {
      for (const pid of paths) {
        const p = this.views.get(pid);
        if (p) this.update(pid, this.pathPatchOf(p));
      }
    });
  }
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* --------------------------- привязки линий --------------------------- */

/** Что из узла-цели влияет на конец линии. */
function nodeKey(n: NodeView | undefined): unknown[] {
  if (!n) return [undefined];
  return [n, n.x, n.y, n.w, n.H, n.r, n.type === "shape" ? n.props.kind : undefined, n.type === "shape" ? n.props.pts : undefined];
}

const round = (n: number) => Math.round(n * 100) / 100;

export { GEO };
