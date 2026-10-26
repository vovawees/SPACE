<script lang="ts">
  /* Кнопка: нажать может любой участник, выделять не нужно. Нажатие
     видят все (кнопка «щёлкает» и показывает, кто нажал), а стрелки с
     логикой выполняют свои действия. Может вести на объект или адрес. */
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { untrack } from "svelte";
  import { plural } from "../../lib/util.ts";
  import { useBoard } from "../board.svelte.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { pressButton } from "./widgets.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const k = $derived(Math.max(0.45, Math.min(v.w / 200, v.h / 72)));
  const count = $derived(p.press?.s ?? 0);
  const renaming = $derived(b.ix.renaming === v.id);
  const foot = $derived(v.h >= 96);
  let hits = $state(0);
  let who = $state<{ n: string; c: string } | null>(null);
  let last = -1;
  let whoTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const c = count;
    if (last >= 0 && c > last) {
      untrack(() => hits++);
      const pr = untrack(() => p.press);
      if (pr) {
        who = { n: pr.n, c: pr.c };
        clearTimeout(whoTimer);
        whoTimer = setTimeout(() => (who = null), 1600);
      }
    }
    last = c;
  });
  $effect(() => () => clearTimeout(whoTimer));

  function press(e: MouseEvent) {
    e.stopPropagation();
    pressButton(b, v);
  }
</script>

<div class="card btn-card v-{p.bv ?? 'solid'}" style:--k={k}>
  {#if renaming}
    <div class="big-btn"><TitleEdit {v} placeholder="Кнопка" /></div>
  {:else}
    <button class="big-btn" data-ui disabled={b.readonly} onclick={press} title={p.href ? `Ведёт: ${p.href.startsWith("#") ? "к объекту на доске" : p.href}` : undefined}>
      {#key hits}<span class="big-btn-ripple" class:on={hits > 0}></span>{/key}
      {#if p.emoji}<span class="big-btn-emoji">{p.emoji}</span>{/if}
      <span class="big-btn-label">{p.title || "Кнопка"}</span>
      {#if p.href && !p.href.startsWith("#")}<ExternalLink size={14} />{/if}
    </button>
  {/if}
  {#if foot}
    <div class="btn-foot">{count ? `${count} ${plural(count, "нажатие", "нажатия", "нажатий")}${p.press?.n ? ` · последним — ${p.press.n}` : ""}` : "Ещё не нажимали"}</div>
  {/if}
  {#if who}
    <span class="btn-who" style:--pc={who.c}>{who.n}</span>
  {/if}
</div>
