<script lang="ts">
  /* Задача: флажок «готово», текст (Markdown), исполнитель, срок и
     приоритет. Флажок и срок видны всем сразу; щелчок по флажку не
     начинает редактирование. */
  import Calendar from "@lucide/svelte/icons/calendar";
  import Check from "@lucide/svelte/icons/check";
  import Flag from "@lucide/svelte/icons/flag";
  import Avatar from "../../ui/Avatar.svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { PRIORITY_LABELS } from "../model.ts";
  import EditorHost from "../ui/EditorHost.svelte";
  import { markdownOf, toggleTask } from "./cache.ts";
  import type { NodeCompProps } from "./types.ts";
  import { dueInfo } from "./task.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const html = $derived(editing ? "" : markdownOf(v));
  const due = $derived(p.due ? dueInfo(p.due, !!p.done) : null);
  const size = $derived(p.size ?? "m");

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (b.readonly) return;
    b.view.update(v.id, { done: p.done ? undefined : true });
  }

  function onclick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.classList.contains("task")) {
      e.preventDefault();
      if (!b.readonly) toggleTask(b.view, v, Number(t.dataset.line));
    }
  }
</script>

<div class="card task-card" class:done={p.done}>
  <div class="task-row">
    <button class="task-check" class:on={p.done} data-ui onclick={toggle} aria-label={p.done ? "Вернуть в работу" : "Готово"} aria-pressed={!!p.done}>
      {#if p.done}<Check size={14} strokeWidth={3} />{/if}
    </button>
    <div class="note-body task-text {size}" {onclick}>
      {#if editing}
        <EditorHost {v} mode="markdown" placeholder="Что нужно сделать?" />
      {:else if html}
        <div class="md">{@html html}</div>
      {:else}
        <div class="placeholder">Новая задача</div>
      {/if}
    </div>
  </div>
  {#if p.who || due || p.prio}
    <div class="task-meta">
      {#if p.prio}
        <span class="chip-s prio-{p.prio}" {@attach tip(`Приоритет: ${PRIORITY_LABELS[p.prio].toLowerCase()}`)}><Flag size={12} strokeWidth={2.4} />{PRIORITY_LABELS[p.prio]}</span>
      {/if}
      {#if due}
        <span class="chip-s due" class:late={due.late} class:soon={due.soon} {@attach tip(due.full)}><Calendar size={12} strokeWidth={2.2} />{due.short}</span>
      {/if}
      {#if p.who}
        <span class="who" {@attach tip(`Исполнитель: ${p.who.name}`)}><Avatar name={p.who.name} color={p.who.color} size={20} title="" /></span>
      {/if}
    </div>
  {/if}
</div>
