/* Сторож связи с сервером.

   Hocuspocus переподключается сам, но этого мало:
   1) попытка подключения без ответа сервера может висеть сколько угодно
      (у попыток нет срока) — тогда «Подключение…» не уходит никогда;
   2) после сна телефона или вкладки сокет бывает «открыт» только на вид —
      сообщения не приходят, а переподключения нет;
   3) пауза между попытками растёт до десятков секунд, а таймеры фоновой
      вкладки и вовсе засыпают.
   Сторож перезапускает зависшие попытки, при возвращении на вкладку
   (и при первом касании) проверяет сокет коротким «эхо» присутствия,
   по событию online и по кнопке «Повторить» подключается сразу. */
import { WebSocketStatus, type HocuspocusProvider, type HocuspocusProviderWebsocket } from "@hocuspocus/provider";

const { Connected, Connecting, Disconnected } = WebSocketStatus;

/** Подключение дольше — начать заново. */
const STUCK = 7_000;
/** Сокет молчит дольше — проверить, жив ли он. */
const QUIET = 20_000;
/** Ответ на проверку должен прийти за это время. */
const PROBE = 5_000;
/** Сокет открылся, но первое сообщение не пришло (терпение растёт). */
const FIRST = 15_000;

export class Watchdog {
  private readonly ws: HocuspocusProviderWebsocket;
  private readonly tick: ReturnType<typeof setInterval>;
  private readonly offs: (() => void)[] = [];
  /** С какого момента текущее состояние сокета. */
  private since = Date.now();
  private probe: { at: number; mark: number } | null = null;
  /** Сколько раз подряд открытый сокет молчал. */
  private mute = 0;
  private poked = 0;
  private readonly provider: HocuspocusProvider;
  /** Подключаться не нужно: доступ закрыт, доска закрыта. */
  private readonly blocked: () => boolean;

  constructor(provider: HocuspocusProvider, blocked: () => boolean) {
    this.provider = provider;
    this.blocked = blocked;
    this.ws = provider.configuration.websocketProvider;
    const onStatus = () => {
      this.since = Date.now();
      if (this.ws.status !== Connected) this.probe = null;
    };
    this.ws.on("status", onStatus);
    this.offs.push(() => this.ws.off("status", onStatus));
    const onMessage = () => (this.mute = 0);
    this.ws.on("message", onMessage);
    this.offs.push(() => this.ws.off("message", onMessage));

    const on = (t: EventTarget, ev: string, fn: () => void) => {
      t.addEventListener(ev, fn, { passive: true });
      this.offs.push(() => t.removeEventListener(ev, fn));
    };
    on(window, "online", () => this.now());
    on(window, "focus", () => this.wake());
    on(window, "pageshow", () => this.wake());
    on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") this.wake();
    });
    // первое касание после паузы — тоже повод проверить (не чаще раза в 4 с)
    const touch = () => {
      const t = Date.now();
      if (t - this.poked < 4000) return;
      this.poked = t;
      this.wake();
    };
    on(window, "pointerdown", touch);
    on(window, "keydown", touch);
    this.tick = setInterval(() => this.check(), 1500);
  }

  /** Подключиться прямо сейчас (online, кнопка «Повторить»). */
  now() {
    if (this.blocked()) return;
    if (this.ws.status === Connected) this.ask();
    else this.restart();
  }

  /** Вернулись на вкладку или коснулись экрана. */
  private wake() {
    if (this.blocked()) return;
    const t = Date.now();
    if (this.ws.status !== Connected) {
      // идущей попытке даём пару секунд, остальное — заново и без ожидания
      if (this.ws.status === Disconnected || t - this.since > 2500) this.restart();
      return;
    }
    const last = this.ws.lastMessageReceived;
    if (!this.probe && last && t - last > QUIET) this.ask();
  }

  private check() {
    if (this.blocked()) return;
    const ws = this.ws;
    const t = Date.now();
    const age = t - this.since;
    if (ws.status === Connecting) {
      if (age > STUCK) this.restart();
      return;
    }
    if (ws.status === Disconnected) {
      // обычно следующая попытка через ≤ 5 с; если её нет — начать самим
      if (age > 9_000) this.restart();
      return;
    }
    // открыт, но ни одного сообщения: рукопожатие застряло по дороге
    if (!ws.lastMessageReceived) {
      if (age > FIRST * (1 + this.mute)) {
        this.mute = Math.min(this.mute + 1, 4);
        this.force();
      }
      return;
    }
    const p = this.probe;
    if (p && t - p.at > PROBE) {
      this.probe = null;
      if (ws.lastMessageReceived <= p.mark) this.force();
    }
  }

  /** Проверка «эхом»: сервер рассылает присутствие всем, и нам тоже. */
  private ask() {
    const aw = this.provider.awareness;
    if (!aw) return;
    this.probe = { at: Date.now(), mark: this.ws.lastMessageReceived };
    aw.setLocalState({ ...(aw.getLocalState() ?? {}) });
  }

  private restart() {
    this.since = Date.now();
    void this.ws.connect();
  }

  /** Сокет мёртв, хоть и «открыт»: закрыть по-своему и подключиться заново. */
  private force() {
    this.probe = null;
    this.ws.onClose({ event: { code: 4408, reason: "stale" } as CloseEvent });
    this.restart();
  }

  destroy() {
    clearInterval(this.tick);
    for (const off of this.offs) off();
  }
}
