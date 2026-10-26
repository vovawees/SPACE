/* Значки сервисов для библиотеки и карточек ссылок: упрощённые,
   узнаваемые силуэты (свои рисунки, кроме знака GitHub — CC0, Simple Icons). */

const svg = (body: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const B: Record<string, string> = {
  github:
    '<path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/>',
  youtube: '<rect x="1.5" y="4.5" width="21" height="15" rx="4.5" fill="#ff0033"/><path d="M10 8.6v6.8l5.8-3.4z" fill="#fff"/>',
  figma:
    '<rect x="6" y="1.5" width="6" height="7" rx="3" fill="#f24e1e"/><rect x="12" y="1.5" width="6" height="7" rx="3" fill="#ff7262"/><rect x="6" y="8.5" width="6" height="7" rx="3" fill="#a259ff"/><circle cx="15" cy="12" r="3.2" fill="#1abcfe"/><rect x="6" y="15.5" width="6" height="7" rx="3" fill="#0acf83"/>',
  gdocs:
    '<path d="M6 1.5h8l5 5v14.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 21V3a1.5 1.5 0 0 1 1-1.5z" fill="#4285f4"/><path d="M14 1.5v5h5z" fill="#a1c2fa"/><path d="M8 11h8M8 14h8M8 17h5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
  spotify:
    '<circle cx="12" cy="12" r="10.5" fill="#1ed760"/><path d="M6.5 9.3c3.8-1.1 8-.8 11.2 1M7.2 12.6c3-.8 6.4-.5 9 1M7.8 15.7c2.4-.6 5-.4 7 .8" stroke="#0b2b16" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
  wikipedia:
    '<circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="12" y="16.3" text-anchor="middle" font-family="Georgia, serif" font-size="12.5" font-weight="700" fill="currentColor">W</text>',
  npm: '<rect x="1.5" y="6.5" width="21" height="11" rx="1.5" fill="#cb3837"/><text x="12" y="15.2" text-anchor="middle" font-family="Inter, sans-serif" font-size="7.6" font-weight="800" fill="#fff">npm</text>',
  steam:
    '<circle cx="12" cy="12" r="10.5" fill="#1b2838"/><circle cx="15.2" cy="9" r="3.1" fill="none" stroke="#c7d5e0" stroke-width="1.6"/><circle cx="8.4" cy="15.4" r="2.3" fill="#c7d5e0"/><path d="M9.8 14.4l3.4-3.1" stroke="#c7d5e0" stroke-width="1.6"/>',
  twitch: '<path d="M4.5 2.5h16v10.5l-4.5 4.5h-3.7l-2.8 2.8H7v-2.8H4.5z" fill="#9146ff"/><path d="M11 7v4.5M15.5 7v4.5" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
  x: '<rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor"/><path d="M7 6.5l10 11M17 6.5l-10 11" stroke="var(--bg, #111)" stroke-width="1.9" stroke-linecap="round"/>',
  vk: '<rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#0077ff"/><text x="12" y="15.6" text-anchor="middle" font-family="Inter, sans-serif" font-size="8.6" font-weight="800" fill="#fff">VK</text>',
  codepen:
    '<path d="M12 2.5l9 6v7l-9 6-9-6v-7z M3 8.5l9 6 9-6 M12 2.5v6 M12 14.5v7 M3 15.5l9-6 9 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  soundcloud:
    '<path d="M9 17.5h10.5a3.6 3.6 0 0 0 0-7.2 5.5 5.5 0 0 0-10.5-1.5z" fill="#ff5500"/><path d="M3 13.5v4M5 11.5v6M7 10v7.5" stroke="#ff5500" stroke-width="1.6" stroke-linecap="round"/>',
  vimeo: '<rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#1ab7ea"/><path d="M6 9.5c1.6-1.3 2.8-2.2 3.4.2l1.3 5c.4 1.3.8 1.3 1.6.1 1.6-2.4 2.7-4.4 1-4.6 1.2-3.5 6.2-3.4 4.4.5-1.3 2.7-4.8 7.4-6.7 7.4-1.5 0-2-2.4-2.6-4.6-.5-1.8-.8-2.9-1.9-2.2z" fill="#fff"/>',
  gitlab: '<path d="M12 21.5l4-12.2H8z" fill="#e24329"/><path d="M12 21.5L8 9.3H2.4z M12 21.5l4-12.2h5.6z" fill="#fc6d26"/><path d="M2.4 9.3l-1 3.1c-.1.3 0 .6.3.8L12 21.5z M21.6 9.3l1 3.1c.1.3 0 .6-.3.8L12 21.5z" fill="#fca326"/><path d="M2.4 9.3h5.6L5.6 2a.4.4 0 0 0-.8 0z M21.6 9.3H16L18.4 2a.4.4 0 0 1 .8 0z" fill="#e24329"/>',
  link: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5S9.4 5.2 12 2.5z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
};

export type Brand = keyof typeof B;

export function brandSvg(name: string, size = 20): string {
  return svg(B[name] ?? B.link!, size);
}

/** Сервис по адресу — для значка на карточке. */
export function brandOf(url: string): string | null {
  let h = "";
  try {
    h = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (h === "github.com" || h === "gist.github.com" || h.endsWith(".github.io")) return "github";
  if (h === "youtube.com" || h === "youtu.be" || h === "m.youtube.com" || h === "music.youtube.com") return "youtube";
  if (h.endsWith("figma.com")) return "figma";
  if (h === "docs.google.com" || h === "drive.google.com") return "gdocs";
  if (h === "open.spotify.com") return "spotify";
  if (h.endsWith("wikipedia.org")) return "wikipedia";
  if (h === "npmjs.com" || h === "npmjs.org") return "npm";
  if (h === "store.steampowered.com" || h === "steamcommunity.com") return "steam";
  if (h.endsWith("twitch.tv")) return "twitch";
  if (h === "x.com" || h === "twitter.com") return "x";
  if (h === "vk.com" || h === "vkvideo.ru" || h === "vk.ru") return "vk";
  if (h === "codepen.io") return "codepen";
  if (h === "soundcloud.com") return "soundcloud";
  if (h === "vimeo.com") return "vimeo";
  if (h === "gitlab.com") return "gitlab";
  return null;
}
