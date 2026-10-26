<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { ask } from "../../ui/confirm.svelte.ts";
  /* Верхняя панель: домой, название, связь; справа — люди, доступ, история, меню. */
  import CloudOff from "@lucide/svelte/icons/cloud-off";
  import Copy from "@lucide/svelte/icons/copy";
  import Download from "@lucide/svelte/icons/download";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Eye from "@lucide/svelte/icons/eye";
  import House from "@lucide/svelte/icons/house";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import Megaphone from "@lucide/svelte/icons/megaphone";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";
  import SmilePlus from "@lucide/svelte/icons/smile-plus";
  import Palette from "@lucide/svelte/icons/palette";
  import RotateCcwClock from "@lucide/svelte/icons/rotate-ccw-clock";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import Share2 from "@lucide/svelte/icons/share-2";
  import Trash from "@lucide/svelte/icons/trash";
  import type { BoardSummary } from "../../../shared/types.ts";
  import { api } from "../../lib/api.ts";
  import { boardUrl, router } from "../../lib/router.svelte.ts";
  import { session } from "../../lib/session.svelte.ts";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { download } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import { menu, type MenuEntry } from "../../ui/menu.svelte.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { backdropItems } from "../menus.ts";
  import { REACTIONS } from "../social.svelte.ts";

  const b = useBoard();
  const s = b.store;

  let title = $state(s.title);
  let editingTitle = $state(false);
  $effect(() => {
    const t = s.title;
    if (!editingTitle) title = t;
  });

  function commit() {
    editingTitle = false;
    const t = title.trim();
    if (t !== s.title && !b.readonly) s.setTitle(t);
    title = t || s.title;
  }

  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") {
      title = s.title;
      editingTitle = false;
      (e.currentTarget as HTMLInputElement).blur();
    }
    e.stopPropagation();
  }

  /* связь: «подключение» показываем, только если оно затянулось */
  let slow = $state(false);
  $effect(() => {
    if (b.status === "online") {
      slow = false;
      return;
    }
    const t = setTimeout(() => (slow = true), 1500);
    return () => clearTimeout(t);
  });
  const offline = $derived(b.status !== "online" && slow);

  const people = $derived(b.people);
  // на телефоне места мало: один аватар и «+N»
  const narrow = new MediaQuery("max-width: 640px");
  const shown = $derived(people.slice(0, narrow.current ? 1 : 4));

  function follow(clientId: number) {
    b.following = b.following === clientId ? null : clientId;
    if (b.following !== null) {
      const p = people.find((x) => x.clientId === clientId);
      if (p && !p.view) toasts.show(`${p.user.name} пока ничего не показывает`);
    }
  }

  function morePeople(e: MouseEvent) {
    menu.dropdown(
      e.currentTarget as HTMLElement,
      [
        { heading: "Следовать за участником" },
        ...people.map((p) => ({ label: p.user.name, checked: b.following === p.clientId, run: () => follow(p.clientId) })),
        "-",
        { label: "Позвать всех ко мне", icon: Megaphone, run: () => b.social.summon() },
      ],
      "bottom-end",
    );
  }

  /* общение: чат, реакции */
  const so = b.social;
  let reactOpen = $state(false);
  let reactWrap = $state<HTMLElement>();

  function toggleChat() {
    b.ui.chat = !b.ui.chat;
    if (b.ui.chat) b.ui.history = false;
  }

  $effect(() => {
    if (!reactOpen) return;
    const away = (e: PointerEvent) => {
      if (!reactWrap?.contains(e.target as Node)) reactOpen = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        reactOpen = false;
      }
    };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
    return () => {
      removeEventListener("pointerdown", away, true);
      removeEventListener("keydown", esc, true);
    };
  });

  const owner = $derived(b.role === "owner");

  async function duplicateBoard() {
    try {
      const copy = await api.post<BoardSummary>(`/api/boards/${b.id}/duplicate`, {});
      toasts.show("Копия создана", { kind: "ok" });
      router.go(boardUrl(copy.id));
    } catch (e) {
      toasts.error(e);
    }
  }

  async function deleteBoard() {
    const name = s.title || "Без названия";
    const yes = await ask(
      owner
        ? { title: "Удалить доску?", text: `«${name}» удалится у всех участников вместе с историей. Это нельзя отменить.`, ok: "Удалить", danger: true }
        : { title: "Покинуть доску?", text: `«${name}» пропадёт из ваших досок. Вернуться можно по ссылке, если она открыта.`, ok: "Покинуть", danger: true },
    );
    if (!yes) return;
    try {
      await api.del(`/api/boards/${b.id}`);
      router.go("/");
    } catch (e) {
      toasts.error(e);
    }
  }

  function openMenu(e: MouseEvent) {
    const st = session.settings;
    const toggle = (label: string, key: "grid" | "snap" | "glow" | "minimap") => ({ label, checked: st[key], run: () => (st[key] = !st[key]) });
    const items: MenuEntry[] = [
      { label: "Мои доски", icon: House, run: () => router.go("/") },
      { label: "Найти на доске", icon: Search, keys: "Mod+F", run: () => (b.ui.search = true) },
      { label: "История версий", icon: RotateCcwClock, run: () => ((b.ui.history = true), (b.ui.chat = false)) },
      "-",
      { label: "Чат доски", icon: MessageCircle, keys: "M", run: toggleChat },
      { label: "Сообщение у курсора", icon: MessageSquareText, keys: "/", run: () => so.openSay() },
      { label: "Позвать всех ко мне", icon: Megaphone, run: () => so.summon() },
      "-",
      { label: "Скачать файл доски", icon: Download, run: () => download(`/api/boards/${b.id}/export`, `${name()}.space`) },
      { label: "Создать копию", icon: Copy, run: () => void duplicateBoard() },
      "-",
      {
        label: "Вид",
        icon: Eye,
        items: [toggle("Сетка", "grid"), toggle("Прилипание", "snap"), toggle("Свечение под группами", "glow"), toggle("Мини-карта", "minimap")],
      },
      {
        label: "Фон доски",
        icon: Palette,
        items: backdropItems(b),
      },
      { label: "Горячие клавиши", icon: Keyboard, keys: "?", run: () => (b.ui.shortcuts = true) },
      { label: "Настройки", icon: Settings, run: () => (b.ui.settings = true) },
      "-",
      { label: owner ? "Удалить доску" : "Покинуть доску", icon: Trash, danger: true, run: () => void deleteBoard() },
    ];
    menu.dropdown(e.currentTarget as HTMLElement, items, "bottom-end");
  }

  const name = () => (s.title || "Без названия").replace(/[\\/:*?"<>|]+/g, "_");
</script>

<div class="bar left panel" class:tight={narrow.current && people.length > 1}>
  <button class="icon-btn" aria-label="Мои доски" onclick={() => router.go("/")} {@attach tip("Мои доски", undefined, "bottom")}>
    <House size={18} />
  </button>
  <div class="sep"></div>
  {#if b.readonly && !b.preview}
    <span class="title static">{s.title || "Без названия"}</span>
    <span class="badge" {@attach tip("У вас доступ только для просмотра", undefined, "bottom")}><Eye size={13} /> Просмотр</span>
  {:else}
    <input
      class="title"
      bind:value={title}
      placeholder="Без названия"
      maxlength="120"
      spellcheck="false"
      aria-label="Название доски"
      disabled={b.readonly}
      onfocus={(e) => {
        editingTitle = true;
        e.currentTarget.select();
      }}
      onblur={commit}
      onkeydown={onTitleKey}
    />
  {/if}
  {#if offline}
    <span
      class="badge warn"
      {@attach tip(b.status === "offline" ? "Нет связи с сервером. Правки сохраняются на устройстве и уйдут, когда связь вернётся." : "Подключаемся к серверу…", undefined, "bottom")}
    >
      {#if b.status === "offline"}<CloudOff size={13} /> Офлайн{:else}<span class="spin sm"></span> Связь{/if}
    </span>
  {/if}
</div>

<div class="bar right panel">
  {#if people.length}
    <div class="people">
      {#each shown as p (p.clientId)}
        <button
          class="person"
          class:following={b.following === p.clientId}
          style:--pc={p.user.color}
          onclick={() => follow(p.clientId)}
          aria-label={b.following === p.clientId ? `Перестать следовать за ${p.user.name}` : `Следовать за ${p.user.name}`}
          {@attach tip(b.following === p.clientId ? `Перестать следовать за ${p.user.name}` : `${p.user.name} — следовать`, undefined, "bottom")}
        >
          <Avatar name={p.user.name} color={p.user.color} size={26} ring={b.following === p.clientId} />
        </button>
      {/each}
      {#if people.length > shown.length}
        <button class="more-people" onclick={morePeople}>+{people.length - shown.length}</button>
      {/if}
    </div>
    <div class="sep"></div>
  {/if}
  <div class="react-wrap" bind:this={reactWrap}>
    <button class="icon-btn" aria-label="Реакции" aria-expanded={reactOpen} class:on={reactOpen} onclick={() => (reactOpen = !reactOpen)} {@attach tip("Реакции", undefined, "bottom")}>
      <SmilePlus size={18} />
    </button>
    {#if reactOpen}
      <div class="react-bar panel" role="toolbar" aria-label="Реакции">
        {#each REACTIONS as e (e)}
          <button class="emo" aria-label={e} onclick={() => so.react(e)}>{e}</button>
        {/each}
        <div class="react-more">
          <button class="btn ghost sm" onclick={() => ((reactOpen = false), so.openSay())}><MessageSquareText size={14} /> Сообщение у курсора <span class="kbd"><span>/</span></span></button>
          <button class="btn ghost sm" onclick={() => ((reactOpen = false), so.summon())}><Megaphone size={14} /> Позвать всех</button>
        </div>
      </div>
    {/if}
  </div>
  <div class="chat-wrap">
    <button class="icon-btn" aria-label="Чат доски" onclick={toggleChat} class:on={b.ui.chat} {@attach tip("Чат доски", "M", "bottom")}>
      <MessageCircle size={18} />
      {#if so.unread}<span class="unread">{so.unread > 9 ? "9+" : so.unread}</span>{/if}
    </button>
    {#if so.incoming && !b.ui.chat}
      <button class="incoming panel" onclick={toggleChat} style:--pc={so.incoming.color}>
        <b>{so.incoming.name}</b>
        <span>{so.incoming.text}</span>
      </button>
    {/if}
  </div>
  <button
    class="icon-btn hist"
    aria-label="История версий"
    onclick={() => ((b.ui.history = !b.ui.history), b.ui.history && (b.ui.chat = false))}
    class:on={b.ui.history}
    {@attach tip("История версий", undefined, "bottom")}
  >
    <RotateCcwClock size={18} />
  </button>
  <button class="btn primary sm share" onclick={() => (b.ui.share = true)}>
    <Share2 size={15} />
    <span class="share-label">Поделиться</span>
  </button>
  <button class="icon-btn" aria-label="Меню доски" onclick={openMenu} {@attach tip("Меню", undefined, "bottom")}>
    <Ellipsis size={18} />
  </button>
</div>

<style>
  .bar {
    position: fixed;
    top: 10px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    height: 46px;
    max-width: calc(50vw - 16px);
  }
  .left {
    left: 10px;
  }
  .right {
    right: 10px;
  }
  .sep {
    width: 1px;
    height: 22px;
    background: var(--line-2);
    margin: 0 4px;
    flex: none;
  }
  .title {
    min-width: 60px;
    width: 220px;
    field-sizing: content;
    max-width: min(360px, calc(50vw - 140px));
    height: 34px;
    padding: 0 8px;
    border-radius: var(--r-1);
    background: transparent;
    border: 1px solid transparent;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
    text-overflow: ellipsis;
    transition:
      background var(--t-fast),
      border-color var(--t-fast);
  }
  input.title:hover:not(:disabled) {
    background: var(--hover);
  }
  input.title:focus {
    background: var(--surface-2);
    border-color: var(--accent-line);
    outline: none;
  }
  input.title::placeholder {
    color: var(--ink-3);
  }
  .title.static {
    display: inline-flex;
    align-items: center;
    width: auto;
    white-space: nowrap;
    overflow: hidden;
  }
  .badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    margin: 0 4px;
    border-radius: var(--r-full);
    font-size: 12px;
    font-weight: 560;
    color: var(--ink-2);
    background: var(--surface-3);
  }
  .badge.warn {
    color: #e9b45c;
    background: rgb(233 180 92 / 0.13);
  }
  .spin.sm {
    width: 11px;
    height: 11px;
    border-width: 1.5px;
  }
  .people {
    display: flex;
    align-items: center;
    padding: 0 4px;
  }
  .person {
    margin-left: -6px;
    border-radius: 50%;
    padding: 2px;
    background: var(--surface-1);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .person:first-child {
    margin-left: 0;
  }
  .person:hover {
    transform: translateY(-1px);
    z-index: 1;
  }
  .person.following {
    box-shadow: 0 0 0 2px var(--pc);
    z-index: 2;
  }
  .more-people {
    margin-left: 4px;
    height: 26px;
    min-width: 26px;
    padding: 0 6px;
    border-radius: var(--r-full);
    background: var(--surface-3);
    color: var(--ink-2);
    font-size: 11.5px;
    font-weight: 600;
  }
  .share {
    margin: 0 4px;
  }
  .react-wrap,
  .chat-wrap {
    position: relative;
  }
  .unread {
    position: absolute;
    top: 3px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 99px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    box-shadow: 0 0 0 2px var(--panel);
    animation: pop 260ms var(--ease-spring);
  }
  @keyframes pop {
    from {
      scale: 0.4;
    }
  }
  .react-bar {
    position: absolute;
    top: calc(100% + 10px);
    right: -6px;
    display: grid;
    grid-template-columns: repeat(6, 38px);
    gap: 2px;
    padding: 6px;
    z-index: var(--z-pop);
    animation: drop 160ms var(--ease-out);
    transform-origin: top right;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }
  }
  .emo {
    width: 38px;
    height: 38px;
    border-radius: var(--r-2);
    font-size: 22px;
    line-height: 1;
    transition:
      transform 140ms var(--ease-spring),
      background var(--t-fast);
  }
  .emo:hover {
    background: var(--hover);
    transform: scale(1.18);
  }
  .emo:active {
    transform: scale(0.92);
  }
  .react-more {
    grid-column: 1 / -1;
    display: grid;
    gap: 2px;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
  }
  .react-more .btn {
    justify-content: flex-start;
    gap: 8px;
  }
  .react-more .kbd {
    margin-left: auto;
  }
  .incoming {
    position: absolute;
    top: calc(100% + 10px);
    right: -40px;
    display: grid;
    gap: 2px;
    width: 250px;
    padding: 9px 12px;
    text-align: left;
    border-left: 3px solid var(--pc);
    animation: drop 200ms var(--ease-out);
    z-index: var(--z-pop);
  }
  .incoming b {
    font-size: 12px;
    color: var(--pc);
  }
  .incoming span {
    font-size: 13px;
    color: var(--ink);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  @media (max-width: 640px) {
    .bar {
      top: 8px;
      height: 42px;
    }
    .left {
      left: 8px;
    }
    .right {
      right: 8px;
    }
    .title {
      width: 120px;
      max-width: calc(100vw - 296px);
    }
    .share-label {
      display: none;
    }
    .share {
      width: 34px;
      padding: 0;
    }
    .right {
      max-width: none;
    }
    .tight .title {
      max-width: calc(100vw - 330px);
    }
    /* история — в меню «…» */
    .hist {
      display: none;
    }
  }
</style>
