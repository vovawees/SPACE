<script lang="ts">
  import { ask } from "../../ui/confirm.svelte.ts";
  /* Доступ к доске: ссылка, QR для телефона, участники и их права. */
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Copy from "@lucide/svelte/icons/copy";
  import QrCode from "@lucide/svelte/icons/qr-code";
  import { onMount } from "svelte";
  import type { BoardSummary, LinkAccess, Member, Role } from "../../../shared/types.ts";
  import { api } from "../../lib/api.ts";
  import { session } from "../../lib/session.svelte.ts";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { ago, copyText } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import Dialog from "../../ui/Dialog.svelte";
  import { menu } from "../../ui/menu.svelte.ts";
  import QR from "../../ui/QR.svelte";
  import { useBoard } from "../board.svelte.ts";

  const b = useBoard();
  const owner = $derived(b.role === "owner");
  const url = `${location.origin}/b/${b.id}`;
  let access = $state<LinkAccess>(b.summary?.linkAccess ?? "none");
  let members = $state<Member[]>([]);
  let loading = $state(true);
  let copied = $state(false);
  let showQr = $state(false);

  const online = $derived(new Set(b.people.map((p) => p.user.id)));

  onMount(() => {
    api
      .get<Member[]>(`/api/boards/${b.id}/members`)
      .then((m) => (members = m))
      .catch((e) => toasts.error(e))
      .finally(() => (loading = false));
    // свежий уровень доступа (мог поменяться с другого устройства)
    api
      .get<BoardSummary>(`/api/boards/${b.id}`)
      .then((s) => {
        b.summary = s;
        access = s.linkAccess;
      })
      .catch(() => {});
  });

  async function setAccess(next: LinkAccess) {
    if (!owner || next === access) return;
    const prev = access;
    access = next;
    try {
      b.summary = await api.patch<BoardSummary>(`/api/boards/${b.id}`, { linkAccess: next });
    } catch (e) {
      access = prev;
      toasts.error(e);
    }
  }

  async function copy() {
    if (await copyText(url)) {
      copied = true;
      setTimeout(() => (copied = false), 1600);
    }
  }

  const ROLE_LABEL: Record<Role, string> = { owner: "Владелец", editor: "Редактор", viewer: "Зритель" };

  function roleMenu(e: MouseEvent, m: Member) {
    menu.dropdown(
      e.currentTarget as HTMLElement,
      [
        { label: "Редактор", checked: m.role === "editor", run: () => void setRole(m, "editor") },
        { label: "Зритель", checked: m.role === "viewer", run: () => void setRole(m, "viewer") },
        "-",
        { label: "Убрать с доски", danger: true, run: () => void remove(m) },
      ],
      "bottom-end",
    );
  }

  async function setRole(m: Member, role: "editor" | "viewer") {
    try {
      members = await api.patch<Member[]>(`/api/boards/${b.id}/members/${m.id}`, { role });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function remove(m: Member) {
    if (!(await ask({ title: `Убрать ${m.name}?`, text: "Доска пропадёт из списка этого человека. Вернуться можно будет только по ссылке, если она открыта.", ok: "Убрать", danger: true }))) return;
    try {
      members = await api.del<Member[]>(`/api/boards/${b.id}/members/${m.id}`);
    } catch (e) {
      toasts.error(e);
    }
  }

  const ACCESS: { v: LinkAccess; label: string; hint: string }[] = [
    { v: "none", label: "Только участники", hint: "Ссылка работает только для тех, кто уже на доске." },
    { v: "view", label: "Просмотр", hint: "Любой со ссылкой может смотреть и пользоваться указкой." },
    { v: "edit", label: "Редактирование", hint: "Любой со ссылкой может менять доску." },
  ];
  const hint = $derived(ACCESS.find((a) => a.v === access)?.hint ?? "");
</script>

<Dialog title="Поделиться доской" width={480} onclose={() => (b.ui.share = false)}>
  <div class="link">
    <input class="input" readonly value={url} onfocus={(e) => e.currentTarget.select()} aria-label="Ссылка на доску" />
    <!-- svelte-ignore a11y_autofocus -->
    <button class="btn primary" onclick={copy} autofocus>
      {#if copied}<Check size={16} /> Готово{:else}<Copy size={16} /> Копировать{/if}
    </button>
    <button class="icon-btn" class:on={showQr} aria-label="QR-код" onclick={() => (showQr = !showQr)}><QrCode size={18} /></button>
  </div>

  {#if showQr}
    <div class="qr">
      <QR text={url} size={180} />
      <p>Наведите камеру телефона. Телефон должен видеть этот адрес — та же сеть, Tailscale или публичный домен.</p>
    </div>
  {/if}

  <div class="section">
    <div class="label">Доступ по ссылке</div>
    {#if owner}
      <div class="seg" role="radiogroup" aria-label="Доступ по ссылке">
        {#each ACCESS as a (a.v)}
          <button class:on={access === a.v} role="radio" aria-checked={access === a.v} onclick={() => void setAccess(a.v)}>{a.label}</button>
        {/each}
      </div>
    {:else}
      <div class="ro">{ACCESS.find((a) => a.v === access)?.label}</div>
    {/if}
    <div class="hint">{hint}</div>
  </div>

  <div class="section">
    <div class="label">Участники{members.length ? ` · ${members.length}` : ""}</div>
    {#if loading}
      <div class="loading"><div class="spin"></div></div>
    {:else}
      <div class="members">
        {#each members as m (m.id)}
          <div class="member">
            <Avatar name={m.name} color={m.color} size={30} />
            <div class="who">
              <div class="name">
                {m.name}{#if m.id === session.me?.id}<span class="you"> · вы</span>{/if}
              </div>
              <div class="meta">
                {#if online.has(m.id)}<span class="dot"></span> сейчас на доске{:else if m.openedAt}заходил(а) {ago(m.openedAt)}{:else}ещё не открывал(а){/if}
              </div>
            </div>
            {#if owner && m.role !== "owner"}
              <button class="btn ghost sm" onclick={(e) => roleMenu(e, m)}>{ROLE_LABEL[m.role]} <ChevronDown size={14} /></button>
            {:else}
              <span class="role">{ROLE_LABEL[m.role]}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Dialog>

<style>
  .link {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .link .input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
  }
  .qr {
    margin-top: 14px;
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 14px;
    border-radius: var(--r-3);
    background: var(--surface-2);
  }
  .qr p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.5;
  }
  .section {
    margin-top: 20px;
    display: grid;
    gap: 8px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-3);
    letter-spacing: 0.02em;
  }
  .seg {
    display: flex;
  }
  .seg > button {
    flex: 1;
  }
  .ro {
    font-size: 14px;
  }
  .hint {
    font-size: 12.5px;
    color: var(--ink-3);
  }
  .loading {
    display: grid;
    place-items: center;
    padding: 18px;
  }
  .members {
    display: grid;
    gap: 2px;
    max-height: 300px;
    overflow-y: auto;
    margin: 0 -8px;
  }
  .member {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: var(--r-2);
  }
  .member:hover {
    background: var(--hover);
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 560;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .you {
    color: var(--ink-3);
    font-weight: 400;
  }
  .meta {
    font-size: 12px;
    color: var(--ink-3);
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
  }
  .role {
    font-size: 12.5px;
    color: var(--ink-3);
    padding: 0 8px;
  }
  @media (max-width: 480px) {
    .link {
      flex-wrap: wrap;
    }
    .link .input {
      flex-basis: 100%;
    }
    .qr {
      flex-direction: column;
      text-align: center;
    }
    .seg > button {
      font-size: 12px;
      padding: 0 4px;
    }
  }
</style>
