import { describe, expect, it } from "vitest";
import type { NodeProps } from "../../src/client/board/model.ts";
import type { NodeView } from "../../src/client/board/store.svelte.ts";
import { counterAddPatch, counterBounds, counterSetPatch, counterValue } from "../../src/client/board/nodes/games.ts";
import {
  checklistPatch,
  coinPatch,
  deckCards,
  deckLeft,
  drawPatch,
  randomRange,
  shufflePatch,
  swElapsed,
  swPatch,
  swText,
  turnPatch,
  wordCloud,
} from "../../src/client/board/nodes/play.ts";
import { DAY, HOUR, MIN, SEC, clock, durText, parseDur } from "../../src/client/board/nodes/timer.ts";

const P = (x: Record<string, unknown>) => x as unknown as NodeProps;
const who = { n: "Аня", c: "#ff0000" };

describe("длительность таймера", () => {
  it("понимает «3д 2ч 5с», часы:минуты:секунды и просто минуты", () => {
    expect(parseDur("3д 2ч 5с")).toBe(3 * DAY + 2 * HOUR + 5 * SEC);
    expect(parseDur("3 дня 2 часа 5 секунд")).toBe(3 * DAY + 2 * HOUR + 5 * SEC);
    expect(parseDur("1:30:00")).toBe(90 * MIN);
    expect(parseDur("05:30")).toBe(5 * MIN + 30 * SEC);
    expect(parseDur("90")).toBe(90 * MIN);
    expect(parseDur("1.5h")).toBe(90 * MIN);
    expect(parseDur("2d 4h")).toBe(2 * DAY + 4 * HOUR);
    expect(parseDur("")).toBeNull();
    expect(parseDur("скоро")).toBeNull();
  });

  it("пишет длительность словами и часами", () => {
    expect(durText(3 * DAY + 2 * HOUR + 5 * SEC)).toBe("3 д 2 ч 5 с");
    expect(durText(25 * MIN)).toBe("25 мин");
    expect(durText(0)).toBe("0 с");
    expect(clock(4 * MIN + 59 * SEC)).toBe("04:59");
    expect(clock(HOUR + 2 * MIN + 3 * SEC)).toBe("1:02:03");
    expect(clock(3 * DAY + 2 * HOUR + 5 * SEC)).toBe("3 д 02:00:05");
  });
});

describe("счётчик с границами", () => {
  it("не выходит за «не меньше» и «не больше»", () => {
    const p = P({ n0: 9, min: 0, max: 10 });
    expect(counterBounds(p)).toEqual([0, 10]);
    expect(counterAddPatch(p, "u", 1)).toEqual({ "d:u": 1 });
    expect(counterAddPatch(P({ n0: 10, max: 10 }), "u", 1)).toBeNull();
    // сумма ушла за край из‑за одновременных нажатий — показываем край, «−» ведёт от него
    const over = P({ n0: 12, max: 10 });
    expect(counterValue(over)).toBe(10);
    expect(counterAddPatch(over, "u", -1)).toEqual({ "d:u": -3 });
    expect(counterValue(P({ ...over, ...counterSetPatch(over, 50) }))).toBe(10);
    expect(counterValue(P({ "d:a": 2, ...counterSetPatch(P({ "d:a": 2 }), 7) }))).toBe(7);
  });
});

describe("игры", () => {
  it("секундомер копит время между запусками и сбрасывается", () => {
    let p = P({});
    p = P({ ...p, ...swPatch(p, "start", 1000) });
    expect(swElapsed(p, 4000)).toBe(3000);
    p = P({ ...p, ...swPatch(p, "stop", 4000) });
    expect(swElapsed(p, 99_000)).toBe(3000);
    p = P({ ...p, ...swPatch(p, "start", 10_000) });
    p = P({ ...p, ...swPatch(p, "lap", 12_000) });
    expect(p.laps).toEqual([5000]);
    expect(swText(65_370, true)).toBe("01:05.37");
    p = P({ ...p, ...swPatch(p, "reset", 13_000) });
    expect(swElapsed(p, 20_000)).toBe(0);
  });

  it("монетка считает броски обеих сторон", () => {
    let p = P({});
    for (let i = 0; i < 20; i++) p = P({ ...p, ...coinPatch(p, who) });
    expect(p.coin?.s).toBe(20);
    expect((p.ch?.[0] ?? 0) + (p.ch?.[1] ?? 0)).toBe(20);
  });

  it("колода: тянем все карты без повторов, потом пусто; перемешать — заново", () => {
    let p = P({ dk: "36" });
    expect(deckCards(p)).toHaveLength(36);
    const seen = new Set<number>();
    for (let i = 0; i < 36; i++) {
      const patch = drawPatch(p, who);
      expect(patch).not.toBeNull();
      p = P({ ...p, ...patch });
      seen.add(p.top!.i);
    }
    expect(seen.size).toBe(36);
    expect(deckLeft(p)).toBe(0);
    expect(drawPatch(p, who)).toBeNull();
    p = P({ ...p, ...shufflePatch(p) });
    expect(deckLeft(p)).toBe(36);
    expect(p.shf).toBe(1);
    expect(deckCards(P({ dk: "52" }))).toHaveLength(52);
    expect(deckCards(P({ dk: "custom", opts: [{ id: "a", t: "Дракон" }, { id: "b", t: " " }] })).map((c) => c.t)).toEqual(["Дракон"]);
  });

  it("очередь ходов: по кругу с номером раунда", () => {
    const pl = [{ id: "a", t: "А", c: "blue" }, { id: "b", t: "Б", c: "red" }];
    let p = P({ pl, cur: 0, rn: 1 });
    p = P({ ...p, ...turnPatch(p, 1) });
    expect([p.cur, p.rn]).toEqual([1, 1]);
    p = P({ ...p, ...turnPatch(p, 1) });
    expect([p.cur, p.rn]).toEqual([0, 2]);
    p = P({ ...p, ...turnPatch(p, -1) });
    expect([p.cur, p.rn]).toEqual([1, 1]);
  });

  it("чек-лист: следующий, последний, все, очистить", () => {
    const v = (props: Record<string, unknown>) => ({ props: P(props) }) as unknown as NodeView;
    const cl = [{ id: "a", t: "1" }, { id: "b", t: "2" }];
    expect(checklistPatch(v({ cl }), "next")).toEqual({ "ck:a": true });
    expect(checklistPatch(v({ cl, "ck:a": true }), "next")).toEqual({ "ck:b": true });
    expect(checklistPatch(v({ cl, "ck:a": true, "ck:b": true }), "last")).toEqual({ "ck:b": undefined });
    expect(checklistPatch(v({ cl }), "all")).toEqual({ "ck:a": true, "ck:b": true });
    expect(checklistPatch(v({ cl, "ck:a": true }), "clear")).toEqual({ "ck:a": undefined, "ck:b": undefined });
  });

  it("облако слов: без учёта регистра, частые — первыми", () => {
    const p = P({ "w:a": ["Кофе", "сон"], "w:b": ["кофе"], "w:c": ["Сон", "кофе "], x: ["не слово"] });
    expect(wordCloud(p)).toEqual([
      { t: "Кофе", n: 3 },
      { t: "сон", n: 2 },
    ]);
  });

  it("случайное число: пределы в любом порядке", () => {
    expect(randomRange(P({ min: 10, max: 1 }))).toEqual([1, 10]);
    expect(randomRange(P({}))).toEqual([1, 100]);
  });
});
