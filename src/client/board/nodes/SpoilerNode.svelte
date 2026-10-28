<script lang="ts">
  /* Сюрприз: скрытый текст под обложкой — ответ, приз, загадка. Щелчок —
     открыть у всех сразу или (режим «у каждого своё») только у себя. */
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Gift from "@lucide/svelte/icons/gift";
  import { untrack } from "svelte";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { playSound, revealAll } from "./play.ts";
  import { onTap } from "./tap.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const self = $derived(p.sm === "self");
  let mine = $state(false);
  const open = $derived(self ? mine : !!p.on);
  const k = $derived(Math.max(0.5, Math.min(v.w / 280, v.h / 150)));
  const body = $derived(p.bt?.trim() || "Сюрприз! 🎉");
  const fs = $derived(body.length <= 12 ? 30 : body.length <= 30 ? 22 : body.length <= 90 ? 16.5 : 13.5);

  let was = untrack(() => open);
  $effect(() => {
    if (open && !was) playSound(self ? "pop" : "win");
    was = open;
  });

  function reveal() {
    if (open) return;
    if (self) mine = true;
    else if (!b.readonly) revealAll(b, [v.id], true);
  }
  function hide(e: MouseEvent) {
    e.stopPropagation();
    if (self) mine = false;
    else if (!b.readonly) revealAll(b, [v.id], false);
  }
</script>

<div class="card sp-card" class:open style:--k={k} {@attach onTap(reveal)}>
  {#if open}
    <div class="sp-body" style:font-size="{fs * k}px">{body}</div>
    {#if self || !b.readonly}
      <button class="icon-btn sp-hide" data-ui onclick={hide} {@attach tip(self ? "Спрятать у себя" : "Спрятать у всех")} aria-label="Спрятать"><EyeOff size={14} /></button>
    {/if}
  {:else}
    <div class="sp-cover">
      <span class="sp-gift"><Gift size={Math.round(30 * k)} strokeWidth={1.8} /></span>
      <span class="sp-title">{p.title || "Нажмите, чтобы открыть"}</span>
      <span class="sp-hint">{self ? "откроется только у вас" : b.readonly ? "откроет ведущий" : "откроется у всех"}</span>
    </div>
  {/if}
</div>
