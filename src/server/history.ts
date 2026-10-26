/* История доски: снимки состояния.

   Снимок делается после ~10 минут активности, при выгрузке доски из памяти
   (все ушли) и перед каждым восстановлением. Старые снимки прореживаются:
   последние 48 часов — все, до 30 дней — по одному на час, дальше — по
   одному на день. Снимки с подписью (сохранённые вручную) не удаляются. */
import * as Y from "yjs";
import { nodesOf } from "../shared/doc.ts";
import type { SnapshotInfo, UserRef } from "../shared/types.ts";
import { now, q } from "./db.ts";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
export const SNAPSHOT_EVERY = 10 * 60_000;

interface Tracker {
  /** Были правки после последнего снимка. */
  dirty: boolean;
  lastAt: number;
  authors: Map<string, UserRef>;
}

const trackers = new Map<string, Tracker>();

function tracker(boardId: string): Tracker {
  let t = trackers.get(boardId);
  if (!t) {
    const last = q("SELECT MAX(created_at) AS at FROM snapshots WHERE board_id = ?").get(boardId) as {
      at: number | null;
    };
    t = { dirty: false, lastAt: last.at ?? 0, authors: new Map() };
    trackers.set(boardId, t);
  }
  return t;
}

export function noteChange(boardId: string, author: UserRef | undefined): void {
  const t = tracker(boardId);
  t.dirty = true;
  if (author) t.authors.set(author.id, author);
}

export function takeSnapshot(boardId: string, doc: Y.Doc, label: string | null = null): number {
  const t = tracker(boardId);
  const state = Y.encodeStateAsUpdate(doc);
  const at = now();
  const res = q(
    "INSERT INTO snapshots (board_id, created_at, authors, nodes, label, state) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(boardId, at, JSON.stringify([...t.authors.values()]), nodesOf(doc).size, label, state);
  t.dirty = false;
  t.lastAt = at;
  t.authors.clear();
  prune(boardId);
  return Number(res.lastInsertRowid);
}

/** Вызывается при каждом сохранении доски. */
export function maybeSnapshot(boardId: string, doc: Y.Doc): void {
  const t = tracker(boardId);
  if (t.dirty && now() - t.lastAt >= SNAPSHOT_EVERY) takeSnapshot(boardId, doc);
}

/** Доска выгружается из памяти: зафиксировать несохранённое в истории. */
export function finalSnapshot(boardId: string, doc: Y.Doc): void {
  const t = trackers.get(boardId);
  if (t?.dirty) takeSnapshot(boardId, doc);
  trackers.delete(boardId);
}

export function prune(boardId: string): void {
  const rows = q("SELECT id, created_at, label FROM snapshots WHERE board_id = ? ORDER BY created_at DESC").all(
    boardId,
  ) as unknown as { id: number; created_at: number; label: string | null }[];
  const t = now();
  const buckets = new Set<string>();
  const drop: number[] = [];
  for (const r of rows) {
    const age = t - r.created_at;
    if (r.label || age < 48 * HOUR) continue;
    const key = age < 30 * DAY ? `h${Math.floor(r.created_at / HOUR)}` : `d${Math.floor(r.created_at / DAY)}`;
    if (buckets.has(key)) drop.push(r.id);
    else buckets.add(key);
  }
  for (const id of drop) q("DELETE FROM snapshots WHERE id = ?").run(id);
}

export function listSnapshots(boardId: string): SnapshotInfo[] {
  const rows = q(
    "SELECT id, created_at, authors, nodes, label FROM snapshots WHERE board_id = ? ORDER BY created_at DESC LIMIT 1000",
  ).all(boardId) as unknown as { id: number; created_at: number; authors: string; nodes: number; label: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    authors: safeAuthors(r.authors),
    nodes: r.nodes,
    label: r.label,
  }));
}

function safeAuthors(s: string): UserRef[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function snapshotState(boardId: string, snapshotId: number): Uint8Array | null {
  const row = q("SELECT state FROM snapshots WHERE id = ? AND board_id = ?").get(snapshotId, boardId) as
    | { state: Uint8Array }
    | undefined;
  return row?.state ?? null;
}

export function snapshotDoc(boardId: string, snapshotId: number): Y.Doc | null {
  const state = snapshotState(boardId, snapshotId);
  if (!state) return null;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

export function labelSnapshot(boardId: string, snapshotId: number, label: string | null): void {
  q("UPDATE snapshots SET label = ? WHERE id = ? AND board_id = ?").run(label, snapshotId, boardId);
}
