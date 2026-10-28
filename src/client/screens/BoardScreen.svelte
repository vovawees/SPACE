<script lang="ts">
  /* Экран доски: сначала узнаём, есть ли доступ (заодно вступаем по ссылке),
     потом поднимаем саму доску. Без связи открывается копия с устройства. */
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Lock from "@lucide/svelte/icons/lock";
  import { onMount } from "svelte";
  import type { BoardSummary } from "../../shared/types.ts";
  import BoardView from "../board/BoardView.svelte";
  import { api, ApiError } from "../lib/api.ts";
  import { router } from "../lib/router.svelte.ts";
  import "../styles/board.css";
  import "../styles/content.css";
  import "../styles/chrome.css";
  import "../styles/nodes.css";
  import "../styles/widgets.css";
  import "../styles/play.css";
  import "../styles/inspector.css";
  import "../styles/custom.css";

  let { id, focus, invite }: { id: string; focus?: string; invite?: string } = $props();

  let phase = $state<"loading" | "ready" | "missing" | "denied">("loading");
  let summary = $state<BoardSummary | null>(null);
  let message = $state("");

  onMount(() => {
    let alive = true;
    // приглашение ?k=… — сначала вступаем с его ролью, потом убираем код из адреса
    const load = invite
      ? api.post<BoardSummary>(`/api/boards/${id}/join`, { token: invite }).finally(() => {
          const u = new URL(location.href);
          u.searchParams.delete("k");
          history.replaceState(null, "", u.pathname + u.search);
        })
      : api.get<BoardSummary>(`/api/boards/${id}`);
    load
      .then((s) => {
        if (!alive) return;
        summary = s;
        phase = "ready";
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) phase = "missing";
        else if (e instanceof ApiError && (e.status === 403 || e.status === 401 || e.status === 410)) {
          message = e.message;
          phase = "denied";
        } else phase = "ready"; // нет связи — работаем с локальной копией
      });
    return () => (alive = false);
  });
</script>

{#if phase === "loading"}
  <div class="state"><div class="spin"></div></div>
{:else if phase === "ready"}
  <BoardView {id} {focus} {summary} />
{:else}
  <div class="state">
    <div class="card">
      <div class="icon"><Lock size={22} /></div>
      <h1>{phase === "missing" ? "Доска не найдена" : "Нет доступа"}</h1>
      <p>
        {#if phase === "missing"}
          Возможно, её удалили или в ссылке опечатка.
        {:else}
          {message || "Владелец не открыл доступ по ссылке."} Попросите его прислать приглашение.
        {/if}
      </p>
      <button class="btn" onclick={() => router.go("/")}><ArrowLeft size={16} /> К моим доскам</button>
    </div>
  </div>
{/if}

<style>
  .state {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg);
  }
  .card {
    max-width: 360px;
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 10px;
  }
  .icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: var(--ink-2);
    background: var(--surface-2);
    border: 1px solid var(--line);
    margin-bottom: 4px;
  }
  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 640;
    letter-spacing: -0.015em;
  }
  p {
    margin: 0 0 8px;
    color: var(--ink-2);
    font-size: 14px;
    line-height: 1.5;
  }
</style>
