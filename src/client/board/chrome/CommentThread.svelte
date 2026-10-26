<script lang="ts">
  /* Обсуждение у булавки: сообщения, ответ, «решено». Появляется, когда
     выделена одна булавка; пустая булавка исчезает, если ничего не написать. */
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import SendHorizontal from "@lucide/svelte/icons/send-horizontal";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import { tick, untrack } from "svelte";
  import { timeOnly, dayLabel } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { dropComment, pinScale, postComment, threadOf } from "../nodes/comment.ts";

  let { id }: { id: string } = $props();
  const b = useBoard();
  const cam = b.camera;
  const v = $derived(b.view.get(id));
  const thread = $derived(v ? threadOf(v.props) : []);
  let text = $state("");
  let list = $state<HTMLDivElement>();
  let input = $state<HTMLTextAreaElement>();

  const pos = $derived.by(() => {
    if (!v) return null;
    // булавка держит почти постоянный экранный размер (см. .pin в nodes.css)
    const S = v.w * cam.z * pinScale(cam.z);
    const a = cam.toScreen(v.x, v.y + v.h);
    const W = 300;
    let x = a.x + S + 12;
    if (x + W > cam.vw - 10) x = a.x - W - 12;
    const y = Math.min(Math.max(66, a.y - S - 8), cam.vh - 260);
    return { x: Math.max(10, x), y };
  });

  // пустая булавка без единого сообщения — убрать, когда обсуждение закрылось
  $effect(() => {
    const nodeId = id;
    return () =>
      untrack(() => {
        const n = b.store.get(nodeId);
        if (n && n.type === "comment" && !threadOf(n.props).length && !b.readonly) b.store.remove([nodeId]);
      });
  });

  $effect(() => {
    void thread.length;
    void tick().then(() => list && (list.scrollTop = list.scrollHeight));
  });

  function send() {
    if (!postComment(b, id, text)) return;
    text = "";
    void tick().then(autosize);
  }

  function onkey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input?.blur();
      b.store.selection.clear();
    }
  }

  function autosize() {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(140, input.scrollHeight) + "px";
  }

  const canReply = $derived(!b.readonly || (b.perms.comment && !b.preview));

  function focusInput(el: HTMLTextAreaElement) {
    if (!canReply) return;
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }

  const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
  function parts(t: string): { s: string; url?: boolean }[] {
    const out: { s: string; url?: boolean }[] = [];
    let last = 0;
    for (const m of t.matchAll(URL_RE)) {
      if (m.index! > last) out.push({ s: t.slice(last, m.index) });
      out.push({ s: m[0], url: true });
      last = m.index! + m[0].length;
    }
    if (last < t.length) out.push({ s: t.slice(last) });
    return out;
  }
  const when = (t: number) => {
    const d = dayLabel(t);
    return d === "Сегодня" ? timeOnly(t) : `${d}, ${timeOnly(t)}`;
  };
</script>

{#if v && pos}
  <div class="thread panel" style:left="{pos.x}px" style:top="{pos.y}px" role="dialog" aria-label="Комментарий" data-chrome>
    <header>
      <span class="title">{thread.length ? (v.props.resolved ? "Решено" : "Обсуждение") : "Новый комментарий"}</span>
      {#if thread.length && !b.readonly}
        {#if v.props.resolved}
          <button class="icon-btn sm" aria-label="Открыть снова" onclick={() => b.store.update(id, { resolved: undefined })} {@attach tip("Открыть снова")}><RotateCcw size={15} /></button>
        {:else}
          <button class="icon-btn sm ok" aria-label="Решено" onclick={() => (b.store.update(id, { resolved: true }), b.store.selection.clear())} {@attach tip("Решено — булавка станет неприметной")}><CircleCheck size={16} /></button>
        {/if}
        <button class="icon-btn sm" aria-label="Удалить обсуждение" onclick={() => b.store.remove([id])} {@attach tip("Удалить обсуждение")}><Trash2 size={15} /></button>
      {/if}
      <button class="icon-btn sm" aria-label="Закрыть" onclick={() => b.store.selection.clear()} {@attach tip("Закрыть", "Esc")}><X size={15} /></button>
    </header>
    {#if thread.length}
      <div class="msgs" bind:this={list}>
        {#each thread as m (m.key)}
          <div class="m">
            <Avatar name={m.n} color={m.c} size={24} />
            <div class="mb">
              <div class="mh"><b>{m.u === b.me.id ? "Вы" : m.n}</b> <time>{when(m.t)}</time></div>
              <p>{#each parts(m.x) as part, i (i)}{#if part.url}<a href={part.s} target="_blank" rel="noopener noreferrer">{part.s}</a>{:else}{part.s}{/if}{/each}</p>
            </div>
            {#if m.u === b.me.id && !b.readonly}
              <button class="del" aria-label="Удалить" onclick={() => dropComment(b, id, m.key)}><Trash2 size={12} /></button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if canReply}
      <form class="reply" onsubmit={(e) => (e.preventDefault(), send())}>
        <textarea
          bind:this={input}
          bind:value={text}
          rows="1"
          maxlength="4000"
          placeholder={thread.length ? "Ответить…" : "Комментарий…"}
          aria-label="Текст комментария"
          {@attach focusInput}
          oninput={autosize}
          onkeydown={onkey}
        ></textarea>
        <button class="icon-btn send" type="submit" disabled={!text.trim()} aria-label="Отправить"><SendHorizontal size={16} /></button>
      </form>
    {/if}
  </div>
{/if}

<style>
  .thread {
    position: fixed;
    width: 300px;
    max-height: min(480px, calc(100vh - 140px));
    display: flex;
    flex-direction: column;
    z-index: var(--z-pop);
    animation: pop-in 170ms var(--ease-out);
    transform-origin: left top;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(-4px);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 6px 6px 12px;
    border-bottom: 1px solid var(--line);
  }
  .title {
    flex: 1;
    font-size: 13px;
    font-weight: 640;
  }
  .ok:hover {
    color: var(--ok);
  }
  .msgs {
    overflow-y: auto;
    padding: 6px 10px;
    overscroll-behavior: contain;
  }
  .m {
    position: relative;
    display: flex;
    gap: 8px;
    padding: 7px 18px 7px 0;
  }
  .m :global(.avatar) {
    flex: none;
  }
  .mb {
    min-width: 0;
  }
  .mh {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 12.5px;
  }
  .mh time {
    font-size: 11px;
    color: var(--ink-4);
  }
  p {
    margin: 2px 0 0;
    font-size: 13.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  p a {
    color: var(--accent);
    text-decoration: underline;
  }
  .del {
    position: absolute;
    right: 0;
    top: 7px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    color: var(--ink-4);
    opacity: 0;
  }
  .m:hover .del {
    opacity: 1;
  }
  .del:hover {
    color: var(--danger);
  }
  .reply {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 8px 8px 8px 10px;
    border-top: 1px solid var(--line);
  }
  .thread header + .reply {
    border-top: none;
  }
  textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    max-height: 140px;
    padding: 7px 10px;
    border-radius: var(--r-2);
    border: 1px solid var(--line-2);
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: 13.5px;
    line-height: 1.4;
    outline: none;
  }
  textarea:focus {
    border-color: var(--accent-line);
  }
  .send {
    color: var(--accent);
  }
  .send:disabled {
    color: var(--ink-4);
  }
</style>
