/* Кто я и мои настройки (настройки — в localStorage этого устройства). */
import type { Me, ServerInfo } from "../../shared/types.ts";
import { api } from "./api.ts";
import { ACCENTS, applyLook, type Accent } from "./look.svelte.ts";

export type WheelMode = "auto" | "zoom" | "pan";
export type GridStyle = "dots" | "lines" | "cross";

export interface Settings {
  accent: Accent;
  wheel: WheelMode;
  grid: boolean;
  gridStyle: GridStyle;
  /** Подписи с именами у чужих курсоров. */
  cursorNames: boolean;
  /** Чужие выделения рамками с именем. */
  peerSelection: boolean;
  glow: boolean;
  snap: boolean;
  smartDraw: boolean;
  minimap: boolean;
  reduceMotion: boolean;
  /** Левая панель «Библиотека»: открыта ли и на каком разделе. */
  library: boolean;
  libCat: "basic" | "widgets" | "shapes" | "stickers" | "templates" | "services";
}

const DEFAULTS: Settings = {
  accent: "orange",
  wheel: "auto",
  grid: true,
  gridStyle: "dots",
  cursorNames: true,
  peerSelection: true,
  glow: true,
  /* направляющие выравнивания — по желанию: Shift+S, магнит внизу слева, Ctrl при перетаскивании — наоборот */
  snap: false,
  smartDraw: true,
  minimap: false,
  reduceMotion: false,
  library: false,
  libCat: "basic",
};

const KEY = "space:settings";

function loadSettings(): Settings {
  try {
    const s: Settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    if (!ACCENTS.some((a) => a.id === s.accent)) s.accent = DEFAULTS.accent;
    delete (s as Partial<Settings> & { theme?: unknown }).theme;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

class Session {
  me = $state<Me | null>(null);
  info = $state<ServerInfo | null>(null);
  ready = $state(false);
  settings = $state<Settings>(loadSettings());

  constructor() {
    $effect.root(() => {
      $effect(() => {
        localStorage.setItem(KEY, JSON.stringify(this.settings));
      });
      $effect(() => applyLook("accent", this.settings.accent));
      $effect(() => {
        document.documentElement.toggleAttribute("data-reduce-motion", this.settings.reduceMotion);
      });
    });
  }

  async load() {
    try {
      const [me, info] = await Promise.all([api.get<Me | null>("/api/me"), api.get<ServerInfo>("/api/info")]);
      this.me = me;
      this.info = info;
    } finally {
      this.ready = true;
    }
  }

  async logout() {
    await api.post("/api/auth/logout");
    this.me = null;
  }
}

export const session = new Session();
