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

/** Происхождение локальных правок: попадают в историю отмены. */
export const LOCAL = Symbol("local");
/** Локальные служебные правки (замеры высоты, превью ссылок): без отмены. */
export const QUIET = Symbol("quiet");

const GEO = new Set(["x", "y", "w", "h", "r", "z", "parent", "type", "text"]);

export class NodeView {
  readonly id: string;
  readonly ymap: Y.Map<unknown>;
  type = $state<NodeType>("note");
  x = $state(0);
  y = $state(0);
  w = $state(100);
  h = $state(100);
  r = $state(0);
  z = $state("a0");
  parent = $state<string | undefined>(undefined);
  props = $state.raw<NodeProps>({});
  /** Меняется при каждой правке текста. */
  textRev = $state(0);
  /** Измеренная высота (для узлов «по содержимому»). */
  mh = $state<number | null>(null);
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

  private orderDirty = false;
  /** Обратный индекс привязок: id цели → id линий. */
  readonly bindings = new Map<string, Set<string>>();

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
      trackedOrigins: new Set([LOCAL]),
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
    this.orderDirty = true;
  }

  private dropView(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    this.unindexBindings(v);
    this.views.delete(id);
    this.orderDirty = true;
  }

  private indexBindings(v: NodeView) {
    if (v.type !== "path") return;
    for (const b of [v.props.b0, v.props.b1]) {
      if (!b) continue;
      let set = this.bindings.get(b.id);
      if (!set) this.bindings.set(b.id, (set = new Set()));
      set.add(v.id);
    }
  }

  private unindexBindings(v: NodeView) {
    for (const set of this.bindings.values()) set.delete(v.id);
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
    this.order = [...this.views.values()].sort(sortKey);
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
    for (let i = this.order.length - 1; i >= 0; i--) {
      const v = this.order[i]!;
      if (v.type === "path" || v.type === "ink" || !filter(v)) continue;
      if (containsPt(this.bounds(v), p, pad)) return v;
    }
    return undefined;
  }

  frameAt(p: Pt, exclude: ReadonlySet<string>): NodeView | undefined {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const v = this.order[i]!;
      if (v.type !== "frame" || exclude.has(v.id)) continue;
      if (containsPt(v.rect, p)) return v;
    }
    return undefined;
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
        if (v?.type === "frame") for (const c of this.children(id)) drop.add(c.id);
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
        for (const v of this.order) if (v.parent && drop.has(v.parent)) this.nodes.get(v.id)?.delete("parent");
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
      if (v) v.transient = true;
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

  /** Привязать узлы к рамкам, в которые попал их центр. */
  reparent(ids: Iterable<string>) {
    const list = [...ids];
    const moving = new Set(list);
    this.transact(() => {
      for (const id of list) {
        const v = this.views.get(id);
        if (!v || v.type === "frame") continue;
        const frame = this.frameAt(center(this.bounds(v)), moving);
        const next = frame?.id;
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
