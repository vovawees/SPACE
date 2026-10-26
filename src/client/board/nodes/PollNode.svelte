<script lang="ts">
  /* Опрос: вопрос и варианты. Голосовать можно сразу, щелчком по
     варианту, даже не выделяя карточку. Голос каждого — отдельное поле,
     поэтому одновременные голоса не теряются. Двойной щелчок — правка. */
  import Check from "@lucide/svelte/icons/check";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import { plural } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import EditorHost from "../ui/EditorHost.svelte";
  import { markdownOf } from "./cache.ts";
  import { addOption, pollResults, removeOption, renameOption, vote } from "./poll.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const html = $derived(editing ? "" : markdownOf(v));
  const res = $derived(pollResults(v, b.me.id));

  function choose(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (b.readonly) return;
    vote(b, v, id);
  }

  function optKey(e: KeyboardEvent, i: number) {
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "Escape") {
      e.preventDefault();
      b.ix.stopEditing();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opts = p.opts ?? [];
      if (i === opts.length - 1 && el.value.trim()) {
        addOption(b, v, "");
        requestAnimationFrame(() => focusOpt(i + 1));
      } else focusOpt(i + 1);
    } else if (e.key === "Backspace" && !el.value && (p.opts?.length ?? 0) > 2) {
      e.preventDefault();
      removeOption(b, v, p.opts![i]!.id);
      requestAnimationFrame(() => focusOpt(Math.max(0, i - 1)));
    }
  }

  function focusOpt(i: number) {
    const el = document.querySelector<HTMLInputElement>(`[data-id="${v.id}"] [data-opt="${i}"]`);
    el?.focus();
  }
</script>

<div class="card poll-card">
  <div class="note-body poll-q">
    {#if editing}
      <EditorHost {v} mode="markdown" placeholder="Вопрос" />
    {:else if html}
      <div class="md">{@html html}</div>
    {:else}
      <div class="placeholder">Вопрос</div>
    {/if}
  </div>
  <div class="poll-opts">
    {#if editing}
      {#each p.opts ?? [] as o, i (o.id)}
        <div class="poll-edit" data-ui>
          <input class="opt-in" data-opt={i} value={o.t} placeholder="Вариант {i + 1}" oninput={(e) => renameOption(b, v, o.id, e.currentTarget.value)} onkeydown={(e) => optKey(e, i)} />
          <button class="icon-btn sm" onclick={() => removeOption(b, v, o.id)} aria-label="Убрать вариант" disabled={(p.opts?.length ?? 0) <= 1}><X size={13} /></button>
        </div>
      {/each}
      <div class="poll-tools" data-ui>
        <button class="btn ghost sm" onclick={() => addOption(b, v, "")}><Plus size={14} /> Вариант</button>
        <button class="btn ghost sm" class:on={!!p.multi} onclick={() => b.view.update(v.id, { multi: p.multi ? undefined : true })}>
          {#if p.multi}<Check size={14} />{/if} Несколько ответов
        </button>
      </div>
    {:else}
      {#each res.rows as r (r.id)}
        <button class="poll-opt" class:mine={r.mine} class:lead={r.lead} data-ui onclick={(e) => choose(e, r.id)} disabled={b.readonly}>
          <span class="poll-bar" style:width="{r.pct}%"></span>
          <span class="poll-mark">{#if r.mine}<Check size={12} strokeWidth={3} />{/if}</span>
          <span class="poll-label">{r.t || "Без названия"}</span>
          <span class="poll-voters">
            {#each r.voters.slice(0, 4) as u (u.id)}
              <span class="poll-av" {@attach tip(u.n)}><Avatar name={u.n} color={u.c} size={18} title="" /></span>
            {/each}
            {#if r.voters.length > 4}<span class="poll-more">+{r.voters.length - 4}</span>{/if}
          </span>
          <span class="poll-n">{r.n}</span>
        </button>
      {/each}
      <div class="poll-foot">
        {res.total ? `${res.people} ${plural(res.people, "голос", "голоса", "голосов")}` : "Пока никто не голосовал"}{p.multi ? " · можно несколько" : ""}
      </div>
    {/if}
  </div>
</div>
