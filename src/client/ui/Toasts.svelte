<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { toasts } from "../lib/toast.svelte.ts";
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div class="toast glass" class:error={t.kind === "error"} class:ok={t.kind === "ok"}>
      <span class="text">{t.text}</span>
      {#if t.progress !== undefined}
        <span class="bar"><span style:width="{Math.round(t.progress * 100)}%"></span></span>
      {/if}
      {#if t.action}
        <button
          class="act"
          onclick={() => {
            t.action?.run();
            toasts.close(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="x" onclick={() => toasts.close(t.id)} aria-label="Закрыть"><X size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(var(--toast-bottom, 86px) + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    transition: bottom 160ms var(--ease-out);
    z-index: var(--z-toast);
    display: grid;
    gap: 8px;
    justify-items: center;
    pointer-events: none;
    width: min(520px, calc(100vw - 24px));
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 6px 6px 6px 14px;
    border-radius: var(--r-3);
    font-size: 13.5px;
    animation: pop-in 180ms var(--ease-out);
    max-width: 100%;
  }
  .toast.error {
    border-color: color-mix(in oklab, var(--danger) 40%, transparent);
  }
  .toast.error .text::before {
    content: "";
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--danger);
    margin-right: 9px;
    vertical-align: 1px;
  }
  .toast.ok .text::before {
    content: "";
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
    margin-right: 9px;
    vertical-align: 1px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .bar {
    width: 80px;
    height: 4px;
    border-radius: 4px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 200ms;
  }
  .act {
    height: 28px;
    padding: 0 10px;
    border-radius: 7px;
    font-weight: 600;
    font-size: 13px;
    color: var(--accent);
  }
  .act:hover {
    background: var(--accent-soft);
  }
  .x {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: var(--ink-3);
  }
  .x:hover {
    background: var(--hover);
    color: var(--ink);
  }
</style>
