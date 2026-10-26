<script lang="ts">
  import type { Me } from "../../shared/types.ts";
  import { api, errorText } from "../lib/api.ts";
  import { router } from "../lib/router.svelte.ts";
  import { session } from "../lib/session.svelte.ts";
  import Logo from "../ui/Logo.svelte";

  let { token }: { token: string } = $props();
  let busy = $state(false);
  let error = $state("");

  async function confirm() {
    busy = true;
    error = "";
    try {
      session.me = await api.post<Me>("/api/auth/link", { token });
      router.go("/", true);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<main class="wrap">
  <div class="panel">
    <Logo size={44} />
    <h1>Вход на этом устройстве</h1>
    <p>Вы открыли ссылку входа в SPACE. Ссылка одноразовая и действует 10 минут.</p>
    {#if session.me}
      <p class="muted">Сейчас здесь вошёл(ла) <b>{session.me.name}</b> — после подтверждения это устройство переключится на аккаунт из ссылки.</p>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
    <div class="row">
      <button class="btn primary lg" onclick={confirm} disabled={busy}>{busy ? "Вхожу…" : "Войти"}</button>
      <button class="btn ghost lg" onclick={() => router.go("/", true)}>Отмена</button>
    </div>
  </div>
</main>

<style>
  .wrap {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .panel {
    width: min(400px, 100%);
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 10px;
    padding: 30px;
    border-radius: 22px;
    background: var(--surface-1);
    border: 1px solid var(--line-2);
    box-shadow: var(--shadow-2);
  }
  h1 {
    margin: 8px 0 0;
    font-size: 19px;
  }
  p {
    margin: 0;
    color: var(--ink-2);
    font-size: 14px;
  }
  .error {
    color: var(--danger);
  }
  .row {
    margin-top: 10px;
  }
</style>
