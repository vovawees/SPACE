<script lang="ts">
  import ServerPanel from "./ServerPanel.svelte";
  import { untrack } from "svelte";
  import Copy from "@lucide/svelte/icons/copy";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Smartphone from "@lucide/svelte/icons/smartphone";
  import type { Me } from "../../shared/types.ts";
  import { api, errorText } from "../lib/api.ts";
  import { ACCENTS } from "../lib/look.svelte.ts";
  import { session, type GridStyle, type WheelMode } from "../lib/session.svelte.ts";
  import { toasts } from "../lib/toast.svelte.ts";
  import { copyText } from "../lib/util.ts";
  import ColorDots from "./ColorDots.svelte";
  import Dialog from "./Dialog.svelte";
  import QR from "./QR.svelte";

  let { onclose, tab: initialTab = "profile" }: { onclose: () => void; tab?: "profile" | "login" | "view" | "server" } = $props();
  let tab = $state<"profile" | "login" | "view" | "server">(untrack(() => initialTab));
  const me = session.me!;
  let name = $state(me.name);
  let color = $state(me.color);
  let login = $state(me.login ?? "");
  let password = $state("");
  let current = $state("");
  let busy = $state(false);
  let error = $state("");
  let link = $state<{ url: string; expiresAt: number } | null>(null);

  async function saveProfile() {
    if (name.trim() === session.me?.name && color === session.me?.color) return;
    try {
      session.me = await api.patch<Me>("/api/me", { name: name.trim(), color });
      toasts.show("Профиль сохранён", { kind: "ok" });
    } catch (e) {
      toasts.error(e);
    }
  }

  async function saveCredentials(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = "";
    try {
      session.me = await api.put<Me>("/api/me/credentials", {
        login: login.trim(),
        password,
        current: session.me?.hasPassword ? current : undefined,
      });
      password = "";
      current = "";
      toasts.show("Логин и пароль сохранены", { kind: "ok" });
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  async function makeLink() {
    try {
      const r = await api.post<{ token: string; expiresAt: number }>("/api/me/login-link");
      link = { url: `${location.origin}/login/${r.token}`, expiresAt: r.expiresAt };
    } catch (e) {
      toasts.error(e);
    }
  }

  async function logoutOthers() {
    try {
      await api.post("/api/me/logout-others");
      toasts.show("Другие устройства отключены", { kind: "ok" });
    } catch (e) {
      toasts.error(e);
    }
  }

  const grids: [GridStyle, string][] = [
    ["dots", "Точки"],
    ["lines", "Линии"],
    ["cross", "Крестики"],
  ];
  type Flag = "grid" | "glow" | "snap" | "smartDraw" | "minimap" | "cursorNames" | "peerSelection" | "reduceMotion";
  const flags: [Flag, string, string][] = [
    ["glow", "Свечение под группами", "Мягкий цветной ореол под скоплениями карточек"],
    ["snap", "Прилипание", "Направляющие и выравнивание при перетаскивании"],
    ["smartDraw", "Умное рисование", "Линии, стрелки и фигуры распознаются из штриха"],
    ["minimap", "Мини-карта", ""],
    ["cursorNames", "Имена у курсоров", "Подписи рядом с курсорами участников"],
    ["peerSelection", "Чужие выделения", "Рамка с именем вокруг того, что выбрал участник"],
    ["reduceMotion", "Меньше анимации", "Без плавных перелётов камеры и всплывающих эффектов"],
  ];
  const wheels: [WheelMode, string][] = [
    ["auto", "Авто"],
    ["zoom", "Масштаб"],
    ["pan", "Прокрутка"],
  ];
  const s = session.settings;
</script>

<Dialog title="Настройки" width={540} {onclose}>
  <div class="seg tabs">
    <button class:on={tab === "profile"} onclick={() => (tab = "profile")}>Профиль</button>
    <button class:on={tab === "login"} onclick={() => (tab = "login")}>Вход</button>
    <button class:on={tab === "view"} onclick={() => (tab = "view")}>Вид</button>
    <button class:on={tab === "server"} onclick={() => (tab = "server")}>Сервер</button>
  </div>

  {#if tab === "profile"}
    <div class="stack">
      <label class="field">
        <span class="label">Имя</span>
        <input class="input" bind:value={name} maxlength="40" onblur={saveProfile} onkeydown={(e) => e.key === "Enter" && saveProfile()} />
      </label>
      <div class="field">
        <span class="label">Цвет курсора и аватара</span>
        <ColorDots bind:value={color} />
      </div>
      <div class="row end">
        <button class="btn primary" onclick={saveProfile}>Сохранить</button>
      </div>
      <div class="divider"></div>
      <button class="btn ghost danger-text" onclick={() => session.logout()}>
        <LogOut size={16} /> Выйти на этом устройстве
      </button>
    </div>
  {:else if tab === "server"}
    <ServerPanel />
  {:else if tab === "login"}
    <div class="stack">
      <section class="box">
        <div class="box-title"><Smartphone size={17} /> Войти на телефоне или другом компьютере</div>
        <p class="muted small">Одноразовая ссылка на 10 минут. Отсканируйте QR-код камерой телефона.</p>
        {#if link}
          <div class="qr-row">
            <QR text={link.url} size={168} />
            <div class="qr-side">
              <code class="link">{link.url}</code>
              <button
                class="btn sm"
                onclick={async () => (await copyText(link!.url)) && toasts.show("Ссылка скопирована", { kind: "ok" })}
              >
                <Copy size={14} /> Скопировать
              </button>
            </div>
          </div>
        {:else}
          <button class="btn" onclick={makeLink}>Показать QR-код</button>
        {/if}
      </section>

      <form class="box" onsubmit={saveCredentials}>
        <div class="box-title">{session.me?.hasPassword ? "Логин и пароль" : "Задать логин и пароль"}</div>
        <p class="muted small">Чтобы входить в свой аккаунт откуда угодно. Без них аккаунт живёт только в этом браузере.</p>
        <label class="field">
          <span class="label">Логин</span>
          <input class="input" bind:value={login} autocomplete="username" required />
        </label>
        {#if session.me?.hasPassword}
          <label class="field">
            <span class="label">Текущий пароль</span>
            <input class="input" type="password" bind:value={current} autocomplete="current-password" required />
          </label>
        {/if}
        <label class="field">
          <span class="label">{session.me?.hasPassword ? "Новый пароль" : "Пароль"}</span>
          <input class="input" type="password" bind:value={password} autocomplete="new-password" minlength="6" required />
        </label>
        {#if error}<div class="error">{error}</div>{/if}
        <div class="row end">
          <button class="btn primary" disabled={busy}>Сохранить</button>
        </div>
      </form>

      <button class="btn ghost" onclick={logoutOthers}>Выйти на всех других устройствах</button>
    </div>
  {:else}
    <div class="stack">
      <div class="opt">
        <span>Акцент <small>Цвет кнопок, выделения и подсветки</small></span>
        <div class="accents" role="radiogroup" aria-label="Акцент">
          {#each ACCENTS as a (a.id)}
            <button
              class="acc"
              class:on={s.accent === a.id}
              style:--c={a.color}
              role="radio"
              aria-checked={s.accent === a.id}
              aria-label={a.label}
              title={a.label}
              onclick={() => (s.accent = a.id)}
            ></button>
          {/each}
        </div>
      </div>
      <div class="opt">
        <span>Сетка <small>Фон доски меняется в меню доски — его видят все</small></span>
        <div class="seg">
          <button class:on={!s.grid} onclick={() => (s.grid = false)}>Нет</button>
          {#each grids as [v, label] (v)}
            <button class:on={s.grid && s.gridStyle === v} onclick={() => ((s.grid = true), (s.gridStyle = v))}>{label}</button>
          {/each}
        </div>
      </div>
      <div class="opt">
        <span>Колесо мыши <small>Авто: мышь — масштаб, тачпад — прокрутка</small></span>
        <div class="seg">
          {#each wheels as [v, label] (v)}
            <button class:on={s.wheel === v} onclick={() => (s.wheel = v)}>{label}</button>
          {/each}
        </div>
      </div>
      {#each flags as [k, label, hint] (k)}
        <button class="opt" onclick={() => (s[k] = !s[k])}>
          <span>{label}{#if hint}<small>{hint}</small>{/if}</span>
          <span class="switch" class:on={s[k]}></span>
        </button>
      {/each}
    </div>
  {/if}
</Dialog>

<style>
  .tabs {
    width: 100%;
    margin-bottom: 18px;
  }
  .tabs > button {
    flex: 1;
    justify-content: center;
  }
  .stack {
    display: grid;
    gap: 14px;
  }
  .row.end {
    justify-content: flex-end;
  }
  .box {
    display: grid;
    gap: 12px;
    padding: 14px;
    border-radius: var(--r-3);
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .box-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .small {
    font-size: 12.5px;
    margin: -6px 0 0;
  }
  .qr-row {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .qr-side {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .link {
    font-size: 11.5px;
    word-break: break-all;
    color: var(--ink-2);
  }
  .error {
    color: var(--danger);
    font-size: 13px;
  }
  .danger-text {
    color: var(--danger);
    justify-self: start;
  }
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 40px;
    text-align: left;
    width: 100%;
  }
  .opt > span:first-child {
    display: grid;
    gap: 2px;
  }
  .opt small {
    font-size: 12px;
    color: var(--ink-3);
  }
  .accents {
    display: flex;
    gap: 6px;
  }
  .acc {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--c);
    box-shadow:
      0 0 0 2px var(--surface-1),
      0 0 0 3px transparent;
    transition:
      transform var(--t-fast) var(--ease-out),
      box-shadow var(--t-fast);
  }
  .acc:hover {
    transform: scale(1.12);
  }
  .acc.on {
    box-shadow:
      0 0 0 2px var(--surface-1),
      0 0 0 4px var(--c);
  }
  @media (max-width: 560px) {
    .opt {
      flex-wrap: wrap;
    }
  }
</style>
