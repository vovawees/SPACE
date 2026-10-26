import { describe, expect, it } from "vitest";
import { parseHtml } from "../../src/server/unfurl.ts";
import { brandOf } from "../../src/client/board/brands.ts";
import { embedFor, embedHeight } from "../../src/client/board/embeds.ts";
import { CODE_LANGS, colorCss, colorKey, isHex, langFromName, langLabel } from "../../src/client/board/model.ts";
import { pinScale, threadOf } from "../../src/client/board/nodes/comment.ts";
import { counterValue, deltaKey } from "../../src/client/board/nodes/games.ts";
import { runTime } from "../../src/client/board/run.svelte.ts";
import { TEMPLATE_GROUPS, TEMPLATES, templateThumb } from "../../src/client/board/templates.ts";
import type { NodeProps } from "../../src/client/board/model.ts";

describe("счётчик и комментарии", () => {
  it("значение счётчика — база плюс поправки участников", () => {
    const p = { n0: 10, [deltaKey("a")]: 3, [deltaKey("b")]: -1.5, "d:bad": "x", other: 100 } as unknown as NodeProps;
    expect(counterValue(p)).toBe(11.5);
    expect(counterValue({} as NodeProps)).toBe(0);
    // дробные шаги не копят ошибку округления
    expect(counterValue({ n0: 0.1, "d:a": 0.2 } as unknown as NodeProps)).toBe(0.3);
  });

  it("ветка комментариев идёт по времени, мусор отбрасывается", () => {
    const p = {
      "m:2": { x: "второй", t: 20, u: "a" },
      "m:1": { x: "первый", t: 10, u: "b" },
      "m:bad": { x: 5, t: 1 },
      text: "не сообщение",
    } as unknown as NodeProps;
    expect(threadOf(p).map((m) => m.x)).toEqual(["первый", "второй"]);
  });

  it("булавка комментария почти не меняет размер на экране", () => {
    expect(pinScale(1)).toBe(1);
    expect(pinScale(0.5)).toBe(2);
    expect(pinScale(0.01)).toBe(3);
    expect(pinScale(10)).toBe(0.5);
  });
});

describe("цвета", () => {
  it("свои цвета #rrggbb и именованные", () => {
    expect(isHex("#A1b2C3")).toBe(true);
    expect(isHex("#abc")).toBe(false);
    expect(isHex("red")).toBe(false);
    expect(colorKey("#A1B2C3")).toBe("#a1b2c3");
    expect(colorKey("blue")).toBe("blue");
    expect(colorKey("javascript:alert(1)")).toBe("default");
    expect(colorCss("#112233")).toBe("#112233");
    expect(colorCss("green")).toBe("var(--c-green)");
  });
});

describe("код", () => {
  it("языки без повторов, расширения узнаются", () => {
    const ids = CODE_LANGS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(60);
    expect(langFromName("main.rs")).toBe("rust");
    expect(langFromName("player.gd")).toBe("gdscript");
    expect(langFromName("Dockerfile")).toBe("dockerfile");
    expect(langFromName("readme")).toBeNull();
    expect(langLabel("python")).toBe("Python");
    expect(langLabel(undefined)).toBe("Текст");
  });

  it("время выполнения читается по-русски", () => {
    expect(runTime(22)).toBe("22 мс");
    expect(runTime(5000)).toBe("5,0 с");
    expect(runTime(1449)).toBe("1,4 с");
  });
});

describe("шаблоны", () => {
  it("у каждого шаблона уникальный id и известная группа", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMPLATES) expect(TEMPLATE_GROUPS).toContain(t.group);
    for (const g of TEMPLATE_GROUPS) expect(TEMPLATES.some((t) => t.group === g)).toBe(true);
  });

  it("узлы шаблонов целые: id уникальны, связи и рамки ссылаются на существующие узлы", () => {
    for (const t of TEMPLATES) {
      const clip = t.build();
      expect(clip.nodes.length, t.id).toBeGreaterThan(0);
      const ids = new Set(clip.nodes.map((n) => n.id));
      expect(ids.size, t.id).toBe(clip.nodes.length);
      for (const n of clip.nodes) {
        for (const k of ["x", "y", "w", "h"] as const) expect(Number.isFinite(n[k]), `${t.id}/${n.id}.${k}`).toBe(true);
        expect(n.w > 0 && n.h > 0, `${t.id}/${n.id} размер`).toBe(true);
        if (n.parent) expect(ids.has(n.parent), `${t.id}/${n.id} parent`).toBe(true);
        if (n.b0) expect(ids.has(n.b0.id), `${t.id}/${n.id} b0`).toBe(true);
        if (n.b1) expect(ids.has(n.b1.id), `${t.id}/${n.id} b1`).toBe(true);
      }
      expect(templateThumb(clip)).toMatch(/^<svg [^>]*viewBox/);
    }
  });
});

describe("превью ссылок", () => {
  it("og-теги важнее JSON-LD, адреса картинок становятся абсолютными", () => {
    const html = `<html><head><title> Заголовок  страницы </title>
      <meta property="og:title" content="OG заголовок">
      <meta name="description" content="Описание">
      <link rel="icon" href="/fav-32.png" sizes="32x32">
      <link rel="apple-touch-icon" href="/apple.png">
      <script type="application/ld+json">{"@type":"Article","headline":"LD","image":["/ld.png"]}</script>
      </head><body><meta property="og:title" content="в body не смотрим"></body></html>`;
    const r = parseHtml(html, "https://example.com/a/b");
    expect(r.title).toBe("OG заголовок");
    expect(r.description).toBe("Описание");
    expect(r.image).toBe("https://example.com/ld.png");
    expect(r.icon).toBe("https://example.com/fav-32.png"); // ближе всего к 64 px
  });

  it("без og-тегов берётся JSON-LD (в т. ч. @graph) и oEmbed", () => {
    const ld = JSON.stringify({ "@graph": [{ "@type": "WebSite", name: "Сайт" }, { "@type": "Product", name: "Товар", description: "Лучший", image: { url: "https://cdn.example.com/p.jpg" } }] });
    const html = `<head><title>t</title><script type="application/ld+json">${ld}</script>
      <link rel="alternate" type="application/json+oembed" href="/oembed?u=1"></head>`;
    const r = parseHtml(html, "https://shop.example.com/item");
    expect(r.title).toBe("Товар");
    expect(r.description).toBe("Лучший");
    expect(r.image).toBe("https://cdn.example.com/p.jpg");
    expect(r.site).toBe("Сайт");
    expect(r.oembed).toBe("https://shop.example.com/oembed?u=1");
    expect(r.icon).toBe("https://shop.example.com/favicon.ico");
  });

  it("опасные адреса картинок отбрасываются", () => {
    const r = parseHtml(`<head><meta property="og:image" content="javascript:alert(1)"></head>`, "https://e.com/");
    expect(r.image).toBeUndefined();
  });

  it("значки сервисов по адресу", () => {
    expect(brandOf("https://github.com/sveltejs/svelte")).toBe("github");
    expect(brandOf("https://youtu.be/abc")).toBe("youtube");
    expect(brandOf("https://ru.wikipedia.org/wiki/X")).toBe("wikipedia");
    expect(brandOf("https://store.steampowered.com/app/1")).toBe("steam");
    expect(brandOf("не адрес")).toBeNull();
  });
});

describe("плееры сервисов", () => {
  it("адрес страницы превращается во встраиваемый", () => {
    expect(embedFor("https://open.spotify.com/intl-ru/track/4uLU6hMCjMI75M1A2tKUQC?si=x")).toMatchObject({ src: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", h: 152 });
    expect(embedFor("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")?.h).toBe(352);
    expect(embedFor("https://www.figma.com/design/AbC123/Name?node-id=1-2")?.src).toBe(
      "https://www.figma.com/embed?embed_host=space&url=" + encodeURIComponent("https://www.figma.com/design/AbC123/Name?node-id=1-2"),
    );
    expect(embedFor("https://www.twitch.tv/somechannel", "space.example")?.src).toBe("https://player.twitch.tv/?channel=somechannel&parent=space.example&autoplay=false");
    expect(embedFor("https://www.twitch.tv/videos/123456", "h")?.src).toContain("video=v123456");
    expect(embedFor("https://codepen.io/user/pen/abcDEF")?.src).toBe("https://codepen.io/user/embed/abcDEF?default-tab=result&theme-id=dark");
    expect(embedFor("https://codepen.io/team/codepen/pen/PNaGbb")?.src).toBe("https://codepen.io/team/codepen/embed/PNaGbb?default-tab=result&theme-id=dark");
    expect(embedFor("https://docs.google.com/document/d/1AbC_d-E/edit#heading=h.1")?.src).toBe("https://docs.google.com/document/d/1AbC_d-E/preview");
    expect(embedFor("https://docs.google.com/presentation/d/1XyZ/edit")?.src).toContain("/embed?");
    expect(embedFor("https://x.com/user/status/1234567890")?.src).toContain("id=1234567890");
    expect(embedFor("https://soundcloud.com/artist/track-name")?.src).toContain(encodeURIComponent("https://soundcloud.com/artist/track-name"));
    expect(embedFor("https://www.loom.com/share/0123abcd")?.src).toBe("https://www.loom.com/embed/0123abcd");
  });

  it("обычные страницы и мусор — без плеера", () => {
    expect(embedFor("https://example.com/track/1")).toBeNull();
    expect(embedFor("https://www.twitch.tv/directory")).toBeNull();
    expect(embedFor("https://open.spotify.com/track/bad%22id")).toBeNull();
    expect(embedFor("javascript:alert(1)")).toBeNull();
    expect(embedFor("не адрес")).toBeNull();
  });

  it("высота плеера — фиксированная или по пропорции", () => {
    expect(embedHeight({ src: "", site: "", w: 400, h: 152 }, 999)).toBe(152);
    expect(embedHeight({ src: "", site: "", w: 600, ratio: 16 / 9 }, 578)).toBe(324);
  });
});
