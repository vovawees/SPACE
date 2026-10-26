/* Счётчик, кубик и прогресс — общие для всех участников.
   Счётчик: база n0 + поправки участников d:<id>. Каждый пишет только своё
   поле, поэтому одновременные нажатия «+» не теряются. */
import type { Board } from "../board.svelte.ts";
import type { NodeData, NodeProps } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";

export const deltaKey = (uid: string) => `d:${uid}`;

const round = (n: number) => Math.round(n * 1000) / 1000;

function deltas(p: NodeProps): number {
  let n = 0;
  for (const [k, x] of Object.entries(p as Record<string, unknown>)) if (k.startsWith("d:") && typeof x === "number" && Number.isFinite(x)) n += x;
  return n;
}

export function counterValue(p: NodeProps): number {
  return round((typeof p.n0 === "number" ? p.n0 : 0) + deltas(p));
}

export function counterAdd(b: Board, v: NodeView, d: number) {
  const k = deltaKey(b.me.id);
  const cur = (v.props as Record<string, unknown>)[k];
  b.view.update(v.id, { [k]: round((typeof cur === "number" ? cur : 0) + d) } as Partial<NodeData>);
}

/** Задать значение: база подбирается так, чтобы сумма стала нужной. */
export function counterSet(b: Board, ids: string[], value: number) {
  b.view.updateMany(
    ids.flatMap((id) => {
      const v = b.view.get(id);
      return v?.type === "counter" ? [[id, { n0: round(value - deltas(v.props)) }] as [string, Partial<NodeData>]] : [];
    }),
  );
}

export const COUNTER_STEPS = [1, 2, 5, 10, 25, 100, 0.5];

/* -------------------------------- кубик -------------------------------- */

export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];

export interface Roll {
  v: number[];
  n: string;
  c: string;
  /** Номер броска — у всех запускает анимацию. */
  s: number;
}

/** Честный бросок: crypto + отбрасывание, без перекоса по модулю. */
export function randInt(sides: number): number {
  const buf = new Uint32Array(1);
  const lim = Math.floor(0x1_0000_0000 / sides) * sides;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < lim) return (buf[0]! % sides) + 1;
  }
}

export function rollDice(b: Board, ids: string[]) {
  if (b.readonly) return;
  const me = b.me;
  b.view.updateMany(
    ids.flatMap((id) => {
      const v = b.view.get(id);
      if (v?.type !== "dice") return [];
      const sides = v.props.sides ?? 6;
      const count = Math.max(1, Math.min(6, v.props.count ?? 1));
      const roll: Roll = { v: Array.from({ length: count }, () => randInt(sides)), n: me.name, c: me.color, s: ((v.props.roll as Roll | null)?.s ?? 0) + 1 };
      return [[id, { roll }] as [string, Partial<NodeData>]];
    }),
  );
}

/** Точки на грани d6: позиции в сетке 3×3 (0..8). */
export const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
