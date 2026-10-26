/* Общение на доске.
   • чат доски — общий Y.Array «chat» в документе: сохраняется вместе с доской,
     не попадает в отмену и в копии доски;
   • сообщение у курсора, реакции и «позвать всех» — через присутствие
     (awareness): мгновенно и без следа в документе. */
import { api } from "../lib/api.ts";
import { nanoid } from "nanoid";
import * as Y from "yjs";
import type { UserRef } from "../../shared/types.ts";
import { session } from "../lib/session.svelte.ts";
import { toasts } from "../lib/toast.svelte.ts";
import type { Board } from "./board.svelte.ts";
import type { Pt, Rect } from "./geometry.ts";

export interface ChatMsg {
  id: string;
  uid: string;
  name: string;
  color: string;
  text: string;
  t: number;
  /** Объекты доски, о которых сообщение (щелчок — показать). */
  refs?: string[];
}

export interface Burst {
  key: number;
  e: string;
  x: number;
  y: number;
  name: string;
  color: string;
}

export const REACTIONS = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "🤔", "😮", "✅", "👀", "🚀", "💯"];

const MAX_MESSAGES = 400;
const SAY_HOLD = 4500;

function validMsg(m: unknown): m is ChatMsg {
  const x = m as ChatMsg;
  return !!x && typeof x.id === "string" && typeof x.text === "string" && typeof x.t === "number" && typeof x.name === "string";
}

let burstSeq = 0;

export class Social {
  /** Сообщения чата доски по порядку. */
  messages = $state.raw<ChatMsg[]>([]);
  /** Непрочитанные (чужие сообщения после последнего прочитанного). */
  unread = $state(0);
  /** Свежее чужое сообщение — короткая подсказка у кнопки чата. */
  incoming = $state<ChatMsg | null>(null);
  /** Моё сообщение у курсора: null — поле закрыто. */
  say = $state<string | null>(null);
  /** Где открыто поле, если указатель не над доской. */
  sayAt = $state<Pt | null>(null);
  /** Летящие реакции (свои и чужие). */
  bursts = $state.raw<Burst[]>([]);
  /** Прикрепить выделенное к следующему сообщению чата. */
  attach = $state(false);

  private readonly arr: Y.Array<ChatMsg>;
  private readonly readKey: string;
  private lastRead: string;
  private reactSeq = 0;
  private summonSeq = 0;
  private lastReact = 0;
  private sayTimer: ReturnType<typeof setTimeout> | undefined;
  private incomingTimer: ReturnType<typeof setTimeout> | undefined;
  /** Последние увиденные номера событий у каждого участника. */
  private readonly seen = new Map<number, { react: number; summon: number }>();

  private readonly b: Board;

  constructor(b: Board) {
    this.b = b;
    this.arr = b.doc.getArray<ChatMsg>("chat");
    this.readKey = `space:chat-read:${b.id}`;
    this.lastRead = localStorage.getItem(this.readKey) ?? "";
    this.sync(false);
    this.arr.observe((e) => this.sync(!e.transaction.local));
  }

  /* ------------------------------ чат доски ------------------------------ */

  private sync(remote: boolean) {
    const list = this.arr.toArray().filter(validMsg);
    const before = this.messages;
    this.messages = list;
    this.recount();
    // свежее чужое сообщение (не первая загрузка истории)
    if (!remote || !this.b.synced || this.b.ui.chat) return;
    const fresh = list.at(-1);
    if (!fresh || fresh.uid === this.b.me.id || before.some((m) => m.id === fresh.id)) return;
    this.incoming = fresh;
    clearTimeout(this.incomingTimer);
    this.incomingTimer = setTimeout(() => (this.incoming = null), 6000);
  }

  recount() {
    if (this.b.ui.chat) return this.markRead();
    const list = this.messages;
    const i = this.lastRead ? list.findIndex((m) => m.id === this.lastRead) : -1;
    const after = i >= 0 ? list.slice(i + 1) : this.lastRead ? [] : list;
    this.unread = after.filter((m) => m.uid !== this.b.me.id).length;
  }

  markRead() {
    const last = this.messages.at(-1);
    this.unread = 0;
    this.incoming = null;
    if (!last || last.id === this.lastRead) return;
    this.lastRead = last.id;
    localStorage.setItem(this.readKey, last.id);
  }

  get canWrite(): boolean {
    return this.b.perms.chat && !this.b.preview;
  }

  send(text: string, refs: string[] = []): boolean {
    const t = text.trim().slice(0, 2000);
    if (!t || !this.canWrite) return false;
    // только чтение (комментатор, замороженная доска) — сообщение пишет сервер
    if (this.b.readonly) {
      api.post(`/api/boards/${this.b.id}/chat`, { text: t, refs: refs.length ? refs.slice(0, 40) : undefined }).catch((e) => toasts.error(e));
      this.markRead();
      return true;
    }
    const me = this.b.me;
    const msg: ChatMsg = { id: nanoid(10), uid: me.id, name: me.name, color: me.color, text: t, t: Date.now() };
    if (refs.length) msg.refs = refs.slice(0, 40);
    this.b.doc.transact(() => {
      this.arr.push([msg]);
      const over = this.arr.length - MAX_MESSAGES;
      if (over > 0) this.arr.delete(0, over);
    }, "chat");
    this.markRead();
    return true;
  }

  remove(id: string) {
    const i = this.arr.toArray().findIndex((m) => m.id === id);
    const m = this.arr.get(i);
    if (i < 0 || !m || m.uid !== this.b.me.id) return;
    this.b.doc.transact(() => this.arr.delete(i, 1), "chat");
  }

  /** Показать объекты, на которые ссылается сообщение. */
  reveal(refs: string[]) {
    const s = this.b.store;
    const ids = refs.filter((id) => s.get(id));
    if (!ids.length) return toasts.show("Этих объектов уже нет на доске");
    this.b.preview = null;
    s.selection.set(ids);
    const r = s.boundsOfIds(ids);
    if (r) this.b.camera.fit(r, { maxZoom: 1.2, animate: !session.settings.reduceMotion });
  }

  /* --------------------------- сообщение у курсора --------------------------- */

  openSay() {
    clearTimeout(this.sayTimer);
    if (this.say !== null) return;
    const ix = this.b.ix;
    this.sayAt = ix.hover ? null : this.b.camera.center;
    if (this.sayAt) this.b.setPresence({ pointer: { x: Math.round(this.sayAt.x), y: Math.round(this.sayAt.y) } });
    this.say = "";
    this.b.setPresence({ say: "" });
  }

  typeSay(text: string) {
    this.say = text.slice(0, 140);
    this.b.setPresence({ say: this.say });
  }

  /** Enter — оставить сообщение видимым ещё немного; Esc — убрать сразу. */
  closeSay(keep: boolean) {
    const text = (this.say ?? "").trim();
    this.say = null;
    clearTimeout(this.sayTimer);
    if (!keep || !text) {
      this.sayAt = null;
      this.b.setPresence({ say: null });
      return;
    }
    this.b.setPresence({ say: text });
    this.sayTimer = setTimeout(() => {
      this.sayAt = null;
      this.b.setPresence({ say: null });
    }, SAY_HOLD);
  }

  /* -------------------------------- реакции -------------------------------- */

  react(e: string, at?: Pt) {
    const now = performance.now();
    if (now - this.lastReact < 120) return;
    this.lastReact = now;
    const p = at ?? this.b.ix.hover ?? this.b.camera.center;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    this.b.setPresence({ react: { e, x, y, id: ++this.reactSeq } }, true);
    this.burst(e, x, y, this.b.me);
  }

  private burst(e: string, x: number, y: number, user: UserRef) {
    const key = ++burstSeq;
    this.bursts = [...this.bursts.slice(-24), { key, e, x, y, name: user.name, color: user.color }];
    setTimeout(() => (this.bursts = this.bursts.filter((b) => b.key !== key)), 2000);
  }

  /* ------------------------------ позвать всех ------------------------------ */

  summon() {
    const v = this.b.camera.view;
    this.b.setPresence({ summon: { id: ++this.summonSeq, view: { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h) } } }, true);
    const n = this.b.people.length;
    toasts.show(n ? `Позвали к себе: ${n}` : "На доске пока никого нет", { kind: n ? "ok" : "info" });
  }

  private summoned(user: UserRef, view: Rect) {
    const go = () => {
      this.b.following = null;
      this.b.preview = null;
      this.b.camera.fit(view, { pad: 0, insetTop: 0, insetBottom: 0, maxZoom: 8, animate: !session.settings.reduceMotion });
    };
    // посреди правки не уводим — предлагаем перейти
    if (this.b.store.editing || this.b.ix.busy) {
      toasts.show(`${user.name} зовёт всех к себе`, { action: { label: "Перейти", run: go }, ms: 8000 });
      return;
    }
    go();
    toasts.show(`${user.name} позвал(а) всех к себе`);
  }

  /* --------------------------- события присутствия --------------------------- */

  /** Вызывается при каждом обновлении присутствия другого участника. */
  peerState(clientId: number, user: UserRef, s: Record<string, unknown>) {
    const react = s.react as { e?: unknown; x?: unknown; y?: unknown; id?: unknown } | undefined;
    const summon = s.summon as { id?: unknown; view?: unknown } | undefined;
    const rid = typeof react?.id === "number" ? react.id : 0;
    const sid = typeof summon?.id === "number" ? summon.id : 0;
    const prev = this.seen.get(clientId);
    if (!prev) {
      // старые события пришедшего участника не повторяем
      this.seen.set(clientId, { react: rid, summon: sid });
      return;
    }
    if (rid && rid !== prev.react) {
      prev.react = rid;
      if (typeof react!.e === "string" && REACTIONS.includes(react!.e) && Number.isFinite(react!.x) && Number.isFinite(react!.y))
        this.burst(react!.e, react!.x as number, react!.y as number, user);
    }
    if (sid && sid !== prev.summon) {
      prev.summon = sid;
      const v = summon!.view as Rect | undefined;
      if (v && [v.x, v.y, v.w, v.h].every(Number.isFinite) && v.w > 0 && v.h > 0) this.summoned(user, v);
    }
  }

  forget(clientId: number) {
    this.seen.delete(clientId);
  }

  destroy() {
    clearTimeout(this.sayTimer);
    clearTimeout(this.incomingTimer);
  }
}
