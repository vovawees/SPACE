<script lang="ts">
  import { ask } from "../ui/confirm.svelte.ts";
  import Copy from "@lucide/svelte/icons/copy";
  import Download from "@lucide/svelte/icons/download";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import LayoutTemplate from "@lucide/svelte/icons/layout-template";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Link2 from "@lucide/svelte/icons/link-2";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Palette from "@lucide/svelte/icons/palette";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import Trash2 from "@lucide/svelte/icons/trash";
  import Upload from "@lucide/svelte/icons/upload";
  import UserMinus from "@lucide/svelte/icons/user-minus";
  import { onMount } from "svelte";
  import type { BoardSummary } from "../../shared/types.ts";
  import { api } from "../lib/api.ts";
  import { boardUrl, router } from "../lib/router.svelte.ts";
  import { ACCENTS, accentGlyph } from "../lib/look.svelte.ts";
  import { session } from "../lib/session.svelte.ts";
  import { freshThumbs } from "../lib/thumbs.svelte.ts";
  import { toasts } from "../lib/toast.svelte.ts";
  import { ago, copyText, download, plural } from "../lib/util.ts";
  import Avatar from "../ui/Avatar.svelte";
  import Logo from "../ui/Logo.svelte";
  import { menu } from "../ui/menu.svelte.ts";
  import SettingsDialog from "../ui/SettingsDialog.svelte";
  import { tip } from "../ui/tooltip.ts";

  let boards = $state<BoardSummary[] | null>(null);
  let query = $state("");
  let renaming = $state<string | null>(null);
  let renameValue = $state("");
  let settingsOpen = $state(false);
  let creating = $state(false);
  /* Шаблоны грузятся отдельным куском — главная остаётся лёгкой. */
  type Tpl = { id: string; label: string; desc: string; group: string; svg: string };
  let tpls = $state<Tpl[] | null>(null);
  let tplGroups: readonly string[] = [];
  const FEATURED = ["game", "tactics", "brainstorm", "kanban", "mindmap", "roadmap", "flow"];
  const featured = $derived(tpls ? FEATURED.map((id) => tpls!.find((t) => t.id === id)).filter((t) => !!t) : []);
  let importInput: HTMLInputElement;

  const me = $derived(session.me!);
  const filtered = $derived.by(() => {
    const list = boards ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((b) => b.title.toLowerCase().includes(q) || b.owner.name.toLowerCase().includes(q)) : list;
  });
  const pinned = $derived(filtered.filter((b) => b.pinned));
  const rest = $derived(filtered.filter((b) => !b.pinned));

  async function load() {
    try {
      boards = await api.get<BoardSummary[]>("/api/boards");
    } catch (e) {
      if (!boards) boards = [];
      toasts.error(e);
    }
  }

  onMount(() => {
    void load();
    void loadTemplates();
    document.title = "SPACE";
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    const onFocus = () => load();
    addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      removeEventListener("focus", onFocus);
    };
  });

  async function loadTemplates() {
    try {
      const m = await import("../board/templates.ts");
      tplGroups = m.TEMPLATE_GROUPS;
      tpls = m.TEMPLATES.map((t) => ({ id: t.id, label: t.label, desc: t.desc, group: t.group, svg: m.templateThumb(t.build(), 168, 100) }));
    } catch {
      /* без шаблонов главная всё равно работает */
    }
  }

  function allTemplates(anchor: HTMLElement) {
    if (!tpls) return;
    const list = tpls;
    menu.dropdown(
      anchor,
      tplGroups.flatMap((g) => [{ heading: g }, ...list.filter((t) => t.group === g).map((t) => ({ label: t.label, run: () => create(t) }))]),
      "bottom-end",
    );
  }

  /** Новая доска; с шаблоном — он появится на доске сразу после открытия. */
  async function create(tpl?: Tpl) {
    if (creating) return;
    creating = true;
    try {
      const b = await api.post<BoardSummary>("/api/boards", { title: tpl?.label ?? "Без названия" });
      if (tpl) sessionStorage.setItem(`space:tpl:${b.id}`, tpl.id);
      router.go(boardUrl(b.id));
    } catch (e) {
      toasts.error(e);
    } finally {
      creating = false;
    }
  }

  async function patch(b: BoardSummary, data: Partial<Pick<BoardSummary, "title" | "pinned">>) {
    try {
      const next = await api.patch<BoardSummary>(`/api/boards/${b.id}`, data);
      boards = (boards ?? []).map((x) => (x.id === b.id ? next : x));
    } catch (e) {
      toasts.error(e);
    }
  }

  async function duplicate(b: BoardSummary) {
    try {
      const copy = await api.post<BoardSummary>(`/api/boards/${b.id}/duplicate`, {});
      boards = [copy, ...(boards ?? [])];
      toasts.show(`Создана копия «${b.title}»`, { kind: "ok" });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function remove(b: BoardSummary) {
    const owner = b.role === "owner";
    const name = b.title || "Без названия";
    const yes = await ask(
      owner
        ? { title: "Удалить доску?", text: `«${name}» удалится у всех участников вместе с историей. Это нельзя отменить.`, ok: "Удалить", danger: true }
        : { title: "Покинуть доску?", text: `«${name}» пропадёт из ваших досок. Вернуться можно по ссылке, если она открыта.`, ok: "Покинуть", danger: true },
    );
    if (!yes) return;
    try {
      await api.del(`/api/boards/${b.id}`);
      boards = (boards ?? []).filter((x) => x.id !== b.id);
      toasts.show(owner ? "Доска удалена" : "Вы покинули доску");
    } catch (e) {
      toasts.error(e);
    }
  }

  async function importFile(file: File) {
    try {
      const b = await api.raw<BoardSummary>(
        "POST",
        `/api/boards/import?title=${encodeURIComponent(file.name.replace(/\.space$/i, ""))}`,
        file,
        "application/octet-stream",
      );
      router.go(boardUrl(b.id));
    } catch (e) {
      toasts.error(e);
    }
  }

  function startRename(b: BoardSummary) {
    renaming = b.id;
    renameValue = b.title;
  }

  function commitRename(b: BoardSummary) {
    const v = renameValue.trim();
    renaming = null;
    if (v && v !== b.title) void patch(b, { title: v });
  }

  function boardMenu(b: BoardSummary, anchor: HTMLElement | null, e?: MouseEvent) {
    const items = [
      { label: "Открыть", icon: ExternalLink, run: () => router.go(boardUrl(b.id)) },
      ...(b.role !== "viewer" ? [{ label: "Переименовать", icon: Pencil, run: () => startRename(b) }] : []),
      {
        label: b.pinned ? "Открепить" : "Закрепить",
        icon: b.pinned ? PinOff : Pin,
        run: () => patch(b, { pinned: !b.pinned }),
      },
      { label: "Дублировать", icon: Copy, run: () => duplicate(b) },
      {
        label: "Скопировать ссылку",
        icon: Link2,
        run: async () => (await copyText(location.origin + boardUrl(b.id))) && toasts.show("Ссылка скопирована", { kind: "ok" }),
      },
      { label: "Скачать файл доски", icon: Download, run: () => download(`/api/boards/${b.id}/export`, `${b.title}.space`) },
      "-" as const,
      b.role === "owner"
        ? { label: "Удалить", icon: Trash2, danger: true, run: () => remove(b) }
        : { label: "Покинуть доску", icon: UserMinus, danger: true, run: () => remove(b) },
    ];
    if (e) menu.at(e, items);
    else if (anchor) menu.dropdown(anchor, items, "bottom-end");
  }

  function userMenu(anchor: HTMLElement) {
    menu.dropdown(
      anchor,
      [
        { heading: me.name },
        { label: "Настройки", icon: Settings, run: () => (settingsOpen = true) },
        {
          label: "Акцент",
          icon: Palette,
          items: ACCENTS.map((a) => ({
            label: a.label,
            glyph: accentGlyph(a.color),
            checked: session.settings.accent === a.id,
            run: () => (session.settings.accent = a.id),
          })),
        },
        { label: "Импорт файла доски", icon: Upload, run: () => importInput.click() },
        "-",
        { label: "Выйти", icon: LogOut, run: () => session.logout() },
      ],
      "bottom-end",
    );
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      document.getElementById("home-search")?.focus();
    }
  }}
/>

<div class="home">
  <header class="top">
    <div class="brand">
      <Logo size={30} />
      <span class="word">SPACE</span>
    </div>
    <label class="search">
      <Search size={16} />
      <input id="home-search" bind:value={query} placeholder="Искать…" autocomplete="off" />
    </label>
    <div class="actions">
      <button class="btn primary" onclick={() => create()} disabled={creating}><Plus size={17} /> Новая доска</button>
      <button class="me" onclick={(e) => userMenu(e.currentTarget)} {@attach tip("Профиль и настройки", undefined, "bottom")}>
        <Avatar name={me.name} color={me.color} size={32} />
      </button>
    </div>
  </header>

  {#snippet starters()}
    {#if tpls}
      <section class="starters">
        <h3>Начать с шаблона</h3>
        <div class="tpl-row">
          {#each featured as t (t.id)}
            <button class="tpl" onclick={() => create(t)} disabled={creating} {@attach tip(t.desc, undefined, "bottom")}>
              <span class="tpl-art">{@html t.svg}</span>
              <span class="tpl-name">{t.label}</span>
            </button>
          {/each}
          <button class="tpl tpl-all" onclick={(e) => allTemplates(e.currentTarget)} disabled={creating}>
            <span class="tpl-art"><LayoutTemplate size={22} /><b>{tpls.length}</b></span>
            <span class="tpl-name">Все шаблоны</span>
          </button>
        </div>
      </section>
    {/if}
  {/snippet}

  <main class="content">
    {#if boards === null}
      <div class="grid">
        {#each Array(6) as _, i (i)}
          <div class="card skeleton"><div class="thumb"></div><div class="meta"><span></span><span></span></div></div>
        {/each}
      </div>
    {:else if !boards.length}
      <div class="empty">
        <div class="empty-art" aria-hidden="true">
          <div class="ea ea1"></div>
          <div class="ea ea2"></div>
          <div class="ea ea3"></div>
        </div>
        <h2>Здесь появятся ваши доски</h2>
        <p>Заметки, код, файлы, ссылки и рисунки — на одном бесконечном полотне. Пригласите друзей по ссылке и работайте вместе.</p>
        <div class="row">
          <button class="btn primary lg" onclick={() => create()}><Plus size={18} /> Создать доску</button>
          <button class="btn ghost lg" onclick={() => importInput.click()}><Upload size={17} /> Импорт</button>
        </div>
      </div>
      {@render starters()}
    {:else}
      {#snippet section(title: string, list: BoardSummary[], withNew: boolean)}
        {#if list.length || withNew}
          <section>
            <h3>{title}</h3>
            <div class="grid">
              {#if withNew && !query}
                <button class="card new" onclick={() => create()}>
                  <span class="plus"><Plus size={22} /></span>
                  <span>Новая доска</span>
                </button>
              {/if}
              {#each list as b (b.id)}
                <div
                  class="card"
                  role="link"
                  tabindex="0"
                  onclick={(e) => {
                    if ((e.target as Element).closest("button, input")) return;
                    if (e.ctrlKey || e.metaKey) open(boardUrl(b.id), "_blank");
                    else router.go(boardUrl(b.id));
                  }}
                  onkeydown={(e) => e.key === "Enter" && e.target === e.currentTarget && router.go(boardUrl(b.id))}
                  oncontextmenu={(e) => {
                    e.preventDefault();
                    boardMenu(b, null, e);
                  }}
                >
                  <div class="thumb">
                    {#if freshThumbs[b.id] || b.thumb}
                      <img src={freshThumbs[b.id] || b.thumb} alt="" loading="lazy" draggable="false" />
                    {:else}
                      <div class="placeholder"><span>{b.title.slice(0, 1).toUpperCase()}</span></div>
                    {/if}
                    {#if b.online.length}
                      <div class="online">
                        {#each b.online.slice(0, 4) as u (u.id)}
                          <Avatar name={u.name} color={u.color} size={22} ring />
                        {/each}
                      </div>
                    {/if}
                    <button class="more icon-btn sm" onclick={(e) => boardMenu(b, e.currentTarget)} aria-label="Действия">
                      <Ellipsis size={17} />
                    </button>
                  </div>
                  <div class="meta">
                    {#if renaming === b.id}
                      <!-- svelte-ignore a11y_autofocus -->
                      <input
                        class="input sm"
                        bind:value={renameValue}
                        autofocus
                        onblur={() => commitRename(b)}
                        onkeydown={(e) => {
                          if (e.key === "Enter") commitRename(b);
                          if (e.key === "Escape") renaming = null;
                        }}
                      />
                    {:else}
                      <div class="title">
                        {#if b.pinned}<Pin size={13} class="pin" />{/if}
                        <span>{b.title}</span>
                      </div>
                    {/if}
                    <div class="sub">
                      {#if b.owner.id !== me.id}
                        <Avatar name={b.owner.name} color={b.owner.color} size={16} />
                        <span class="owner">{b.owner.name}</span><span class="dot">·</span>
                      {/if}
                      <span>{ago(b.updatedAt)}</span>
                      {#if b.nodes}<span class="dot">·</span><span>{b.nodes} {plural(b.nodes, "объект", "объекта", "объектов")}</span>{/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      {/snippet}
      {#if !query}{@render starters()}{/if}
      {@render section("Закреплённые", pinned, false)}
      {@render section(pinned.length ? "Остальные" : "Доски", rest, true)}
      {#if query && !filtered.length}
        <p class="nothing">Ничего не нашлось по запросу «{query}»</p>
      {/if}
    {/if}
  </main>
</div>

<input
  bind:this={importInput}
  type="file"
  accept=".space,application/octet-stream"
  hidden
  onchange={(e) => {
    const f = e.currentTarget.files?.[0];
    if (f) void importFile(f);
    e.currentTarget.value = "";
  }}
/>

{#if settingsOpen}
  <SettingsDialog onclose={() => (settingsOpen = false)} />
{/if}

<style>
  .home {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
  }
  .top {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 16px;
    height: 64px;
    padding: 0 max(20px, env(safe-area-inset-left));
    background: color-mix(in oklab, var(--bg) 88%, transparent);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--line);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .word {
    font-weight: 760;
    letter-spacing: 0.14em;
    font-size: 15px;
  }
  .search {
    flex: 1;
    max-width: 420px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 12px;
    border-radius: var(--r-2);
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-3);
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .search:focus-within {
    border-color: var(--accent-line);
    background: var(--surface-1);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font-size: 14px;
  }
  .search input::placeholder {
    color: var(--ink-3);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
  }
  .me {
    border-radius: 50%;
  }
  .content {
    max-width: 1320px;
    margin: 0 auto;
    padding: 28px max(20px, env(safe-area-inset-left)) 80px;
  }
  section + section {
    margin-top: 34px;
  }
  h3 {
    margin: 0 0 14px;
    font-size: 13px;
    font-weight: 620;
    color: var(--ink-2);
    letter-spacing: 0.01em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 18px;
  }
  .tpl-row {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(140px, 1fr);
    gap: 12px;
    overflow-x: auto;
    padding: 2px 2px 8px;
    margin: -2px -2px -8px;
    scrollbar-width: thin;
  }
  .tpl {
    display: grid;
    gap: 8px;
    padding: 8px 8px 10px;
    border-radius: var(--r-3);
    border: 1px solid var(--line);
    background: var(--surface-1);
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 540;
    text-align: left;
    cursor: pointer;
    transition:
      transform 200ms var(--ease-out),
      border-color var(--t-fast),
      color var(--t-fast),
      background var(--t-fast);
  }
  .tpl:hover {
    transform: translateY(-2px);
    border-color: var(--accent-line);
    color: var(--ink);
    background: color-mix(in oklab, var(--accent) 4%, var(--surface-1));
  }
  .tpl:disabled {
    opacity: 0.6;
    pointer-events: none;
  }
  .tpl-art {
    display: grid;
    place-items: center;
    aspect-ratio: 168 / 100;
    border-radius: var(--r-2);
    background:
      radial-gradient(circle at 1px 1px, var(--bg-dot) 1px, transparent 0) 0 0 / 10px 10px,
      var(--bg);
    overflow: hidden;
  }
  .tpl:not(.tpl-all) .tpl-art :global(svg) {
    width: 100%;
    height: 100%;
  }
  .tpl-name {
    padding: 0 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tpl-all .tpl-art {
    grid-auto-flow: column;
    gap: 8px;
    color: var(--accent);
    background: var(--accent-soft);
  }
  .tpl-all .tpl-art b {
    font-size: 15px;
    font-weight: 650;
  }
  .empty + .starters {
    max-width: 1000px;
    margin: 8px auto 0;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: var(--r-4);
    background: var(--surface-1);
    border: 1px solid var(--line);
    cursor: pointer;
    transition:
      transform 220ms var(--ease-out),
      box-shadow 220ms var(--ease-out),
      border-color var(--t-fast);
    text-align: left;
    overflow: hidden;
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-2);
    border-color: var(--line-2);
  }
  .thumb {
    position: relative;
    aspect-ratio: 16 / 10;
    background:
      radial-gradient(circle at 1px 1px, var(--bg-dot) 1px, transparent 0) 0 0 / 14px 14px,
      var(--bg);
    border-bottom: 1px solid var(--line);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .placeholder span {
    width: 54px;
    height: 54px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    font-size: 24px;
    font-weight: 700;
    color: var(--ink-3);
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .online {
    position: absolute;
    left: 10px;
    bottom: 10px;
    display: flex;
    gap: 2px;
  }
  .more {
    position: absolute;
    right: 8px;
    top: 8px;
    background: var(--glass);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    border: 1px solid var(--line-2);
    opacity: 0;
    transition: opacity var(--t-fast);
  }
  .card:hover .more,
  .more:focus-visible {
    opacity: 1;
  }
  @media (pointer: coarse) {
    .more {
      opacity: 1;
    }
  }
  .meta {
    display: grid;
    gap: 4px;
    padding: 12px 14px 14px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 14.5px;
    letter-spacing: -0.01em;
    min-width: 0;
  }
  .title span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title :global(.pin) {
    color: var(--accent);
    flex: none;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: var(--ink-3);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
  }
  .owner {
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card.new {
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 200px;
    border: 1.5px dashed var(--line-3);
    background: transparent;
    color: var(--ink-2);
    font-weight: 560;
  }
  .card.new:hover {
    border-color: var(--accent-line);
    color: var(--ink);
    box-shadow: none;
  }
  .plus {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .skeleton {
    pointer-events: none;
  }
  .skeleton .thumb {
    background: var(--surface-2);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .skeleton .meta span {
    height: 12px;
    border-radius: 6px;
    background: var(--surface-2);
  }
  .skeleton .meta span:first-child {
    width: 60%;
  }
  .skeleton .meta span:last-child {
    width: 40%;
  }
  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }
  .empty {
    max-width: 520px;
    margin: 8vh auto 0;
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 12px;
  }
  .empty h2 {
    margin: 10px 0 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .empty p {
    margin: 0 0 12px;
    color: var(--ink-2);
    line-height: 1.55;
  }
  .empty-art {
    position: relative;
    width: 220px;
    height: 140px;
  }
  .ea {
    position: absolute;
    border-radius: 14px;
    border: 1px solid var(--line-2);
    box-shadow: var(--card-shadow);
  }
  .ea1 {
    left: 0;
    top: 10px;
    width: 110px;
    height: 70px;
    background: color-mix(in oklab, var(--c-yellow) var(--tint), var(--card));
    transform: rotate(-4deg);
  }
  .ea2 {
    right: 0;
    top: 0;
    width: 100px;
    height: 80px;
    background: color-mix(in oklab, var(--c-violet) var(--tint), var(--card));
    transform: rotate(3deg);
  }
  .ea3 {
    left: 60px;
    bottom: 0;
    width: 110px;
    height: 60px;
    background: var(--card);
  }
  .nothing {
    color: var(--ink-3);
    text-align: center;
    margin-top: 40px;
  }
  @media (max-width: 640px) {
    .word {
      display: none;
    }
    .actions .btn {
      width: 36px;
      padding: 0;
      font-size: 0;
      gap: 0;
    }
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
    }
    .card.new {
      min-height: 150px;
    }
  }
</style>
