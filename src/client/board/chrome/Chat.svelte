<script lang="ts">
  /* Чат доски: сообщения видят все участники, они сохраняются вместе с
     доской. К сообщению можно прикрепить выделенные объекты — щелчок по
     вложению покажет их на доске. */
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Paperclip from "@lucide/svelte/icons/paperclip";
  import SendHorizontal from "@lucide/svelte/icons/send-horizontal";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import { tick } from "svelte";
  import { dayLabel, plural, timeOnly } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import type { ChatMsg } from "../social.svelte.ts";

  const b = useBoard();
  const so = b.social;
  let text = $state("");
  let list: HTMLDivElement;
  let input = $state<HTMLTextAreaElement>();
  let stick = true;

  const selCount = $derived(b.store.selection.size);
  $effect(() => {
    if (!selCount) so.attach = false;
  });

  /* подряд идущие сообщения одного автора (в пределах 5 минут) — одной группой */
  const groups = $derived.by(() => {
    const out: { key: string; day: string | null; uid: string; name: string; color: string; t: number; items: ChatMsg[] }[] = [];
    let lastDay = "";
    for (const m of so.messages) {
      const day = dayLabel(m.t);
      const g = out.at(-1);
      if (g && g.uid === m.uid && m.t - g.items.at(-1)!.t < 5 * 60_000 && day === lastDay) g.items.push(m);
      else out.push({ key: m.id, day: day !== lastDay ? day : null, uid: m.uid, name: m.name, color: m.color, t: m.t, items: [m] });
      lastDay = day;
    }
    return out;
  });

  // новые сообщения — прокрутка вниз, если и так были внизу
  $effect(() => {
    void so.messages;
    if (!stick) return;
    void tick().then(() => list && (list.scrollTop = list.scrollHeight));
  });

  function onscroll() {
    stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  }

  function send() {
    const refs = so.attach ? b.store.selection.list : [];
    if (!so.send(text, refs)) return;
    text = "";
    so.attach = false;
    stick = true;
    void tick().then(autosize);
  }

  function onkey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      b.ui.chat = false;
    }
  }

  function autosize() {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(120, input.scrollHeight) + "px";
  }

  /* ссылки в тексте — кликабельные (текст выводится как текст, не HTML) */
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

  function focusInput(el: HTMLTextAreaElement) {
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }
</script>

<aside class="chat panel" aria-label="Чат доски">
  <header>
    <h2><MessageCircle size={16} /> Чат доски</h2>
    <span class="online">
      {#if b.people.length}{b.people.length + 1} {plural(b.people.length + 1, "участник", "участника", "участников")} онлайн{:else}только вы{/if}
    </span>
    <button class="icon-btn sm" aria-label="Закрыть чат" onclick={() => (b.ui.chat = false)} {@attach tip("Закрыть", "Esc", "bottom")}><X size={16} /></button>
  </header>

  <div class="list" bind:this={list} {onscroll}>
    {#if !so.messages.length}
      <div class="empty">
        <div class="empty-ic"><MessageCircle size={22} /></div>
        Обсуждайте доску прямо здесь. Сообщения видят все участники, они сохраняются вместе с доской.
        <small>Быстрое сообщение у курсора — клавиша <span class="kbd"><span>/</span></span></small>
      </div>
    {/if}
    {#each groups as g (g.key)}
      {#if g.day}<div class="day"><span>{g.day}</span></div>{/if}
      <div class="group" class:mine={g.uid === b.me.id}>
        <Avatar name={g.name} color={g.color} size={26} />
        <div class="body">
          <div class="who"><b style:color={g.color}>{g.uid === b.me.id ? "Вы" : g.name}</b> <time>{timeOnly(g.t)}</time></div>
          {#each g.items as m (m.id)}
            <div class="msg">
              <p>
                {#each parts(m.text) as part, i (i)}{#if part.url}<a href={part.s} target="_blank" rel="noopener noreferrer">{part.s}</a>{:else}{part.s}{/if}{/each}
              </p>
              {#if m.refs?.length}
                <button class="ref" onclick={() => so.reveal(m.refs!)}>
                  <Paperclip size={12} /> Показать {m.refs.length} {plural(m.refs.length, "объект", "объекта", "объектов")}
                </button>
              {/if}
              {#if m.uid === b.me.id && so.canWrite}
                <button class="del" aria-label="Удалить сообщение" onclick={() => so.remove(m.id)} {@attach tip("Удалить")}><Trash2 size={13} /></button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if so.canWrite}
    <form class="compose" onsubmit={(e) => (e.preventDefault(), send())}>
      {#if selCount}
        <button
          type="button"
          class="attach"
          class:on={so.attach}
          onclick={() => (so.attach = !so.attach)}
          aria-pressed={so.attach}
          {@attach tip(so.attach ? "Не прикреплять" : "Прикрепить выделенное — по щелчку все увидят эти объекты")}
        >
          <Paperclip size={13} />
          {so.attach ? "Прикреплено" : "Прикрепить"}: {selCount} {plural(selCount, "объект", "объекта", "объектов")}
        </button>
      {/if}
      <div class="row">
        <textarea
          bind:this={input}
          bind:value={text}
          rows="1"
          maxlength="2000"
          placeholder="Сообщение…"
          aria-label="Сообщение"
          {@attach focusInput}
          oninput={autosize}
          onkeydown={onkey}
        ></textarea>
        <button class="icon-btn send" type="submit" disabled={!text.trim()} aria-label="Отправить" {@attach tip("Отправить", "Enter")}>
          <SendHorizontal size={17} />
        </button>
      </div>
    </form>
  {:else}
    <div class="ro">Писать в чат могут участники с правом редактирования</div>
  {/if}
</aside>

<style>
  .chat {
    position: fixed;
    top: 66px;
    right: 10px;
    bottom: 12px;
    width: 320px;
    display: flex;
    flex-direction: column;
    /* под верхней панелью: её всплывающие (реакции, меню) — поверх чата */
    z-index: calc(var(--z-chrome) - 1);
    overflow: hidden;
    animation: slide-in 220ms var(--ease-out);
  }
  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateX(14px);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 8px 8px 14px;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: 14.5px;
    font-weight: 640;
  }
  .online {
    flex: 1;
    font-size: 12px;
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px 12px;
    overscroll-behavior: contain;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 36px 14px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
    line-height: 1.5;
  }
  .empty small {
    font-size: 12px;
    color: var(--ink-4);
  }
  .empty-ic {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .day {
    display: flex;
    justify-content: center;
    margin: 10px 0 4px;
  }
  .day span {
    padding: 2px 9px;
    border-radius: 99px;
    background: var(--surface-2);
    color: var(--ink-3);
    font-size: 11px;
  }
  .group {
    display: flex;
    gap: 9px;
    padding: 6px 2px;
    animation: msg-in 200ms var(--ease-out);
  }
  @keyframes msg-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .group :global(.avatar) {
    flex: none;
    margin-top: 2px;
  }
  .body {
    min-width: 0;
    flex: 1;
  }
  .who {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12.5px;
  }
  .who b {
    font-weight: 650;
  }
  .who time {
    font-size: 11px;
    color: var(--ink-4);
  }
  .msg {
    position: relative;
    padding-right: 22px;
  }
  .msg p {
    margin: 2px 0 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .msg a {
    color: var(--accent);
    text-decoration: underline;
    text-decoration-color: var(--accent-line);
  }
  .ref {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    padding: 3px 9px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 550;
  }
  .ref:hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }
  .del {
    position: absolute;
    right: 0;
    top: 1px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    color: var(--ink-4);
    opacity: 0;
    transition: opacity var(--t-fast);
  }
  .msg:hover .del {
    opacity: 1;
  }
  .del:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  .compose {
    display: grid;
    gap: 6px;
    padding: 8px 10px 10px;
    border-top: 1px solid var(--line);
  }
  .attach {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 99px;
    border: 1px dashed var(--line-3);
    color: var(--ink-3);
    font-size: 12px;
  }
  .attach.on {
    border-style: solid;
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    max-height: 120px;
    padding: 8px 11px;
    border-radius: var(--r-2);
    border: 1px solid var(--line-2);
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: 13.5px;
    line-height: 1.4;
    outline: none;
    transition: border-color var(--t-fast);
  }
  textarea:focus {
    border-color: var(--accent-line);
  }
  .send {
    flex: none;
    color: var(--accent);
  }
  .send:disabled {
    color: var(--ink-4);
  }
  .ro {
    padding: 12px 14px;
    border-top: 1px solid var(--line);
    font-size: 12.5px;
    color: var(--ink-3);
    text-align: center;
  }
  @media (max-width: 760px) {
    .chat {
      top: auto;
      left: 8px;
      right: 8px;
      bottom: 8px;
      width: auto;
      height: 56vh;
    }
  }
</style>
