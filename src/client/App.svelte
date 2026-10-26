<script lang="ts">
  import ConfirmHost from "./ui/ConfirmHost.svelte";
  import ColorPopover from "./ui/ColorPopover.svelte";
  import { router } from "./lib/router.svelte.ts";
  import { session } from "./lib/session.svelte.ts";
  import MenuHost from "./ui/MenuHost.svelte";
  import Toasts from "./ui/Toasts.svelte";
  import Welcome from "./screens/Welcome.svelte";
  import Home from "./screens/Home.svelte";
  import LinkLogin from "./screens/LinkLogin.svelte";

  void session.load();
  const BoardScreen = () => import("./screens/BoardScreen.svelte");
</script>

{#if !session.ready}
  <div class="boot"><div class="spin"></div></div>
{:else if router.route.name === "login-link"}
  <LinkLogin token={router.route.token} />
{:else if !session.me}
  <Welcome />
{:else if router.route.name === "board"}
  {#await BoardScreen()}
    <div class="boot"><div class="spin"></div></div>
  {:then mod}
    {#key router.route.id}
      <mod.default id={router.route.id} focus={router.route.focus} invite={router.route.invite} />
    {/key}
  {/await}
{:else if router.route.name === "home"}
  <Home />
{:else}
  <div class="boot notfound">
    <p>Такой страницы нет</p>
    <button class="btn" onclick={() => router.go("/")}>На главную</button>
  </div>
{/if}

<MenuHost />
<ColorPopover />
<ConfirmHost />
<Toasts />

<style>
  .boot {
    height: 100%;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 16px;
  }
  .notfound p {
    color: var(--ink-2);
    margin: 0;
  }
</style>
