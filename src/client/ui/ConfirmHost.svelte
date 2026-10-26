<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import { answer, asking } from "./confirm.svelte.ts";
</script>

{#if asking.current}
  {@const a = asking.current}
  <Dialog title={a.title} width={400} onclose={() => answer(false)}>
    {#if a.text}<p class="text">{a.text}</p>{/if}
    {#if a.input}
      {#if a.input.multiline}
        <!-- svelte-ignore a11y_autofocus -->
        <textarea class="input area" rows="4" placeholder={a.input.placeholder} bind:value={asking.current!.value} autofocus
          onkeydown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) answer(true); }}></textarea>
      {:else}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" type={a.input.type ?? "text"} placeholder={a.input.placeholder} bind:value={asking.current!.value} autofocus
          onkeydown={(e) => { if (e.key === "Enter") answer(true); }} />
      {/if}
    {/if}
    {#snippet footer()}
      <button class="btn" onclick={() => answer(false)}>{a.cancel ?? "Отмена"}</button>
      {#if a.danger}
        <button class="btn danger" onclick={() => answer(true)}>{a.ok ?? "Да"}</button>
      {:else}
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn primary" autofocus={!a.input} onclick={() => answer(true)}>{a.ok ?? "Да"}</button>
      {/if}
    {/snippet}
  </Dialog>
{/if}

<style>
  .input {
    width: 100%;
    margin-top: 4px;
  }
  .area {
    resize: vertical;
    min-height: 90px;
    padding: 8px 10px;
    font: inherit;
  }
  .text {
    margin: 0;
    color: var(--ink-2);
    line-height: 1.5;
  }
</style>
