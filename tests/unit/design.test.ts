import { describe, expect, it } from "vitest";
import { actionsFor, AUTO_INPUT, optionsOf, triggersFor } from "../../src/client/board/logic.svelte.ts";
import type { NodeProps } from "../../src/client/board/model.ts";
import {
  addCardPatch,
  cardsByCol,
  clearDonePatch,
  fillPatch,
  islandPatch,
  kanbanDone,
  lootChances,
  lootPatch,
  lootPick,
  mapCells,
  orderBetween,
  paintPatch,
  pokerResetPatch,
  pokerSig,
  pokerSummary,
  restorePatch,
  roadShare,
  sigVal,
  statClamp,
  statsSig,
  tilesOf,
} from "../../src/client/board/nodes/design.ts";
import { compile, niceTicks, shortNum } from "../../src/client/board/nodes/formula.ts";
import type { NodeView } from "../../src/client/board/store.svelte.ts";
import { TEMPLATES } from "../../src/client/board/templates.ts";

const P = (x: Record<string, unknown>) => x as unknown as NodeProps;
const at = (f: string, x: number) => compile(f).at(x);

describe("формулы кривой", () => {
  it("считает степени, неявное умножение, функции и условия", () => {
    expect(at("100 * x^1.5", 4)).toBe(800);
    expect(at("50 + 12x", 10)).toBe(170);
    expect(at("3(x+1)", 2)).toBe(9);
    expect(at("round(50 * 1.35^(x-1))", 1)).toBe(50);
    expect(at("if(x < 10, 5x, 50 + 2x)", 5)).toBe(25);
    expect(at("if(x < 10, 5x, 50 + 2x)", 20)).toBe(90);
    expect(at("max(1, min(x, 3))", 7)).toBe(3);
    expect(at("sqrt(x)", -1)).toBeNaN();
  });

  it("сообщает об ошибке вместо исключения", () => {
    expect(compile("2 +").ok).toBe(false);
    expect(compile("foo(x)").ok).toBe(false);
    expect(compile("").ok).toBe(false);
    expect(compile("x").ok).toBe(true);
  });

  it("делит шкалу ровно и коротко пишет числа", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(1, 50, 5)[0]).toBe(10);
    expect(shortNum(35355)).toMatch(/35,4\s?тыс/);
    expect(shortNum(Number.NaN)).toBe("—");
  });
});

describe("таблица добычи", () => {
  const lo = [
    { id: "a", t: "Монеты", w: 3 },
    { id: "z", t: "Пусто", w: 0 },
    { id: "b", t: "Меч", w: 1 },
  ];
  it("выбирает по весам и пропускает нулевые", () => {
    expect(lootPick(lo, 0)!.id).toBe("a");
    expect(lootPick(lo, 0.74)!.id).toBe("a");
    expect(lootPick(lo, 0.76)!.id).toBe("b");
    expect(lootPick(lo, 0.999999)!.id).toBe("b");
    expect(lootPick([{ id: "z", t: "", w: 0 }], 0.5)).toBeNull();
    expect(lootChances(P({ lo }))).toEqual([0.75, 0, 0.25]);
  });
  it("бросок — нужное число предметов и следующий номер", () => {
    const patch = lootPatch(P({ lo, count: 3, drop: { s: 4, i: [], n: "", c: "" } }), { n: "Аня", c: "#f00" }) as { drop: { s: number; i: string[] } };
    expect(patch.drop.s).toBe(5);
    expect(patch.drop.i).toHaveLength(3);
    for (const id of patch.drop.i) expect(["a", "b"]).toContain(id);
  });
});

describe("канбан", () => {
  const p = P({
    kb: [
      { id: "a", t: "Идеи" },
      { id: "d", t: "Готово" },
    ],
    "kc:1": { t: "второй", col: "a", o: 2 },
    "kc:2": { t: "первый", col: "a", o: 1 },
    "kc:3": { t: "готов", col: "d", o: 1 },
    "kc:4": { t: "без колонки", col: "нет", o: 3 },
  });
  it("раскладывает по колонкам и порядку; потерянные — в первую", () => {
    const by = cardsByCol(p);
    expect(by.get("a")!.map((c) => c.t)).toEqual(["первый", "второй", "без колонки"]);
    expect(kanbanDone(p)).toEqual([1, 4]);
  });
  it("порядок между соседями и новые карточки — в конец", () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(undefined, 1)).toBe(0);
    expect(orderBetween(3, undefined)).toBe(4);
    const [id, patch] = addCardPatch(p, "новая");
    expect((patch[`kc:${id}`] as { o: number; col: string }).col).toBe("a");
    expect((patch[`kc:${id}`] as { o: number }).o).toBeGreaterThan(3);
    expect(clearDonePatch(p)).toEqual({ "kc:3": undefined });
  });
});

describe("дорожная карта и персонаж", () => {
  it("готовность — по длительности этапов", () => {
    const p = P({ pn: 8, "rb:a": { t: "A", s: 0, d: 3, o: 1, pv: 100 }, "rb:b": { t: "B", s: 3, d: 1, o: 2, pv: 0 } });
    expect(roadShare(p)).toBeCloseTo(0.75);
  });
  it("шкалы: предел, подпись и восстановление", () => {
    const p = P({ pl: [{ id: "hp", t: "Здоровье", c: "red", m: 20 }, { id: "atk", t: "Атака", c: "orange" }], "sc:hp": 7, "sc:atk": 12 });
    expect(statsSig(p)).toBe("hp=7;atk=12");
    expect(sigVal("hp=7;atk=12", "atk")).toBe(12);
    expect(sigVal("hp=7;atk=12")).toBe(7);
    expect(sigVal("", "hp")).toBe(0);
    expect(statClamp({ id: "hp", t: "", c: "", m: 20 }, 25)).toBe(20);
    expect(statClamp({ id: "hp", t: "", c: "", m: 20 }, -3)).toBe(0);
    expect(statClamp({ id: "atk", t: "", c: "" }, -3)).toBe(-3);
    expect(restorePatch(p)).toEqual({ "sc:hp": 20 });
  });
});

describe("покер планирования", () => {
  const vote = (v: string, n: string) => ({ v, n, c: "#000" });
  it("среднее, разброс и согласие", () => {
    const p = P({ pk: "fib", "pp:a": vote("3", "Аня"), "pp:b": vote("5", "Борис"), "pp:c": vote("?", "Вика") });
    const s = pokerSummary(p);
    expect(s.n).toBe(3);
    expect(s.avg).toBe(4);
    expect(s.min).toBe("3");
    expect(s.max).toBe("5");
    expect(s.same).toBe(false);
    expect(pokerSig(p).endsWith("|=")).toBe(false);
    const same = P({ "pp:a": vote("8", "Аня"), "pp:b": vote("8", "Борис") });
    expect(pokerSummary(same).same).toBe(true);
    expect(pokerSig(same).endsWith("|=")).toBe(true);
    expect(pokerResetPatch(P({ on: true, "pp:a": vote("1", "А") }))).toEqual({ on: undefined, "pp:a": undefined });
  });
  it("футболки — ближайший размер", () => {
    expect(pokerSummary(P({ pk: "tshirt", "pp:a": vote("S", "А"), "pp:b": vote("L", "Б") })).label).toBe("M");
  });
});

describe("карта уровня", () => {
  it("заливка красит только связную область", () => {
    const p = P({ gw: 4, gh: 2, "gt:0:0": "grass", "gt:1:0": "grass", "gt:3:0": "grass" });
    const sand = tilesOf(p).find((t) => t.id === "sand")!;
    expect(fillPatch(p, 0, 0, sand)).toEqual({ "gt:0:0": "sand", "gt:1:0": "sand" });
    // пустая область вокруг
    expect(Object.keys(fillPatch(p, 2, 0, sand)).sort()).toEqual(["gt:0:1", "gt:1:1", "gt:2:0", "gt:2:1", "gt:3:1"]);
  });
  it("предмет ставится и снимается кистью; остров — с водой и героем", () => {
    const hero = tilesOf(P({})).find((t) => t.id === "hero")!;
    expect(paintPatch(P({}), 1, 1, hero)).toEqual({ "go:1:1": "hero" });
    expect(paintPatch(P({ "go:1:1": "hero" }), 1, 1, hero)).toEqual({ "go:1:1": undefined });
    const isl = islandPatch(16, 10);
    expect(isl.gb).toBe("water");
    const cells = mapCells(P({ gw: 16, gh: 10, ...isl }));
    expect(cells.ground.length).toBeGreaterThan(20);
    expect(cells.things.some((c) => c.t === "hero")).toBe(true);
  });
});

describe("логика новых объектов", () => {
  it("у новых виджетов есть события и действия", () => {
    for (const t of ["kanban", "roadmap", "stats", "loot", "estimate", "curve"] as const) expect(triggersFor(t).length, t).toBeGreaterThan(0);
    for (const t of ["kanban", "stats", "loot", "estimate"] as const) expect(actionsFor(t).length, t).toBeGreaterThan(0);
    expect(AUTO_INPUT.has("curve")).toBe(true);
    expect(optionsOf({ id: "l", type: "loot", props: P({ lo: [{ id: "a", t: "Меч", w: 1 }] }) } as unknown as NodeView)).toEqual(["Меч"]);
  });

  it("правила в шаблонах ссылаются на существующие события, действия и варианты", () => {
    const DERIVED = new Set(["share", "count", "all"]);
    for (const t of TEMPLATES) {
      const clip = t.build();
      const byId = new Map(clip.nodes.map((n) => [n.id, n]));
      for (const a of clip.nodes) {
        if (a.type !== "path") continue;
        const src = a.b0 && byId.get(a.b0.id);
        const tgt = a.b1 && byId.get(a.b1.id);
        const r = a.lg;
        if (!r) {
          if (src && tgt && AUTO_INPUT.has(tgt.type)) continue;
          continue;
        }
        expect(src && tgt, `${t.id}: концы стрелки`).toBeTruthy();
        const trs = triggersFor(src!.type);
        const acts = actionsFor(tgt!.type);
        expect(acts.map((x) => x.id), `${t.id}: ${tgt!.type} умеет ${r.do}`).toContain(r.do);
        if (DERIVED.has(r.do)) continue;
        const td = trs.find((x) => x.id === r.on);
        expect(td, `${t.id}: ${src!.type} знает событие ${r.on}`).toBeTruthy();
        if (td?.x === "option") expect(optionsOf({ id: src!.id, type: src!.type, props: src } as unknown as NodeView), `${t.id}: вариант`).toContain(r.tx);
        if (td?.x === "player") expect((src as { pl?: { id: string }[] }).pl?.map((x) => x.id), `${t.id}: шкала`).toContain(r.tx);
        const ad = acts.find((x) => x.id === r.do);
        if (ad?.x === "player" && r.x) expect((tgt as { pl?: { id: string }[] }).pl?.map((x) => x.id), `${t.id}: кому`).toContain(r.x);
      }
    }
  });
});
