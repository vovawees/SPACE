<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import { answer, asking } from "./confirm.svelte.ts";
</script>

{#if asking.current}
  {@const a = asking.current}
  <Dialog title={a.title} width={400} onclose={() => answer(false)}>
    {#if a.text}<p class="text">{a.text}</p>{/if}
    {#snippet footer()}
      <button class="btn" onclick={() => answer(false)}>{a.cancel ?? "Отмена"}</button>
      {#if a.danger}
        <button class="btn danger" onclick={() => answer(true)}>{a.ok ?? "Да"}</button>
      {:else}
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn primary" autofocus onclick={() => answer(true)}>{a.ok ?? "Да"}</button>
      {/if}
    {/snippet}
  </Dialog>
{/if}

<style>
  .text {
    margin: 0;
    color: var(--ink-2);
    line-height: 1.5;
  }
</style>
