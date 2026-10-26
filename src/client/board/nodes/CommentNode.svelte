<script lang="ts">
  /* Булавка комментария. Обсуждение открывается рядом, когда булавка
     выделена (CommentThread). */
  import Check from "@lucide/svelte/icons/check";
  import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
  import { initials } from "../../lib/util.ts";
  import { threadOf } from "./comment.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const thread = $derived(threadOf(v.props));
  const first = $derived(thread[0]);
  const authors = $derived([...new Map(thread.map((m) => [m.u, m])).values()].slice(0, 3));
</script>

<div class="pin" class:sel class:resolved={v.props.resolved} class:empty={!first} style:--pc={first?.c ?? "var(--accent)"}>
  {#if v.props.resolved}
    <Check size={17} strokeWidth={2.6} />
  {:else if first}
    <span class="pin-who">{initials(first.n)}</span>
  {:else}
    <MessageSquarePlus size={17} />
  {/if}
  {#if thread.length > 1}<span class="pin-n">{thread.length}</span>{/if}
  {#if authors.length > 1 && !v.props.resolved}
    <span class="pin-more">
      {#each authors.slice(1) as a (a.u)}<i style:background={a.c}></i>{/each}
    </span>
  {/if}
</div>
