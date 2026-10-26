/* Опрос: варианты — список {id, t}; голос человека — поле vote:<id>. */
import { nanoid } from "nanoid";
import type { Board } from "../board.svelte.ts";
import { voteKey, type NodeData, type PollOption, type Vote } from "../model.ts";
import type { NodeView } from "../store.svelte.ts";

export interface PollRow extends PollOption {
  n: number;
  pct: number;
  mine: boolean;
  lead: boolean;
  voters: { id: string; n: string; c: string }[];
}

export function votesOf(v: NodeView): Map<string, Vote> {
  const out = new Map<string, Vote>();
  for (const [k, x] of Object.entries(v.props as Record<string, unknown>)) {
    if (!k.startsWith("vote:")) continue;
    const vote = x as Vote;
    if (vote && Array.isArray(vote.o)) out.set(k.slice(5), vote);
  }
  return out;
}

export function pollResults(v: NodeView, me: string): { rows: PollRow[]; total: number; people: number } {
  const opts = v.props.opts ?? [];
  const votes = votesOf(v);
  const count = new Map<string, PollRow["voters"]>();
  let total = 0;
  for (const [uid, vote] of votes) {
    for (const o of vote.o) {
      if (!opts.some((x) => x.id === o)) continue;
      let l = count.get(o);
      if (!l) count.set(o, (l = []));
      l.push({ id: uid, n: vote.n, c: vote.c });
      total++;
    }
  }
  const max = Math.max(0, ...[...count.values()].map((l) => l.length));
  const mine = new Set(votes.get(me)?.o ?? []);
  const rows = opts.map((o) => {
    const voters = count.get(o.id) ?? [];
    return { ...o, n: voters.length, pct: total ? (voters.length / Math.max(1, [...votes.values()].length)) * 100 : 0, mine: mine.has(o.id), lead: max > 0 && voters.length === max, voters };
  });
  return { rows, total, people: [...votes.values()].filter((x) => x.o.length).length };
}

export function vote(b: Board, v: NodeView, option: string) {
  const me = b.me;
  const cur = votesOf(v).get(me.id)?.o ?? [];
  let next: string[];
  if (cur.includes(option)) next = cur.filter((x) => x !== option);
  else next = v.props.multi ? [...cur, option] : [option];
  b.view.update(v.id, { [voteKey(me.id)]: next.length ? { o: next, n: me.name, c: me.color } : undefined } as Partial<NodeData>);
}

export function addOption(b: Board, v: NodeView, t: string) {
  const opts = [...(v.props.opts ?? []), { id: nanoid(6), t }];
  b.view.update(v.id, { opts });
  v.ownsHeight = true;
}

export function renameOption(b: Board, v: NodeView, id: string, t: string) {
  b.view.update(v.id, { opts: (v.props.opts ?? []).map((o) => (o.id === id ? { ...o, t } : o)) });
}

export function removeOption(b: Board, v: NodeView, id: string) {
  const opts = (v.props.opts ?? []).filter((o) => o.id !== id);
  if (!opts.length) return;
  b.view.update(v.id, { opts });
  v.ownsHeight = true;
}

/** Сбросить все голоса. */
export function clearVotes(b: Board, v: NodeView) {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(v.props)) if (k.startsWith("vote:")) patch[k] = undefined;
  b.view.update(v.id, patch as Partial<NodeData>);
}

export function pollData(question: string, options: string[], multi = false): Partial<NodeData> {
  return { text: question, opts: options.map((t) => ({ id: nanoid(6), t })), multi: multi || undefined };
}
