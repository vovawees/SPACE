/* Превью ссылок: заголовок, описание, картинка, иконка сайта.

   Запросы идут только во внешний интернет: адрес проверяется уже после
   DNS (в lookup сокета), поэтому подменой DNS нельзя заставить сервер
   постучаться в локальную сеть. Для домашней сети это можно разрешить
   переменной UNFURL_PRIVATE=1. */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Parser } from "htmlparser2";
import type { Unfurl } from "../shared/types.ts";
import { config } from "./config.ts";
import { now, q } from "./db.ts";
import { bad } from "./http.ts";

const MAX_HTML = 1_500_000;
const TIMEOUT = 8000;
const TTL_OK = 3 * 86400_000;
const TTL_FAIL = 10 * 60_000;

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT, в т.ч. Tailscale
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    const ok = config.unfurlPrivate ? list : list.filter((a) => !isPrivateAddress(a.address));
    if (!ok.length) {
      return callback(Object.assign(new Error("Адрес во внутренней сети"), { code: "EPRIVATE" }), "", 4);
    }
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, ok);
    callback(null, ok[0]!.address, ok[0]!.family);
  });
};

interface Fetched {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function getOnce(url: URL, maxBytes: number, extra: Record<string, string> = {}): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    // IP-адрес в ссылке DNS не проходит — проверяем его сразу
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && !config.unfurlPrivate && isPrivateAddress(literal)) {
      return reject(Object.assign(new Error("Адрес во внутренней сети"), { code: "EPRIVATE" }));
    }
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; SpaceBot/3.0; link preview)",
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-language": "ru,en;q=0.8",
          ...extra,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const type = String(res.headers["content-type"] || "");
        const isHtml = /html|xml|json/.test(type);
        res.on("data", (chunk: Buffer) => {
          if (!isHtml) return; // для картинок/файлов хватит заголовков
          size += chunk.length;
          chunks.push(chunk);
          if (size >= maxBytes) res.destroy();
        });
        const done = () => resolve({ url: url.href, status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
        if (!isHtml && (res.statusCode || 0) < 300) res.destroy();
      },
    );
    req.on("timeout", () => req.destroy(new Error("Сайт не ответил вовремя")));
    req.on("error", reject);
  });
}

async function fetchFollow(start: URL, extra?: Record<string, string>, maxBytes = MAX_HTML): Promise<Fetched> {
  let url = start;
  for (let i = 0; i < 6; i++) {
    const res = await getOnce(url, maxBytes, extra);
    const loc = res.headers.location;
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, url);
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error("Странное перенаправление");
      url = next;
      continue;
    }
    return res;
  }
  throw new Error("Слишком много перенаправлений");
}

function charsetOf(type: string, head: Buffer): string {
  const m = /charset=["']?([\w-]+)/i.exec(type);
  if (m) return m[1]!;
  const sniff = head.subarray(0, 4096).toString("latin1");
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff);
  return meta?.[1] ?? "utf-8";
}

function decode(buf: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

function frameable(h: http.IncomingHttpHeaders): boolean {
  const xfo = String(h["x-frame-options"] || "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
  const csp = String(h["content-security-policy"] || "").toLowerCase();
  const fa = /frame-ancestors([^;]*)/.exec(csp);
  if (fa && !fa[1]!.includes("*")) return false;
  return true;
}

/** Метаданные из <head>: og-теги, JSON-LD, значок, oEmbed (экспорт — для тестов). */
export function parseHtml(html: string, base: string): Partial<Unfurl> & { oembed?: string } {
  const meta: Record<string, string> = {};
  let title = "";
  let inTitle = false;
  const icons: { href: string; size: number }[] = [];
  let ld = "";
  let inLd = false;
  let oembed: string | undefined;
  const parser = new Parser(
    {
      onopentag(name, a) {
        if (name === "title") inTitle = true;
        else if (name === "script" && (a.type || "").toLowerCase() === "application/ld+json") inLd = true;
        else if (name === "meta") {
          const key = (a.property || a.name || a.itemprop || "").toLowerCase();
          if (key && a.content && !(key in meta)) meta[key] = a.content;
        } else if (name === "link" && a.href) {
          const rel = (a.rel || "").toLowerCase();
          if (rel === "alternate" && (a.type || "").toLowerCase() === "application/json+oembed") oembed ??= a.href;
          if (/\bicon\b/.test(rel) || rel.includes("apple-touch-icon")) {
            const size = Number(/(\d+)/.exec(a.sizes || "")?.[1] || (rel.includes("apple") ? 180 : 16));
            icons.push({ href: a.href, size });
          }
        } else if (name === "body") parser.pause();
      },
      ontext(t) {
        if (inTitle && title.length < 300) title += t;
        if (inLd && ld.length < 200_000) ld += t;
      },
      onclosetag(name) {
        if (name === "title") inTitle = false;
        if (name === "script" && inLd) {
          inLd = false;
          ld += "\u0000";
        }
        if (name === "head") parser.pause();
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  const abs = (u?: string) => {
    if (!u) return undefined;
    try {
      const v = new URL(u.trim(), base);
      return v.protocol === "http:" || v.protocol === "https:" ? v.href : undefined;
    } catch {
      return undefined;
    }
  };
  icons.sort((x, y) => Math.abs(x.size - 64) - Math.abs(y.size - 64));
  const clean = (s?: string) => s?.replace(/\s+/g, " ").trim().slice(0, 400) || undefined;
  const j = jsonLd(ld);
  return {
    title: clean(meta["og:title"] || meta["twitter:title"] || j.title || title),
    description: clean(meta["og:description"] || meta["twitter:description"] || meta["description"] || j.description),
    image: abs(meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"] || j.image),
    icon: abs(icons[0]?.href) ?? abs("/favicon.ico"),
    site: clean(meta["og:site_name"] || j.site),
    oembed: abs(oembed),
  };
}

/** Schema.org в <script type="application/ld+json">: у многих SPA нет
    og-тегов, но есть разметка для поисковиков. */
function jsonLd(raw: string): { title?: string; description?: string; image?: string; site?: string } {
  const out: { title?: string; description?: string; image?: string; site?: string } = {};
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
  const img = (x: unknown): string | undefined => (typeof x === "string" ? x : Array.isArray(x) ? img(x[0]) : x && typeof x === "object" ? str((x as { url?: unknown }).url) : undefined);
  const visit = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || depth > 4) return;
    if (Array.isArray(o)) return o.forEach((x) => visit(x, depth + 1));
    const r = o as Record<string, unknown>;
    if (Array.isArray(r["@graph"])) visit(r["@graph"], depth + 1);
    const type = String(r["@type"] ?? "");
    if (/^(WebSite|Organization)$/.test(type)) out.site ??= str(r.name);
    else {
      out.title ??= str(r.headline) ?? str(r.name);
      out.description ??= str(r.description);
      out.image ??= img(r.image) ?? img(r.thumbnailUrl);
    }
  };
  for (const part of raw.split("\u0000")) {
    if (!part.trim()) continue;
    try {
      visit(JSON.parse(part), 0);
    } catch {
      /* битая разметка — пропускаем */
    }
  }
  return out;
}

/* ---------------------------- особые сайты ----------------------------
   У части сайтов есть открытые API — там данные точнее и богаче, чем в
   метатегах: звёзды и язык репозитория, статус задачи, версия пакета,
   цена игры. Ошибка API — не беда: дальше обычный разбор страницы. */

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetchFollow(new URL(url), { accept: "application/json", ...headers }, 600_000);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(res.body.toString("utf8"));
}

const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const strip = (s: unknown, n = 400) =>
  typeof s === "string"
    ? s
        .replace(/<[^>]+>/g, " ")
        .replace(/[#*_`>\[\]]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, n) || undefined
    : undefined;

type Special = Partial<Unfurl> & { title: string };

async function special(url: URL): Promise<Special | null> {
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "github.com" && parts.length >= 2 && !["orgs", "settings", "marketplace", "features", "topics", "collections", "sponsors"].includes(parts[0]!)) {
    const gh = { accept: "application/vnd.github+json", ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {}) };
    const [owner, repo] = parts as [string, string];
    const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    if ((parts[2] === "issues" || parts[2] === "pull") && /^\d+$/.test(parts[3] ?? "")) {
      const it = (await getJson(`${base}/issues/${parts[3]}`, gh)) as Record<string, any>;
      const pr = !!it.pull_request;
      const merged = pr && it.pull_request?.merged_at;
      const state = merged ? "Влит" : it.state === "open" ? "Открыт" : "Закрыт";
      return {
        title: `#${it.number} ${it.title}`,
        description: strip(it.body, 300),
        site: `${owner}/${repo} · ${pr ? "Pull request" : "Задача"}`,
        facts: [state, `@${it.user?.login ?? "?"}`, ...(it.comments ? [`💬 ${it.comments}`] : [])],
        image: `https://opengraph.githubassets.com/1/${owner}/${repo}/${pr ? "pull" : "issues"}/${it.number}`,
      };
    }
    if (parts.length === 2) {
      const r = (await getJson(base, gh)) as Record<string, any>;
      return {
        title: r.full_name,
        description: strip(r.description, 300),
        site: "GitHub",
        facts: [`★ ${compact.format(r.stargazers_count ?? 0)}`, ...(r.language ? [r.language] : []), ...(r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? [r.license.spdx_id] : []), ...(r.archived ? ["Архив"] : [])],
        image: `https://opengraph.githubassets.com/1/${r.full_name}`,
      };
    }
    return null;
  }

  if (/(^|\.)wikipedia\.org$/.test(host) && parts[0] === "wiki" && parts[1]) {
    const lang = host.split(".")[0] === "wikipedia" ? "en" : host.split(".")[0]!;
    const w = (await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${parts.slice(1).join("/")}`)) as Record<string, any>;
    if (!w.title) return null;
    return { title: w.title, description: strip(w.extract, 400), image: w.thumbnail?.source, site: "Википедия", facts: w.description ? [String(w.description).slice(0, 60)] : undefined };
  }

  if (host === "npmjs.com" && parts[0] === "package" && parts[1]) {
    const name = parts[1].startsWith("@") ? `${parts[1]}/${parts[2] ?? ""}` : parts[1];
    const n = (await getJson(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`)) as Record<string, any>;
    return { title: n.name, description: strip(n.description, 300), site: "npm", facts: [`v${n.version}`, ...(typeof n.license === "string" ? [n.license] : [])] };
  }

  if (host === "store.steampowered.com" && parts[0] === "app" && /^\d+$/.test(parts[1] ?? "")) {
    const id = parts[1]!;
    const d = (await getJson(`https://store.steampowered.com/api/appdetails?appids=${id}&l=russian&cc=ru`)) as Record<string, any>;
    const g = d?.[id]?.data;
    if (!g) return null;
    const price = g.is_free ? "Бесплатно" : g.price_overview?.final_formatted;
    return {
      title: g.name,
      description: strip(g.short_description, 300),
      image: g.header_image,
      site: "Steam",
      facts: [...(price ? [price] : []), ...((g.genres ?? []) as { description: string }[]).slice(0, 2).map((x) => x.description)],
    };
  }

  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com" || host === "music.youtube.com") {
    const o = (await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`)) as Record<string, any>;
    return { title: o.title, description: o.author_name, image: o.thumbnail_url, site: "YouTube" };
  }
  return null;
}

/** oEmbed из <link rel="alternate">: автор и обложка, если в метатегах их нет. */
async function fromOembed(href: string): Promise<Partial<Unfurl>> {
  try {
    const o = (await getJson(href)) as Record<string, any>;
    return stripUndef({
      title: typeof o.title === "string" ? o.title.slice(0, 300) : undefined,
      description: typeof o.author_name === "string" ? o.author_name : undefined,
      image: typeof o.thumbnail_url === "string" && /^https?:/.test(o.thumbnail_url) ? o.thumbnail_url : undefined,
      site: typeof o.provider_name === "string" ? o.provider_name : undefined,
    });
  } catch {
    return {};
  }
}

export function normalizeUrl(raw: string): URL {
  let s = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw bad("Это не похоже на ссылку");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw bad("Поддерживаются только http и https");
  url.hash = "";
  return url;
}

export async function unfurl(raw: string): Promise<Unfurl> {
  const url = normalizeUrl(raw);
  const key = url.href;
  const cached = q("SELECT data, fetched_at FROM unfurls WHERE url = ?").get(key) as
    | { data: string; fetched_at: number }
    | undefined;
  if (cached) {
    const data = JSON.parse(cached.data) as Unfurl & { failed?: boolean };
    if (now() - cached.fetched_at < (data.failed ? TTL_FAIL : TTL_OK)) return data;
  }
  let out: Unfurl & { failed?: boolean };
  try {
    const sp = await special(url).catch(() => null);
    if (sp?.title) {
      out = { url: key, kind: "page", site: url.hostname.replace(/^www\./, ""), embeddable: false, ...stripUndef(sp) };
      if (!out.icon) out.icon = `https://${url.hostname}/favicon.ico`;
      q("INSERT OR REPLACE INTO unfurls (url, data, fetched_at) VALUES (?, ?, ?)").run(key, JSON.stringify(out), now());
      return out;
    }
    const res = await fetchFollow(url);
    const type = String(res.headers["content-type"] || "").split(";")[0]!.trim().toLowerCase();
    const host = new URL(res.url).hostname.replace(/^www\./, "");
    if (type.includes("html")) {
      const html = decode(res.body, charsetOf(String(res.headers["content-type"] || ""), res.body));
      const { oembed, ...page } = parseHtml(html, res.url);
      // страница-проверка «вы не робот?» (Cloudflare и т.п.) — не превью сайта
      if (res.headers["cf-mitigated"] || (res.status >= 400 && /^(just a moment|attention required|один момент|please wait|access denied)/i.test(page.title ?? ""))) {
        page.title = undefined;
        page.description = undefined;
        page.image = undefined;
      }
      out = { url: key, kind: "page", site: host, ...stripUndef(page), embeddable: frameable(res.headers) };
      if (oembed && (!out.image || !out.title)) {
        const o = await fromOembed(oembed);
        out.title ||= o.title;
        out.image ||= o.image;
        out.description ||= o.description;
      }
      if (!out.site) out.site = host;
    } else {
      const kind = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "file";
      const name = decodeURIComponent(new URL(res.url).pathname.split("/").pop() || host);
      out = { url: key, kind, title: name, site: host, mime: type || undefined, embeddable: true };
    }
    if (res.status >= 400 && out.kind === "page" && !out.title) {
      out.failed = true;
      out.title = host;
    }
  } catch (err) {
    const host = url.hostname.replace(/^www\./, "");
    out = { url: key, kind: "page", title: host, site: host, failed: true };
    if ((err as { code?: string }).code === "EPRIVATE") out.description = "Адрес во внутренней сети — превью отключено";
  }
  q("INSERT OR REPLACE INTO unfurls (url, data, fetched_at) VALUES (?, ?, ?)").run(key, JSON.stringify(out), now());
  return out;
}

function stripUndef<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

export function pruneUnfurls(): void {
  q("DELETE FROM unfurls WHERE fetched_at < ?").run(now() - 7 * 86400_000);
}
