import { describe, expect, it } from "vitest";
import { EMOJI_GROUPS, LIB_CATS, LIB_ITEMS } from "../../src/client/board/library.ts";

describe("библиотека", () => {
  it("у всех элементов разные id (иначе раздел не отрисуется)", () => {
    const ids = LIB_ITEMS.map((i) => i.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup).toEqual([]);
  });
  it("каждый стикер лежит в своей группе, все группы не пустые", () => {
    const st = LIB_ITEMS.filter((i) => i.cat === "stickers");
    for (const g of EMOJI_GROUPS) expect(st.filter((i) => i.group === g.name).length).toBeGreaterThan(0);
    expect(st.every((i) => EMOJI_GROUPS.some((g) => g.name === i.group))).toBe(true);
  });
  it("у каждого раздела есть элементы", () => {
    for (const c of LIB_CATS) expect(LIB_ITEMS.some((i) => i.cat === c.id)).toBe(true);
  });
});
