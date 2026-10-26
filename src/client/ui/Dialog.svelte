<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Props {
    title?: string;
    width?: number;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    side?: boolean;
  }
  let { title, width = 440, onclose, children, footer, side = false }: Props = $props();
  let box: HTMLDivElement;
  let prevFocus: Element | null = null;

  onMount(() => {
    prevFocus = document.activeElement;
    const first = box.querySelector<HTMLElement>("[autofocus], input, textarea, select, button:not(.close)");
    (first ?? box).focus({ preventScroll: true });
    return () => (prevFocus as HTMLElement | null)?.focus?.({ preventScroll: true });
  });

  function onkey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onclose();
    }
    if (e.key === "Tab") {
      const f = [...box.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href], [tabindex]:not([tabindex='-1'])")].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        f[f.length - 1]!.focus();
        e.preventDefault();
      } else if (!e.shiftKey && i === f.length - 1) {
        f[0]!.focus();
        e.preventDefault();
      }
    }
  }
</script>

<div class="backdrop" class:side onpointerdown={(e) => e.target === e.currentTarget && onclose()}>
  <div
    class="dialog"
    bind:this={box}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    style:--w="{width}px"
    onkeydown={onkey}
  >
    {#if title}
      <header>
        <h2>{title}</h2>
        <button class="icon-btn sm close" onclick={onclose} aria-label="Закрыть"><X size={17} /></button>
      </header>
    {/if}
    <div class="body">
      {@render children()}
    </div>
    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(0 0 0 / 0.42);
    animation: fade-in 150ms ease-out;
  }
  .dialog {
    width: min(var(--w), 100%);
    max-height: min(86vh, 900px);
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border: 1px solid var(--line-2);
    border-radius: var(--r-4);
    box-shadow: var(--shadow-3);
    animation: pop-in 180ms var(--ease-out);
    overflow: hidden;
    outline: none;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 14px 4px 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 640;
    letter-spacing: -0.01em;
  }
  .body {
    padding: 12px 20px 20px;
    overflow-y: auto;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--line);
    background: var(--surface-2);
  }
  @media (max-width: 560px) {
    .backdrop {
      place-items: end stretch;
      padding: 0;
    }
    .dialog {
      width: 100%;
      max-height: 92vh;
      border-radius: var(--r-4) var(--r-4) 0 0;
      animation: sheet-in 220ms var(--ease-out);
    }
  }
  @keyframes sheet-in {
    from {
      transform: translateY(30%);
      opacity: 0;
    }
  }
</style>
