<script lang="ts">
  /* Доступ к доске: общая ссылка и QR, приглашения с ролью, сроком и числом
     входов, участники и их роли (хост, редактор, комментатор, зритель),
     настройки доски: заморозка, чат, кто приглашает, история, копирование. */
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Copy from "@lucide/svelte/icons/copy";
  import Link2 from "@lucide/svelte/icons/link-2";
  import Plus from "@lucide/svelte/icons/plus";
  import QrCode from "@lucide/svelte/icons/qr-code";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { onMount } from "svelte";
  import type { BoardLink, BoardSettings, BoardSummary, LinkAccess, Member, Role } from "../../../shared/types.ts";
  import { ROLE_LABELS, roleRank } from "../../../shared/types.ts";
  import { api } from "../../lib/api.ts";
  import { router } from "../../lib/router.svelte.ts";
  import { session } from "../../lib/session.svelte.ts";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { ago, copyText } from "../../lib/util.ts";
  import Avatar from "../../ui/Avatar.svelte";
  import { ask } from "../../ui/confirm.svelte.ts";
  import Dialog from "../../ui/Dialog.svelte";
  import { menu } from "../../ui/menu.svelte.ts";
  import QR from "../../ui/QR.svelte";
  import { useBoard } from "../board.svelte.ts";

  const b = useBoard();
  const role = $derived<Role>(b.summary?.role ?? b.role);
  const perms = $derived(b.summary?.perms);
  const manage = $derived(!!perms?.manage);
  const isOwner = $derived(role === "owner");
  const url = `${location.origin}/b/${b.id}`;
  let tab = $state<"link" | "invites" | "people" | "settings">("link");
  let access = $state<LinkAccess>(b.summary?.linkAccess ?? "none");
  let members = $state<Member[]>([]);
  let links = $state<BoardLink[]>([]);
  let loading = $state(true);
  let copied = $state<string | null>(null);
  let showQr = $state<string | null>(null);
  let st = $state<BoardSettings | null>(b.summary?.settings ?? null);
  // новое приглашение
  let nRole = $state<Exclude<Role, "owner">>("editor");
  let nUses = $state<string>("");
  let nDays = $state<string>("7");
  let nLabel = $state("");

  const online = $derived(new Set(b.people.map((p) => p.user.id)));
  const linkUrl = (l: BoardLink) => `${url}?k=${l.id}`;

  onMount(() => {
    api
      .get<Member[]>(`/api/boards/${b.id}/members`)
      .then((m) => (members = m))
      .catch((e) => toasts.error(e))
      .finally(() => (loading = false));
    api
      .get<BoardSummary>(`/api/boards/${b.id}`)
      .then((s) => {
        b.summary = s;
        access = s.linkAccess;
        st = s.settings;
        if (s.perms.invite) void loadLinks();
      })
      .catch(() => {});
  });

  async function loadLinks() {
    try {
      links = await api.get<BoardLink[]>(`/api/boards/${b.id}/links`);
    } catch {
      links = [];
    }
  }

  async function setAccess(next: LinkAccess) {
    if (!manage || next === access) return;
    const prev = access;
    access = next;
    try {
      b.summary = await api.patch<BoardSummary>(`/api/boards/${b.id}`, { linkAccess: next });
    } catch (e) {
      access = prev;
      toasts.error(e);
    }
  }

  async function setSetting<K extends keyof BoardSettings>(k: K, v: BoardSettings[K]) {
    if (!st || !manage) return;
    const prev = st[k];
    st[k] = v;
    try {
      b.summary = await api.patch<BoardSummary>(`/api/boards/${b.id}`, { settings: { [k]: v } });
      st = b.summary.settings;
    } catch (e) {
      st[k] = prev;
      toasts.error(e);
    }
  }

  async function copy(text: string, key: string) {
    if (await copyText(text)) {
      copied = key;
      setTimeout(() => (copied = null), 1600);
    }
  }

  async function createLink() {
    const uses = Number(nUses);
    const days = Number(nDays);
    try {
      links = await api.post<BoardLink[]>(`/api/boards/${b.id}/links`, {
        role: nRole,
        label: nLabel.trim() || null,
        maxUses: nUses && uses > 0 ? Math.round(uses) : null,
        days: nDays && days > 0 ? days : null,
      });
      nLabel = "";
      const fresh = links[0];
      if (fresh) void copy(linkUrl(fresh), fresh.id);
      toasts.show("Приглашение создано и скопировано", { kind: "ok", ms: 1800 });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function revoke(l: BoardLink) {
    try {
      links = await api.del<BoardLink[]>(`/api/boards/${b.id}/links/${l.id}`);
    } catch (e) {
      toasts.error(e);
    }
  }

  /** Роли, которые я могу выдать: не выше своей; хоста — только владелец. */
  const grantable = $derived(
    (["host", "editor", "commenter", "viewer"] as const).filter((r) => roleRank(r) <= roleRank(role) && (r !== "host" || isOwner)),
  );

  function roleMenu(e: MouseEvent, m: Member) {
    const items = grantable.map((r) => ({ label: ROLE_LABELS[r], checked: m.role === r && !m.banned, run: () => void setRole(m, r) }));
    menu.dropdown(
      e.currentTarget as HTMLElement,
      [
        ...items,
        "-",
        ...(isOwner && !m.banned ? [{ label: "Сделать владельцем…", run: () => void transfer(m) }] : []),
        { label: "Убрать с доски", run: () => void remove(m) },
        m.banned ? { label: "Разблокировать (зритель)", run: () => void setRole(m, "viewer") } : { label: "Заблокировать", danger: true, run: () => void ban(m) },
      ],
      "bottom-end",
    );
  }

  async function setRole(m: Member, r: Exclude<Role, "owner"> | "banned") {
    try {
      members = await api.patch<Member[]>(`/api/boards/${b.id}/members/${m.id}`, { role: r });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function ban(m: Member) {
    if (!(await ask({ title: `Заблокировать ${m.name}?`, text: "Человек потеряет доступ и не вернётся даже по общей ссылке или приглашению.", ok: "Заблокировать", danger: true }))) return;
    await setRole(m, "banned");
  }

  async function remove(m: Member) {
    if (!(await ask({ title: `Убрать ${m.name}?`, text: "Доска пропадёт из списка этого человека. Вернуться можно по ссылке или приглашению.", ok: "Убрать", danger: true }))) return;
    try {
      members = await api.del<Member[]>(`/api/boards/${b.id}/members/${m.id}`);
    } catch (e) {
      toasts.error(e);
    }
  }

  async function transfer(m: Member) {
    if (!(await ask({ title: `Передать доску ${m.name}?`, text: "Новый владелец сможет удалить доску. Вы останетесь хостом.", ok: "Передать", danger: true }))) return;
    try {
      b.summary = await api.post<BoardSummary>(`/api/boards/${b.id}/transfer`, { userId: m.id });
      b.role = b.summary.role;
      members = await api.get<Member[]>(`/api/boards/${b.id}/members`);
      toasts.show("Доска передана", { kind: "ok" });
    } catch (e) {
      toasts.error(e);
    }
  }

  const ACCESS: { v: LinkAccess; label: string; hint: string }[] = [
    { v: "none", label: "Закрыто", hint: "Ссылка работает только для участников. Новых людей зовите приглашениями." },
    { v: "view", label: "Просмотр", hint: "Любой со ссылкой может смотреть и пользоваться указкой." },
    { v: "comment", label: "Комментарии", hint: "Любой со ссылкой может смотреть, писать в чат и оставлять комментарии." },
    { v: "edit", label: "Правка", hint: "Любой со ссылкой может менять доску." },
  ];
  const hint = $derived(ACCESS.find((a) => a.v === access)?.hint ?? "");
  const until = (t: number | null) => (t ? (t < Date.now() ? "истекло" : `до ${new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`) : "бессрочно");
  const tabs = $derived([
    { id: "link" as const, label: "Ссылка" },
    ...(perms?.invite ? [{ id: "invites" as const, label: "Приглашения" }] : []),
    { id: "people" as const, label: `Участники${members.length ? ` · ${members.filter((m) => !m.banned).length}` : ""}` },
    ...(manage ? [{ id: "settings" as const, label: "Настройки" }] : []),
  ]);
</script>

<Dialog title="Доступ к доске" width={520} onclose={() => (b.ui.share = false)}>
  <div class="tabs" role="tablist">
    {#each tabs as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </div>

  {#if tab === "link"}
    <div class="link">
      <input class="input" readonly value={url} onfocus={(e) => e.currentTarget.select()} aria-label="Ссылка на доску" />
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn primary" onclick={() => copy(url, "main")} autofocus>
        {#if copied === "main"}<Check size={16} /> Готово{:else}<Copy size={16} /> Копировать{/if}
      </button>
      <button class="icon-btn" class:on={showQr === url} aria-label="QR-код" onclick={() => (showQr = showQr === url ? null : url)}><QrCode size={18} /></button>
    </div>
    {#if showQr === url}
      <div class="qr">
        <QR text={url} size={180} />
        <p>Наведите камеру телефона. Телефон должен видеть этот адрес — та же сеть, Tailscale или публичный домен.</p>
      </div>
    {/if}
    <div class="section">
      <div class="label">Кто может войти по этой ссылке</div>
      {#if manage}
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
      <div class="label">Ваша роль</div>
      <div class="ro"><b>{ROLE_LABELS[role]}</b>{#if b.summary?.settings.lock && !perms?.edit} · доска заморожена хостом{/if}</div>
    </div>
  {:else if tab === "invites"}
    <div class="new">
      <div class="row">
        <label class="field">
          <span>Роль</span>
          <select class="input" bind:value={nRole}>
            {#each grantable as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Входов</span>
          <input class="input" inputmode="numeric" placeholder="∞" bind:value={nUses} />
        </label>
        <label class="field">
          <span>Дней</span>
          <input class="input" inputmode="decimal" placeholder="∞" bind:value={nDays} />
        </label>
      </div>
      <div class="row">
        <input class="input grow" placeholder="Подпись (необязательно): «для команды», «Боре»…" maxlength="80" bind:value={nLabel} />
        <button class="btn primary" onclick={createLink}><Plus size={16} /> Создать</button>
      </div>
    </div>
    <div class="section">
      <div class="label">Приглашения{links.length ? ` · ${links.length}` : ""}</div>
      {#if !links.length}
        <div class="hint">Пока нет. Приглашение даёт роль сразу при входе — даже если общая ссылка закрыта.</div>
      {/if}
      <div class="list">
        {#each links as l (l.id)}
          {@const dead = (l.expiresAt && l.expiresAt < Date.now()) || (l.maxUses && l.uses >= l.maxUses)}
          <div class="inv" class:dead>
            <Link2 size={16} />
            <div class="who">
              <div class="name">{ROLE_LABELS[l.role]}{l.label ? ` · ${l.label}` : ""}</div>
              <div class="meta">входов {l.uses}{l.maxUses ? ` из ${l.maxUses}` : ""} · {until(l.expiresAt)}{l.createdBy ? ` · выдал(а) ${l.createdBy.name}` : ""}</div>
            </div>
            <button class="icon-btn sm" aria-label="QR-код" onclick={() => (showQr = showQr === linkUrl(l) ? null : linkUrl(l))}><QrCode size={16} /></button>
            <button class="icon-btn sm" aria-label="Копировать" onclick={() => copy(linkUrl(l), l.id)}>{#if copied === l.id}<Check size={16} />{:else}<Copy size={16} />{/if}</button>
            {#if manage || l.createdBy?.id === session.me?.id}
              <button class="icon-btn sm" aria-label="Отозвать" onclick={() => revoke(l)}><Trash2 size={16} /></button>
            {/if}
          </div>
          {#if showQr === linkUrl(l)}
            <div class="qr"><QR text={linkUrl(l)} size={160} /><p>{ROLE_LABELS[l.role]} — откройте камерой телефона.</p></div>
          {/if}
        {/each}
      </div>
    </div>
  {:else if tab === "people"}
    {#if loading}
      <div class="loading"><div class="spin"></div></div>
    {:else}
      <div class="members">
        {#each members as m (m.id)}
          <div class="member" class:dead={m.banned}>
            <Avatar name={m.name} color={m.color} size={30} />
            <div class="who">
              <div class="name">
                {m.name}{#if m.id === session.me?.id}<span class="you"> · вы</span>{/if}
              </div>
              <div class="meta">
                {#if m.banned}заблокирован(а){:else if online.has(m.id)}<span class="dot"></span> сейчас на доске{:else if m.openedAt}заходил(а) {ago(m.openedAt)}{:else}ещё не открывал(а){/if}
              </div>
            </div>
            {#if manage && m.role !== "owner" && m.id !== session.me?.id && (isOwner || m.role !== "host")}
              <button class="btn ghost sm" onclick={(e) => roleMenu(e, m)}>{m.banned ? "Блок" : ROLE_LABELS[m.role]} <ChevronDown size={14} /></button>
            {:else}
              <span class="role r-{m.role}">{m.banned ? "Блок" : ROLE_LABELS[m.role]}</span>
            {/if}
          </div>
        {/each}
      </div>
      <div class="hint legend">
        <b>Хост</b> — участники, приглашения и настройки доски. <b>Редактор</b> — меняет доску. <b>Комментатор</b> — чат и комментарии.
        <b>Зритель</b> — смотрит и показывает указкой.
      </div>
    {/if}
  {:else if tab === "settings" && st}
    <div class="opts">
      <label class="opt">
        <input type="checkbox" checked={st.lock} onchange={(e) => setSetting("lock", e.currentTarget.checked)} />
        <span><b>Заморозить доску</b><small>Править могут только хосты и владелец — удобно для готовых схем и презентаций.</small></span>
      </label>
      <div class="opt col">
        <span><b>Чат доски</b></span>
        <div class="seg">
          {#each [["all", "Все"], ["editors", "Редакторы"], ["off", "Выключен"]] as [v, l] (v)}
            <button class:on={st.chat === v} onclick={() => setSetting("chat", v as BoardSettings["chat"])}>{l}</button>
          {/each}
        </div>
      </div>
      <div class="opt col">
        <span><b>Кто приглашает</b></span>
        <div class="seg">
          {#each [["all", "Все"], ["editors", "Редакторы"], ["hosts", "Хосты"]] as [v, l] (v)}
            <button class:on={st.invite === v} onclick={() => setSetting("invite", v as BoardSettings["invite"])}>{l}</button>
          {/each}
        </div>
      </div>
      <div class="opt col">
        <span><b>Восстанавливать версии</b></span>
        <div class="seg">
          {#each [["editors", "Редакторы"], ["hosts", "Только хосты"]] as [v, l] (v)}
            <button class:on={st.history === v} onclick={() => setSetting("history", v as BoardSettings["history"])}>{l}</button>
          {/each}
        </div>
      </div>
      <label class="opt">
        <input type="checkbox" checked={st.copy} onchange={(e) => setSetting("copy", e.currentTarget.checked)} />
        <span><b>Скачивать и копировать могут все</b><small>Иначе файл доски и копию получают только хосты.</small></span>
      </label>
      <label class="opt">
        <span class="grow"><b>Предел участников</b><small>0 — без предела (но не больше лимита ранга владельца).</small></span>
        <input class="input num" type="number" min="0" value={st.maxMembers} onchange={(e) => setSetting("maxMembers", Math.max(0, Math.round(Number(e.currentTarget.value) || 0)))} />
      </label>
      {#if isOwner}
        <button class="btn ghost danger-text" onclick={async () => {
          if (await ask({ title: "Удалить доску?", text: "Она пропадёт у всех участников. 30 дней её можно вернуть через администратора.", ok: "Удалить", danger: true })) {
            try { await api.del(`/api/boards/${b.id}`); router.go("/"); } catch (e) { toasts.error(e); }
          }
        }}><Trash2 size={16} /> Удалить доску</button>
      {/if}
    </div>
  {/if}
</Dialog>

<style>
  .tabs {
    display: flex;
    gap: 2px;
    margin: -4px 0 14px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs button {
    padding: 8px 12px;
    font-size: 13.5px;
    color: var(--ink-3);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .tabs button.on {
    color: var(--ink);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }
  .link,
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .row + .row {
    margin-top: 8px;
  }
  .link .input,
  .grow {
    flex: 1;
    min-width: 0;
  }
  .link .input {
    font-family: var(--font-mono);
    font-size: 12.5px;
  }
  .field {
    display: grid;
    gap: 4px;
    flex: 1;
    font-size: 12px;
    color: var(--ink-3);
  }
  .field:first-child {
    flex: 1.6;
  }
  .qr {
    margin-top: 12px;
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
    margin-top: 18px;
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
    line-height: 1.5;
  }
  .legend {
    margin-top: 12px;
  }
  .loading {
    display: grid;
    place-items: center;
    padding: 18px;
  }
  .members,
  .list {
    display: grid;
    gap: 2px;
    max-height: 340px;
    overflow-y: auto;
    margin: 0 -8px;
  }
  .member,
  .inv {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: var(--r-2);
  }
  .inv {
    color: var(--ink-2);
  }
  .member:hover,
  .inv:hover {
    background: var(--hover);
  }
  .dead {
    opacity: 0.5;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 560;
    color: var(--ink);
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
    flex-wrap: wrap;
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
  .r-owner,
  .r-host {
    color: var(--accent);
    font-weight: 600;
  }
  .opts {
    display: grid;
    gap: 14px;
  }
  .opt {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 13.5px;
  }
  .opt.col {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .opt input[type="checkbox"] {
    margin-top: 3px;
    width: 17px;
    height: 17px;
    accent-color: var(--accent);
  }
  .opt small {
    display: block;
    color: var(--ink-3);
    font-size: 12px;
    margin-top: 2px;
  }
  .num {
    width: 90px;
  }
  .danger-text {
    color: var(--danger, #f06a6a);
    justify-self: start;
  }
  @media (max-width: 480px) {
    .link,
    .row {
      flex-wrap: wrap;
    }
    .link .input,
    .row .grow {
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
