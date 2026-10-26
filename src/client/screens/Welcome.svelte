<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import type { Me } from "../../shared/types.ts";
  import { randomPersonColor } from "../../shared/colors.ts";
  import { api, errorText } from "../lib/api.ts";
  import { router } from "../lib/router.svelte.ts";
  import { session } from "../lib/session.svelte.ts";
  import ColorDots from "../ui/ColorDots.svelte";
  import Logo from "../ui/Logo.svelte";

  let mode = $state<"guest" | "login">("guest");
  let name = $state("");
  let color = $state(randomPersonColor());
  let invite = $state(new URLSearchParams(location.search).get("invite") ?? "");
  let login = $state("");
  let password = $state("");
  let busy = $state(false);
  let error = $state("");

  const toBoard = router.route.name === "board";

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    busy = true;
    try {
      const me =
        mode === "guest"
          ? await api.post<Me>("/api/auth/guest", { name: name.trim(), color, invite: invite || undefined })
          : await api.post<Me>("/api/auth/login", { login: login.trim(), password });
      session.me = me;
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }
</script>

<main class="welcome">
  <div class="backdrop" aria-hidden="true">
    <div class="card c1"></div>
    <div class="card c2"></div>
    <div class="card c3"></div>
    <div class="card c4"></div>
    <svg class="links" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
      <path d="M260 250 C 420 240, 470 420, 610 430" />
      <path d="M760 520 C 880 520, 900 330, 1010 300" />
    </svg>
  </div>

  <form class="panel" onsubmit={submit}>
    <div class="brand">
      <Logo size={40} />
      <div>
        <h1>SPACE</h1>
        <p>Бесконечная доска для мыслей, файлов и совместной работы</p>
      </div>
    </div>

    {#if toBoard}
      <div class="note">Вас пригласили на доску. Представьтесь, чтобы войти — другие увидят ваше имя и курсор.</div>
    {/if}

    {#if mode === "guest"}
      <label class="field">
        <span class="label">Как вас зовут?</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input lg" bind:value={name} maxlength="40" placeholder="Имя" autocomplete="nickname" autofocus required />
      </label>
      <div class="field">
        <span class="label">Ваш цвет</span>
        <ColorDots bind:value={color} />
      </div>
      {#if session.info?.inviteRequired}
        <label class="field">
          <span class="label">Код приглашения</span>
          <input class="input" bind:value={invite} placeholder="Спросите у владельца сервера" required />
        </label>
      {/if}
    {:else}
      <label class="field">
        <span class="label">Логин</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" bind:value={login} autocomplete="username" autofocus required />
      </label>
      <label class="field">
        <span class="label">Пароль</span>
        <input class="input" type="password" bind:value={password} autocomplete="current-password" required />
      </label>
    {/if}

    {#if error}<div class="error" role="alert">{error}</div>{/if}

    <button class="btn primary lg block" disabled={busy || (mode === "guest" && !name.trim())}>
      {#if busy}<span class="spin"></span>{:else}{mode === "guest" ? "Начать" : "Войти"} <ArrowRight size={17} />{/if}
    </button>

    <div class="switch-mode">
      {#if mode === "guest"}
        Уже есть аккаунт? <button type="button" onclick={() => ((mode = "login"), (error = ""))}>Войти по логину</button>
      {:else}
        Впервые здесь? <button type="button" onclick={() => ((mode = "guest"), (error = ""))}>Начать без регистрации</button>
      {/if}
    </div>
  </form>
</main>

<style>
  .welcome {
    position: relative;
    height: 100%;
    display: grid;
    place-items: center;
    padding: 20px;
    overflow: hidden;
    background:
      radial-gradient(circle at 1px 1px, var(--bg-dot) 1px, transparent 0) 0 0 / 24px 24px,
      var(--bg);
  }
  .backdrop {
    position: absolute;
    inset: 0;
    pointer-events: none;
    mask-image: radial-gradient(ellipse at center, transparent 18%, black 70%);
  }
  .card {
    position: absolute;
    border-radius: 14px;
    background: var(--card);
    border: 1px solid var(--line-2);
    box-shadow: var(--card-shadow);
    animation: drift 18s ease-in-out infinite alternate;
  }
  .c1 {
    left: 8%;
    top: 18%;
    width: 220px;
    height: 130px;
    background: color-mix(in oklab, var(--c-yellow) var(--tint), var(--card));
  }
  .c2 {
    left: 46%;
    top: 50%;
    width: 180px;
    height: 110px;
    animation-delay: -6s;
  }
  .c3 {
    right: 8%;
    top: 24%;
    width: 200px;
    height: 150px;
    background: color-mix(in oklab, var(--c-violet) var(--tint), var(--card));
    animation-delay: -3s;
  }
  .c4 {
    left: 16%;
    bottom: 10%;
    width: 160px;
    height: 100px;
    background: color-mix(in oklab, var(--c-cyan) var(--tint), var(--card));
    animation-delay: -9s;
  }
  .links {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .links path {
    fill: none;
    stroke: var(--line-3);
    stroke-width: 2;
    stroke-dasharray: 6 8;
  }
  @keyframes drift {
    to {
      transform: translate(14px, -10px) rotate(1.2deg);
    }
  }
  .panel {
    position: relative;
    width: min(420px, 100%);
    display: grid;
    gap: 18px;
    padding: 28px;
    border-radius: 22px;
    background: var(--glass);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    border: 1px solid var(--line-2);
    box-shadow: var(--shadow-3);
    animation: pop-in 300ms var(--ease-out);
  }
  .brand {
    display: flex;
    gap: 14px;
    align-items: center;
    margin-bottom: 4px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 760;
    letter-spacing: 0.12em;
  }
  .brand p {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--ink-2);
  }
  .note {
    padding: 10px 12px;
    border-radius: var(--r-2);
    background: var(--accent-soft);
    color: var(--ink);
    font-size: 13px;
  }
  .input.lg {
    height: 44px;
    font-size: 16px;
  }
  .error {
    color: var(--danger);
    font-size: 13px;
  }
  .switch-mode {
    text-align: center;
    font-size: 13px;
    color: var(--ink-3);
  }
  .switch-mode button {
    color: var(--ink);
    font-weight: 560;
    text-decoration: underline;
    text-decoration-color: var(--line-3);
    text-underline-offset: 3px;
  }
  .switch-mode button:hover {
    text-decoration-color: var(--accent);
  }
</style>
