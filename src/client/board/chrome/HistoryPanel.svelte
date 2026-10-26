<script lang="ts">
  import { ask } from "../../ui/confirm.svelte.ts";
  /* История версий: снимки доски по времени. Щелчок — посмотреть снимок
     прямо на холсте (только чтение), затем восстановить целиком, только
     выделенное или открыть копией в новой доске. */
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import Eye from "@lucide/svelte/icons/eye";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import Pencil from "@lucide/svelte/icons/pencil";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Save from "@lucide/svelte/icons/save";
  import X from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";
  import * as Y from "yjs";
  import type { BoardSummary, SnapshotInfo } from "../../../shared/types.ts";
  import { api } from "../../lib/api.ts";
  import { boardUrl, router } from "../../lib/router.svelte.ts";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { dateTime, dayLabel, plural, timeOnly } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import { focusSelect } from "../../ui/portal.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { withChildren } from "../ops.ts";
  import { BoardStore } from "../store.svelte.ts";

  const b = useBoard();
  const canEdit = $derived(b.role !== "viewer");
  let list = $state<SnapshotInfo[]>([]);
  let loading = $state(true);
  let opening = $state<number | null>(null);
  let saving = $state(false);
  let naming = $state(false);
  let newLabel = $state("");
  let renaming = $state<number | null>(null);
  let renameText = $state("");
  let busy = $state(false);

  const groups = $derived.by(() => {
    const out: { day: string; items: SnapshotInfo[] }[] = [];
    for (const s of list) {
      const day = dayLabel(s.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(s);
      else out.push({ day, items: [s] });
    }
    return out;
  });

  async function load() {
    try {
      list = await api.get<SnapshotInfo[]>(`/api/boards/${b.id}/history`);
    } catch (e) {
      toasts.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      if (b.preview) exitPreview();
      else b.ui.history = false;
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      exitPreview();
    };
  });

  async function open(s: SnapshotInfo) {
    if (b.preview?.id === s.id) return exitPreview();
    opening = s.id;
    try {
      const bytes = await api.bytes(`/api/boards/${b.id}/history/${s.id}`);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, bytes);
      const store = new BoardStore(doc, b.me);
      store.readonly = true;
      const prev = b.preview;
      b.store.editing = null;
      b.preview = { id: s.id, createdAt: s.createdAt, store };
      if (prev) {
        prev.store.destroy();
        prev.store.doc.destroy();
      }
    } catch (e) {
      toasts.error(e);
    } finally {
      opening = null;
    }
  }

  function exitPreview() {
    const p = b.preview;
    if (!p) return;
    b.preview = null;
    p.store.destroy();
    p.store.doc.destroy();
  }

  async function restore(selectedOnly: boolean) {
    const p = b.preview;
    if (!p || busy) return;
    const ids = selectedOnly ? withChildren(b, p.store.selection.list, p.store) : undefined;
    if (selectedOnly && !ids?.length) return;
    if (
      !selectedOnly &&
      !(await ask({
        title: "Восстановить версию?",
        text: `Доска вернётся к состоянию от ${dateTime(p.createdAt)}. Текущее состояние сохранится в истории — к нему можно будет вернуться.`,
        ok: "Восстановить",
      }))
    )
      return;
    busy = true;
    try {
      const r = await api.post<{ touched: number }>(`/api/boards/${b.id}/history/${p.id}/restore`, ids ? { ids } : {});
      exitPreview();
      toasts.show(
        selectedOnly ? `Восстановлено ${r.touched} ${plural(r.touched, "объект", "объекта", "объектов")}` : "Версия восстановлена — прежнее состояние сохранено в истории",
        { kind: "ok" },
      );
      void load();
    } catch (e) {
      toasts.error(e);
    } finally {
      busy = false;
    }
  }

  async function fork() {
    const p = b.preview;
    if (!p || busy) return;
    busy = true;
    try {
      const s = await api.post<BoardSummary>(`/api/boards/${b.id}/history/${p.id}/fork`, {});
      toasts.show(`Создана доска «${s.title}»`, { kind: "ok", action: { label: "Открыть", run: () => router.go(boardUrl(s.id)) }, ms: 6000 });
    } catch (e) {
      toasts.error(e);
    } finally {
      busy = false;
    }
  }

  async function saveVersion(e: SubmitEvent) {
    e.preventDefault();
    const label = newLabel.trim() || `Версия ${timeOnly(Date.now())}`;
    saving = true;
    try {
      await api.post(`/api/boards/${b.id}/history`, { label });
      naming = false;
      newLabel = "";
      await load();
      toasts.show("Версия сохранена", { kind: "ok" });
    } catch (err) {
      toasts.error(err);
    } finally {
      saving = false;
    }
  }

  async function commitRename(id: number) {
    const label = renameText.trim();
    renaming = null;
    try {
      list = await api.patch<SnapshotInfo[]>(`/api/boards/${b.id}/history/${id}`, { label: label || null });
    } catch (e) {
      toasts.error(e);
    }
  }

  const previewSel = $derived(b.preview ? b.preview.store.selection.size : 0);
</script>

<aside class="history panel" aria-label="История версий">
  <header>
    <h2>История версий</h2>
    <button class="icon-btn sm" aria-label="Закрыть" onclick={() => (b.ui.history = false)}><X size={17} /></button>
  </header>

  {#if canEdit}
    <div class="save">
      {#if naming}
        <form onsubmit={saveVersion}>
          <input
            class="input sm"
            bind:value={newLabel}
            placeholder="Название версии"
            maxlength="120"
            {@attach focusSelect}
            onkeydown={(e) => {
              if (e.key === "Escape") {
                naming = false;
                e.stopPropagation();
              }
            }}
          />
          <button class="btn primary sm" disabled={saving}>Сохранить</button>
        </form>
      {:else}
        <button class="btn sm block" onclick={() => (naming = true)}><Save size={15} /> Сохранить текущую версию</button>
      {/if}
    </div>
  {/if}

  <div class="list">
    {#if loading}
      <div class="empty"><div class="spin"></div></div>
    {:else if !list.length}
      <div class="empty">Снимков пока нет. Они появляются сами по ходу работы — примерно раз в несколько минут правок.</div>
    {:else}
      {#each groups as g (g.day)}
        <div class="day">{g.day}</div>
        {#each g.items as s (s.id)}
          <div class="snap" class:active={b.preview?.id === s.id}>
            <button class="snap-main" onclick={() => void open(s)} disabled={opening !== null && opening !== s.id}>
              <div class="snap-top">
                <span class="time">{timeOnly(s.createdAt)}</span>
                {#if s.label}<span class="snap-label"><Bookmark size={12} /> {s.label}</span>{/if}
                {#if opening === s.id}<span class="spin sm"></span>{/if}
              </div>
              <div class="snap-meta">
                <span class="authors">
                  {#each s.authors.slice(0, 4) as a (a.id)}
                    <Avatar name={a.name} color={a.color} size={16} title={a.name} />
                  {/each}
                </span>
                {s.nodes}
                {plural(s.nodes, "объект", "объекта", "объектов")}
              </div>
            </button>
            {#if canEdit}
              {#if renaming === s.id}
                <input
                  class="input sm rename"
                  bind:value={renameText}
                  maxlength="120"
                  placeholder="Название"
                  {@attach focusSelect}
                  onblur={() => void commitRename(s.id)}
                  onkeydown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      renaming = null;
                      e.stopPropagation();
                    }
                  }}
                />
              {:else}
                <button
                  class="icon-btn sm rename-btn"
                  aria-label="Назвать версию"
                  onclick={() => {
                    renameText = s.label ?? "";
                    renaming = s.id;
                  }}
                  {@attach tip("Назвать версию")}><Pencil size={13} /></button
                >
              {/if}
            {/if}
          </div>
        {/each}
      {/each}
    {/if}
  </div>
</aside>

{#if b.preview}
  <div class="banner panel" role="status">
    <Eye size={16} />
    <span class="banner-text">Версия от <b>{dateTime(b.preview.createdAt)}</b> · только просмотр</span>
    {#if canEdit}
      <button class="btn primary sm" disabled={busy} onclick={() => void restore(false)}><RotateCcw size={14} /> Восстановить</button>
      {#if previewSel}
        <button class="btn sm" disabled={busy} onclick={() => void restore(true)}>Только выделенное ({previewSel})</button>
      {/if}
    {/if}
    <button class="btn sm ghost" disabled={busy} onclick={() => void fork()} {@attach tip("Открыть эту версию отдельной доской", undefined, "bottom")}>
      <GitBranch size={14} /> Копией
    </button>
    <button class="icon-btn sm" aria-label="Выйти из просмотра" onclick={exitPreview} {@attach tip("Выйти из просмотра", "Esc", "bottom")}><X size={16} /></button>
  </div>
{/if}

<style>
  .history {
    position: fixed;
    top: 66px;
    right: 10px;
    bottom: 12px;
    width: 300px;
    display: flex;
    flex-direction: column;
    z-index: var(--z-pop);
    animation: slide-in 200ms var(--ease-out);
    overflow: hidden;
  }
  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 10px 6px 16px;
  }
  h2 {
    margin: 0;
    font-size: 14.5px;
    font-weight: 640;
  }
  .save {
    padding: 4px 12px 10px;
    border-bottom: 1px solid var(--line);
  }
  .save form {
    display: flex;
    gap: 6px;
  }
  .save .input {
    flex: 1;
    min-width: 0;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px 12px;
    overscroll-behavior: contain;
  }
  .empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
    line-height: 1.5;
    display: grid;
    place-items: center;
  }
  .day {
    padding: 12px 8px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-3);
    letter-spacing: 0.02em;
    position: sticky;
    top: -4px;
    background: inherit;
  }
  .snap {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--r-2);
  }
  .snap:hover {
    background: var(--hover);
  }
  .snap.active {
    background: var(--accent-soft);
  }
  .snap-main {
    flex: 1;
    min-width: 0;
    padding: 8px;
    text-align: left;
    display: grid;
    gap: 4px;
    border-radius: var(--r-2);
  }
  .snap-top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .time {
    font-size: 13.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .snap.active .time {
    color: var(--accent);
  }
  .snap-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
    color: var(--ink-2);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .snap-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-3);
  }
  .authors {
    display: inline-flex;
    gap: 2px;
  }
  .rename-btn {
    opacity: 0;
    margin-right: 4px;
  }
  .snap:hover .rename-btn,
  .rename-btn:focus-visible {
    opacity: 1;
  }
  .rename {
    position: absolute;
    left: 6px;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
  }
  .spin.sm {
    width: 12px;
    height: 12px;
    border-width: 1.5px;
  }
  .banner {
    position: fixed;
    top: 66px;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-pop);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border-radius: var(--r-full);
    border-color: var(--accent-line);
    box-shadow:
      var(--shadow-2),
      0 0 0 4px var(--accent-soft);
    color: var(--ink-2);
    font-size: 13px;
    white-space: nowrap;
    max-width: calc(100vw - 340px);
    animation: banner-in 200ms var(--ease-out);
  }
  .banner-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .banner b {
    color: var(--ink);
    font-weight: 600;
  }
  @keyframes banner-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-6px);
    }
  }
  @media (max-width: 760px) {
    .history {
      top: auto;
      left: 8px;
      right: 8px;
      bottom: 8px;
      width: auto;
      height: 48vh;
    }
    .banner {
      top: 58px;
      max-width: calc(100vw - 16px);
      flex-wrap: wrap;
      white-space: normal;
      border-radius: var(--r-3);
      justify-content: center;
    }
  }
</style>
