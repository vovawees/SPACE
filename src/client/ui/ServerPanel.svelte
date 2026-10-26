<script lang="ts">
  /* Сервер: мои лимиты, приглашения на сервер, а для администраторов —
     регистрация, лимиты рангов, люди (ранг, блокировка, выход) и статистика. */
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Plus from "@lucide/svelte/icons/plus";
  import QrCode from "@lucide/svelte/icons/qr-code";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { onMount } from "svelte";
  import type { AdminUser, Invite, Rank, RankLimits, ServerSettings, ServerStats } from "../../shared/types.ts";
  import { RANK_LABELS, RANKS, rankRank } from "../../shared/types.ts";
  import { api } from "../lib/api.ts";
  import { session } from "../lib/session.svelte.ts";
  import { toasts } from "../lib/toast.svelte.ts";
  import { ago, bytes, copyText } from "../lib/util.ts";
  import Avatar from "./Avatar.svelte";
  import { ask } from "./confirm.svelte.ts";
  import QR from "./QR.svelte";

  const me = $derived(session.me!);
  const admin = $derived(rankRank(me.rank) >= rankRank("admin"));
  const owner = $derived(me.rank === "owner");
  const canInvite = $derived(admin || me.limits.invite);

  let settings = $state<ServerSettings | null>(null);
  let stats = $state<ServerStats | null>(null);
  let users = $state<AdminUser[]>([]);
  let invites = $state<Invite[]>([]);
  let search = $state("");
  let copied = $state<string | null>(null);
  let qr = $state<string | null>(null);
  let iRank = $state<Rank>("member");
  let iUses = $state("1");
  let iDays = $state("7");
  let iNote = $state("");
  let dirty = $state(false);

  const grantable = $derived(RANKS.filter((r) => r !== "owner" && rankRank(r) <= rankRank(me.rank) && (r !== "admin" || owner)));
  const inviteUrl = (code: string) => `${location.origin}/?invite=${encodeURIComponent(code)}`;

  onMount(() => {
    if (canInvite) void loadInvites();
    if (admin) {
      api
        .get<{ settings: ServerSettings; stats: ServerStats }>("/api/admin")
        .then((r) => ((settings = r.settings), (stats = r.stats)))
        .catch((e) => toasts.error(e));
      void loadUsers();
    }
  });

  async function loadInvites() {
    try {
      invites = await api.get<Invite[]>("/api/invites");
    } catch (e) {
      toasts.error(e);
    }
  }
  async function loadUsers() {
    try {
      users = await api.get<AdminUser[]>(`/api/admin/users?q=${encodeURIComponent(search)}`);
    } catch (e) {
      toasts.error(e);
    }
  }

  async function createInvite() {
    try {
      const inv = await api.post<Invite>("/api/invites", {
        rank: iRank,
        maxUses: Number(iUses) > 0 ? Math.round(Number(iUses)) : null,
        days: Number(iDays) > 0 ? Number(iDays) : null,
        note: iNote.trim() || null,
      });
      iNote = "";
      invites = [inv, ...invites];
      void copy(inviteUrl(inv.code), inv.code);
      toasts.show("Приглашение создано и скопировано", { kind: "ok", ms: 1800 });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function revoke(code: string) {
    try {
      await api.del(`/api/invites/${encodeURIComponent(code)}`);
      invites = invites.filter((i) => i.code !== code);
    } catch (e) {
      toasts.error(e);
    }
  }

  async function copy(text: string, key: string) {
    if (await copyText(text)) {
      copied = key;
      setTimeout(() => (copied = null), 1500);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    try {
      const r = await api.patch<{ settings: ServerSettings; stats: ServerStats }>("/api/admin/settings", {
        name: settings.name,
        registration: settings.registration,
        defaultRank: settings.defaultRank,
        limits: Object.fromEntries(RANKS.filter((k) => k !== "owner" && (k !== "admin" || owner)).map((k) => [k, settings!.limits[k]])),
      });
      settings = r.settings;
      stats = r.stats;
      dirty = false;
      void session.load();
      toasts.show("Настройки сервера сохранены", { kind: "ok", ms: 1500 });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function patchUser(u: AdminUser, patch: { rank?: Rank; banned?: boolean }) {
    if (patch.banned && !(await ask({ title: `Заблокировать ${u.name}?`, text: "Все сеансы закроются, войти снова не получится, пока не разблокируете.", ok: "Заблокировать", danger: true }))) return;
    try {
      await api.patch(`/api/admin/users/${u.id}`, patch);
      await loadUsers();
    } catch (e) {
      toasts.error(e);
    }
  }

  async function logoutUser(u: AdminUser) {
    try {
      await api.post(`/api/admin/users/${u.id}/logout`);
      await loadUsers();
      toasts.show(`${u.name}: все сеансы закрыты`, { kind: "ok", ms: 1500 });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function transfer(u: AdminUser) {
    if (!(await ask({ title: `Передать сервер ${u.name}?`, text: "Этот человек станет владельцем сервера, вы — администратором.", ok: "Передать", danger: true }))) return;
    try {
      await api.post("/api/admin/transfer", { userId: u.id });
      await session.load();
      await loadUsers();
    } catch (e) {
      toasts.error(e);
    }
  }

  const LIMIT_FIELDS: { k: keyof RankLimits; label: string; num?: boolean; unit?: string }[] = [
    { k: "boards", label: "Досок", num: true },
    { k: "uploadMB", label: "Файл", num: true, unit: "МБ" },
    { k: "storageMB", label: "Место", num: true, unit: "МБ" },
    { k: "members", label: "Людей на доске", num: true },
    { k: "create", label: "Создаёт доски" },
    { k: "upload", label: "Загружает файлы" },
    { k: "invite", label: "Приглашает" },
  ];
  const lim = (n: number, unit = "") => (n > 0 ? `${n}${unit ? " " + unit : ""}` : "∞");
  const until = (t: number | null) => (t ? (t < Date.now() ? "истекло" : `до ${new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`) : "бессрочно");
</script>

<div class="stack">
  <section class="box">
    <div class="h">Мой ранг: <b>{RANK_LABELS[me.rank]}</b></div>
    <div class="meters">
      <div class="meter">
        <span>Доски</span>
        <b>{me.usage.boards} / {lim(me.limits.boards)}</b>
        {#if me.limits.boards > 0}<i style:width="{Math.min(100, (me.usage.boards / me.limits.boards) * 100)}%"></i>{/if}
      </div>
      <div class="meter">
        <span>Файлы</span>
        <b>{bytes(me.usage.storage)} / {me.limits.storageMB > 0 ? bytes(me.limits.storageMB * 1048576) : "∞"}</b>
        {#if me.limits.storageMB > 0}<i style:width="{Math.min(100, (me.usage.storage / (me.limits.storageMB * 1048576)) * 100)}%"></i>{/if}
      </div>
      <div class="meter"><span>Один файл</span><b>{lim(me.limits.uploadMB, "МБ")}</b></div>
      <div class="meter"><span>Людей на моей доске</span><b>{lim(me.limits.members)}</b></div>
    </div>
  </section>

  {#if canInvite}
    <section class="box">
      <div class="h">Приглашения на сервер</div>
      <div class="row wrap">
        <select class="input" bind:value={iRank} aria-label="Ранг">
          {#each grantable as r (r)}<option value={r}>{RANK_LABELS[r]}</option>{/each}
        </select>
        <input class="input n" inputmode="numeric" placeholder="∞" bind:value={iUses} aria-label="Сколько входов" title="Сколько раз можно использовать" />
        <input class="input n" inputmode="decimal" placeholder="∞" bind:value={iDays} aria-label="Дней" title="Сколько дней действует" />
        <input class="input grow" placeholder="Заметка: кому" maxlength="80" bind:value={iNote} />
        <button class="btn primary" onclick={createInvite}><Plus size={16} /> Создать</button>
      </div>
      <div class="hint">Ранг · входов · дней. Ссылка вида <code>/?invite=код</code> откроет вход с уже вписанным кодом.</div>
      <div class="list">
        {#each invites as i (i.code)}
          {@const dead = (i.expiresAt && i.expiresAt < Date.now()) || (i.maxUses && i.uses >= i.maxUses)}
          <div class="item" class:dead>
            <code class="code">{i.code}</code>
            <div class="grow small">
              {RANK_LABELS[i.rank]} · {i.uses}{i.maxUses ? `/${i.maxUses}` : ""} вх. · {until(i.expiresAt)}{i.note ? ` · ${i.note}` : ""}
            </div>
            <button class="icon-btn sm" aria-label="QR" onclick={() => (qr = qr === i.code ? null : i.code)}><QrCode size={15} /></button>
            <button class="icon-btn sm" aria-label="Копировать ссылку" onclick={() => copy(inviteUrl(i.code), i.code)}>{#if copied === i.code}<Check size={15} />{:else}<Copy size={15} />{/if}</button>
            <button class="icon-btn sm" aria-label="Отозвать" onclick={() => revoke(i.code)}><Trash2 size={15} /></button>
          </div>
          {#if qr === i.code}<div class="qr"><QR text={inviteUrl(i.code)} size={150} /></div>{/if}
        {/each}
      </div>
    </section>
  {/if}

  {#if admin && settings}
    {#if stats}
      <div class="stats">
        <div><b>{stats.users}</b><span>людей</span></div>
        <div><b>{stats.boards}</b><span>досок</span></div>
        <div><b>{stats.files}</b><span>файлов</span></div>
        <div><b>{bytes(stats.storage)}</b><span>занято</span></div>
        <div><b>{stats.online}</b><span>онлайн</span></div>
      </div>
    {/if}
    <section class="box">
      <div class="h">Сервер</div>
      <label class="field">
        <span class="label">Название</span>
        <input class="input" maxlength="60" bind:value={settings.name} oninput={() => (dirty = true)} />
      </label>
      <div class="field">
        <span class="label">Регистрация</span>
        <div class="seg">
          {#each [["open", "Открыта"], ["invite", "По приглашениям"], ["closed", "Закрыта"]] as [v, l] (v)}
            <button class:on={settings.registration === v} onclick={() => ((settings!.registration = v as ServerSettings["registration"]), (dirty = true))}>{l}</button>
          {/each}
        </div>
        <span class="hint">«По приглашениям» — нужен код сервера или приглашение на доску (тогда — гостем). «Закрыта» — только по коду.</span>
      </div>
      <label class="field">
        <span class="label">Ранг новичков без кода</span>
        <select class="input" bind:value={settings.defaultRank} onchange={() => (dirty = true)}>
          {#each ["guest", "member", "vip"] as const as r (r)}<option value={r}>{RANK_LABELS[r]}</option>{/each}
        </select>
      </label>
      <div class="label">Лимиты рангов <span class="hint">· 0 — без ограничения</span></div>
      <div class="limits">
        <div class="lh"></div>
        {#each LIMIT_FIELDS as f (f.k)}<div class="lh">{f.label}{f.unit ? `, ${f.unit}` : ""}</div>{/each}
        {#each RANKS.filter((r) => r !== "owner") as r (r)}
          <div class="lr">{RANK_LABELS[r]}</div>
          {#each LIMIT_FIELDS as f (f.k)}
            <div class="lc">
              {#if f.num}
                <input class="input sm" type="number" min="0" disabled={r === "admin" && !owner} bind:value={settings.limits[r][f.k] as number} oninput={() => (dirty = true)} />
              {:else}
                <input type="checkbox" disabled={r === "admin" && !owner} bind:checked={settings.limits[r][f.k] as boolean} onchange={() => (dirty = true)} />
              {/if}
            </div>
          {/each}
        {/each}
      </div>
      <div class="row end"><button class="btn primary" disabled={!dirty} onclick={saveSettings}>Сохранить</button></div>
    </section>

    <section class="box">
      <div class="h">Люди</div>
      <input class="input" placeholder="Поиск по имени или логину" bind:value={search} oninput={() => void loadUsers()} />
      <div class="list tall">
        {#each users as u (u.id)}
          <div class="item" class:dead={u.banned}>
            <Avatar name={u.name} color={u.color} size={28} />
            <div class="grow">
              <div class="nm">{u.name}{u.login ? ` · ${u.login}` : ""}{u.id === me.id ? " · вы" : ""}</div>
              <div class="small">
                {u.banned ? "заблокирован · " : ""}досок {u.boards} · {bytes(u.storage)} · сеансов {u.sessions} · был(а) {ago(u.seenAt)}
              </div>
            </div>
            {#if u.id !== me.id && rankRank(u.rank) < rankRank(me.rank)}
              <select class="input sm rank" value={u.rank} onchange={(e) => patchUser(u, { rank: e.currentTarget.value as Rank })} aria-label="Ранг">
                {#each grantable.filter((r) => rankRank(r) < rankRank(me.rank)) as r (r)}<option value={r}>{RANK_LABELS[r]}</option>{/each}
              </select>
              <button class="btn ghost sm" onclick={() => logoutUser(u)} title="Закрыть все сеансы">Выйти</button>
              <button class="btn ghost sm" class:danger-text={!u.banned} onclick={() => patchUser(u, { banned: !u.banned })}>{u.banned ? "Разблок." : "Блок"}</button>
              {#if owner}<button class="btn ghost sm" onclick={() => transfer(u)} title="Сделать владельцем сервера">👑</button>{/if}
            {:else}
              <span class="small rk">{RANK_LABELS[u.rank]}</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .stack {
    display: grid;
    gap: 14px;
  }
  .box {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: var(--r-3);
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .h {
    font-weight: 600;
    font-size: 14px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .row.end {
    justify-content: flex-end;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .n {
    width: 64px;
  }
  .field {
    display: grid;
    gap: 6px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-3);
  }
  .hint,
  .small {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.45;
  }
  .seg {
    display: flex;
  }
  .seg > button {
    flex: 1;
  }
  .meters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .meter {
    position: relative;
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: var(--r-2);
    background: var(--surface-3, rgb(255 255 255 / 0.04));
    overflow: hidden;
    font-size: 12px;
    color: var(--ink-3);
  }
  .meter b {
    color: var(--ink);
    font-size: 13.5px;
  }
  .meter i {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: var(--accent);
  }
  .list {
    display: grid;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
  }
  .list.tall {
    max-height: 360px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    border-radius: var(--r-2);
  }
  .item:hover {
    background: var(--hover);
  }
  .dead {
    opacity: 0.5;
  }
  .code {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--hover);
  }
  .nm {
    font-size: 13.5px;
    font-weight: 560;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rank {
    width: auto;
    max-width: 130px;
  }
  .rk {
    padding: 0 6px;
  }
  .qr {
    display: grid;
    place-items: center;
    padding: 10px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .stats div {
    display: grid;
    text-align: center;
    padding: 8px 4px;
    border-radius: var(--r-2);
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .stats b {
    font-size: 15px;
  }
  .stats span {
    font-size: 11px;
    color: var(--ink-3);
  }
  .limits {
    display: grid;
    grid-template-columns: 96px repeat(7, minmax(44px, 1fr));
    gap: 4px;
    align-items: center;
    overflow-x: auto;
    font-size: 11.5px;
  }
  .lh {
    color: var(--ink-3);
    font-size: 10.5px;
    line-height: 1.2;
    text-align: center;
  }
  .lr {
    font-weight: 600;
    font-size: 12px;
  }
  .lc {
    display: grid;
    place-items: center;
  }
  .lc .input {
    width: 100%;
    padding: 0 4px;
    text-align: center;
  }
  .lc input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
  .danger-text {
    color: var(--danger);
  }
  @media (max-width: 520px) {
    .meters {
      grid-template-columns: 1fr;
    }
    .stats {
      grid-template-columns: repeat(3, 1fr);
    }
    .limits {
      grid-template-columns: 84px repeat(7, 56px);
    }
  }
</style>
