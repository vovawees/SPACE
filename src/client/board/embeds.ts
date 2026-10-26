/* Плееры и редакторы сервисов прямо на доске. Обычные страницы этих сайтов
   запрещают показ во фрейме, а их встраиваемые адреса — разрешают: здесь
   адрес страницы превращается в адрес для iframe. Только по известным
   шаблонам — произвольный ввод в src не попадает. */

export interface Embed {
  src: string;
  site: string;
  /** Ширина карточки при вставке, px. */
  w: number;
  /** Удобная высота плеера, px (иначе — по пропорции ratio). */
  h?: number;
  ratio?: number;
}

const enc = encodeURIComponent;
const ID = /^[\w-]+$/;

export function embedFor(raw: string, parent = typeof location !== "undefined" ? location.hostname : "localhost"): Embed | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const clean = `https://${u.hostname}${u.pathname}`;

  // Spotify: трек, альбом, плейлист, подкаст
  if (host === "open.spotify.com") {
    const p = parts[0]?.startsWith("intl-") ? parts.slice(1) : parts;
    const [kind, id] = p;
    if (kind && id && /^(track|album|playlist|episode|show|artist)$/.test(kind) && ID.test(id))
      return { src: `https://open.spotify.com/embed/${kind}/${id}`, site: "Spotify", w: 400, h: kind === "track" || kind === "episode" ? 152 : 352 };
  }

  // SoundCloud: трек или плейлист
  if (host === "soundcloud.com" && parts.length >= 2 && !["discover", "search", "you", "upload", "pages"].includes(parts[0]!)) {
    const set = parts[1] === "sets";
    return { src: `https://w.soundcloud.com/player/?url=${enc(clean)}&color=%23f08a4b&hide_related=true&show_comments=false&visual=${set}`, site: "SoundCloud", w: 480, h: set ? 400 : 166 };
  }

  // Figma: файл, прототип, доска, презентация
  if (host === "figma.com" && /^(file|design|proto|board|slides|deck)$/.test(parts[0] ?? "") && parts[1] && ID.test(parts[1]))
    return { src: `https://www.figma.com/embed?embed_host=space&url=${enc(u.href)}`, site: "Figma", w: 600, ratio: 4 / 3 };

  // Twitch: канал, запись, клип (parent — наш домен, этого требует Twitch)
  if (host === "clips.twitch.tv" && parts[0] && ID.test(parts[0]))
    return { src: `https://clips.twitch.tv/embed?clip=${parts[0]}&parent=${enc(parent)}&autoplay=false`, site: "Twitch", w: 600, ratio: 16 / 9 };
  if (host === "twitch.tv" && parts[0]) {
    if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? ""))
      return { src: `https://player.twitch.tv/?video=v${parts[1]}&parent=${enc(parent)}&autoplay=false`, site: "Twitch", w: 600, ratio: 16 / 9 };
    if (parts[1] === "clip" && parts[2] && ID.test(parts[2]))
      return { src: `https://clips.twitch.tv/embed?clip=${parts[2]}&parent=${enc(parent)}&autoplay=false`, site: "Twitch", w: 600, ratio: 16 / 9 };
    if (parts.length === 1 && /^\w{3,25}$/.test(parts[0]) && !["directory", "videos", "settings", "subscriptions", "inventory", "wallet", "drops", "search"].includes(parts[0]))
      return { src: `https://player.twitch.tv/?channel=${parts[0]}&parent=${enc(parent)}&autoplay=false`, site: "Twitch", w: 600, ratio: 16 / 9 };
  }

  // CodePen: живой пример (в том числе командный: /team/<имя>/pen/<id>)
  if (host === "codepen.io") {
    const team = parts[0] === "team" && parts[1] && ID.test(parts[1]);
    const [user, kind, id] = team ? [`team/${parts[1]}`, parts[2], parts[3]] : parts;
    if (user && (team || ID.test(user)) && /^(pen|full|details|embed)$/.test(kind ?? "") && id && ID.test(id))
      return { src: `https://codepen.io/${user}/embed/${id}?default-tab=result&theme-id=dark`, site: "CodePen", w: 600, h: 420 };
  }

  // Google: документы, таблицы, презентации, формы, файлы на Диске
  if (host === "docs.google.com") {
    const [kind, d, id] = parts;
    if (d === "d" && id && ID.test(id)) {
      if (kind === "document") return { src: `https://docs.google.com/document/d/${id}/preview`, site: "Google Документы", w: 520, h: 560 };
      if (kind === "spreadsheets") return { src: `https://docs.google.com/spreadsheets/d/${id}/preview`, site: "Google Таблицы", w: 640, h: 460 };
      if (kind === "presentation") return { src: `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`, site: "Google Презентации", w: 600, ratio: 16 / 10 };
    }
    if (kind === "forms" && parts.includes("viewform")) return { src: `${clean}?embedded=true`, site: "Google Формы", w: 520, h: 600 };
  }
  if (host === "drive.google.com" && parts[0] === "file" && parts[1] === "d" && parts[2] && ID.test(parts[2]))
    return { src: `https://drive.google.com/file/d/${parts[2]}/preview`, site: "Google Диск", w: 520, h: 480 };

  // X (Twitter): пост
  if ((host === "x.com" || host === "twitter.com") && parts[1] === "status" && /^\d+$/.test(parts[2] ?? ""))
    return { src: `https://platform.twitter.com/embed/Tweet.html?id=${parts[2]}&theme=dark&dnt=true`, site: "X", w: 440, h: 520 };

  // Loom и Miro
  if (host === "loom.com" && parts[0] === "share" && parts[1] && ID.test(parts[1])) return { src: `https://www.loom.com/embed/${parts[1]}`, site: "Loom", w: 600, ratio: 16 / 9 };
  if (host === "miro.com" && parts[0] === "app" && parts[1] === "board" && parts[2] && /^[\w=-]+$/.test(parts[2]))
    return { src: `https://miro.com/app/live-embed/${parts[2]}/?embedMode=view_only_without_ui`, site: "Miro", w: 600, ratio: 4 / 3 };

  return null;
}

/** Высота плеера при ширине карточки w. */
export function embedHeight(e: Embed, w: number): number {
  return Math.round(e.h ?? (w - 2) / (e.ratio ?? 16 / 9));
}
