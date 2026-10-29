import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENTS, BACKDROPS } from "../../src/client/lib/look.svelte.ts";
import { FONTS, FONT_GROUPS, fontCss, fontOf } from "../../src/client/board/model.ts";
import { PRESETS, STYLE_KEYS, TEXT_STYLE_KEYS, canTextStyle, hasStyle, styleOf, stylePatch } from "../../src/client/board/style.ts";
import type { NodeProps } from "../../src/client/board/model.ts";

describe("начертание текста", () => {
  it("классы для каждого свойства", () => {
    const { cls } = styleOf({ tw: "bold", ti: true, tt: "up", tls: "wide", tlh: "loose", tfx: "glow" } as NodeProps);
    for (const c of ["tw-bold", "ti", "tt-up", "tls-wide", "tlh-loose", "tfx-glow"]) expect(cls.split(" ")).toContain(c);
    expect(styleOf({} as NodeProps).cls).toBe("");
  });
  it("сброс оформления убирает и начертание", () => {
    const patch = stylePatch({}) as Record<string, unknown>;
    for (const k of TEXT_STYLE_KEYS) {
      expect(k in patch).toBe(true);
      expect(patch[k]).toBeUndefined();
    }
    expect(hasStyle({ ti: true } as NodeProps)).toBe(true);
    expect(STYLE_KEYS).toContain("tfx");
  });
  it("начертание — только у объектов со свободным текстом", () => {
    expect(canTextStyle("note")).toBe(true);
    expect(canTextStyle("frame")).toBe(true);
    expect(canTextStyle("code")).toBe(false);
    expect(canTextStyle("counter")).toBe(false);
  });
  it("правила для каждого эффекта есть в CSS", () => {
    const css = fs.readFileSync("src/client/styles/custom.css", "utf8");
    for (const c of ["tw-light", "tw-bold", "tw-heavy", "tt-up", "tt-sc", "tls-tight", "tls-wide", "tls-wider", "tlh-tight", "tlh-loose", "tfx-shadow", "tfx-outline", "tfx-glow", "tfx-pop"]) expect(css).toContain(`.node.${c} `);
  });
});

describe("шрифты, наборы и оформление", () => {
  it("группы шрифтов покрывают все шрифты, id уникальны", () => {
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(FONTS.length);
    for (const f of FONTS) expect(FONT_GROUPS).toContain(f.group);
    expect(fontCss("sans")).toBeNull();
    expect(fontCss("pixel")).toContain("Pixelify");
    expect(fontOf("nope")).toBeUndefined();
  });
  it("наборы: уникальные id, шрифты существуют", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      const font = (p.style as { font?: string }).font;
      if (font) expect(fontOf(font)).toBeTruthy();
    }
  });
  it("у каждого акцента и фона есть токены", () => {
    const css = fs.readFileSync("src/client/styles/tokens.css", "utf8");
    for (const a of ACCENTS) if (a.id !== "orange") expect(css).toContain(`[data-accent="${a.id}"]`);
    for (const b of BACKDROPS) if (b.id !== "graphite") expect(css).toContain(`[data-bg="${b.id}"]`);
    expect(new Set(ACCENTS.map((a) => a.id)).size).toBe(ACCENTS.length);
    expect(new Set(BACKDROPS.map((b) => b.id)).size).toBe(BACKDROPS.length);
  });
});
